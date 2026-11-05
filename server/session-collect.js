/**
 * 会话式岗位检索（Phase 3）：点「查询」= 开一个后台 DSH 会话。
 *
 * 与内建采集器的区别：采集器是插件拉起的确定性脚本；这里改为让宿主 agent
 * 用 jobs-collect skill + 浏览器 MCP 检索，插件只负责三件事：
 *   1. ctx.sessionController.create + rename + prompt（自动发送，不等用户）；
 *   2. 盯会话状态与 feed 行数，结束即自动 ingest（无需再点「整理收件箱」）；
 *   3. 把进度写进 collector-status.json，复用现有 GET /jobs/collect/status 轮询。
 *
 * 状态文件字段沿用采集器契约，额外带 mode:"session"、sessionId、sessionTitle、
 * keyword、feedLines、ingested；state 仍是 running | done | error。
 *
 * @module dsh-upcv-workspace/session-collect
 */
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { ingestFeed } from './jobs.js';
import { DEFAULT_TIMEOUT_MS, STATUS_FILE, writeCollectorStatus } from './collector.js';

/** 会话式检索的超时：15 分钟没结束就停止跟踪（不打断会话本身）。 */
export const SESSION_TIMEOUT_MS = 15 * 60 * 1000;
/** 轮询间隔：与会话状态轮询一致，2 秒。 */
export const MONITOR_INTERVAL_MS = 2000;
/** 进程内监视器：一个数据根同一时刻只允许一个。 */
const monitors = new Map();
const STATUS_MAX_BYTES = 256 * 1024;

function statusFile(root) {
  return join(root, STATUS_FILE);
}

/** 原样读状态文件（不做 running 有效性推导，供会话状态机使用）。 */
function readStatus(root) {
  const file = statusFile(root);
  if (!existsSync(file)) return null;
  try {
    if (statSync(file).size > STATUS_MAX_BYTES) return null;
    const value = JSON.parse(readFileSync(file, 'utf8'));
    return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/** feed 当前行数（文件不存在算 0）；只用来算「本轮新增」。 */
export function feedLineCount(root) {
  const file = join(root, 'jobs-feed.jsonl');
  if (!existsSync(file)) return 0;
  try {
    const text = readFileSync(file, 'utf8');
    return text === '' ? 0 : text.split('\n').filter((line) => line.trim() !== '').length;
  } catch {
    return 0;
  }
}

/** 宿主是否提供可用的会话服务。 */
export function isSessionController(service) {
  return service !== null && service !== undefined
    && typeof service.create === 'function'
    && typeof service.prompt === 'function';
}

/** 发给 agent 的检索指令：要求用 skill + 浏览器 MCP，只读，写同一个 feed。 */
export function sessionPrompt(keyword, root, allowed) {
  const text = String(keyword ?? '').trim();
  const ids = Array.isArray(allowed) ? allowed.filter((id) => typeof id === 'string' && id !== '') : [];
  return [
    '使用 jobs-collect 技能检索岗位。',
    '',
    '关键词：' + (text === '' ? '取 jobs-spec.json 的 defaults.keywords' : text),
    '城市：取 jobs-spec.json 的 defaults.city（不要问用户）',
    '数据根：' + root,
    '',
    '要求：',
    '1. 先读 jobs-spec.json，只跑 enabled 渠道，单渠道最多 2 页；',
    ids.length > 0
      ? '本轮只跑这些渠道 id：' + ids.join('、') + '；其余渠道跳过（未登录 / 已停用），不要尝试、不要反复导航。'
      : '',
    '2. 用浏览器 MCP（mcp__browser__*）打开入口并提取；没有浏览器工具时按技能里的降级步骤处理；',
    '3. 只读：不投递、不沟通、不收藏、不登录新账号、不解风控；',
    '4. 提取优先 JSON-LD JobPosting；没有时用链接文本 + 最近容器，不写平台专属选择器；',
    '5. 把带 sourceUrl 的行追加到 feedPath，不要覆盖；没有链接或公司的条目丢弃并计数；',
    '6. 完成后汇报每个渠道的提取数/丢弃数/页数；不要自己入库，插件会自动 ingest。',
    '如果 jobs-collect 技能不在你的目录里，就按上面要求直接做。',
  ].join('\n');
}

/**
 * 启动一次会话式检索。
 * @param {{root:string, keyword?:string, sessionController:object,
 *          agentStatus?:Function, now?:string, monitor?:boolean}} options
 * @returns {Promise<{started:true, mode:'session', sessionId:string, status:object}
 *                   | {error:string, message?:string}>}
 */
export async function startSessionCollect(options = {}) {
  const root = options.root;
  const sessionController = options.sessionController;
  const now = options.now ?? new Date().toISOString();
  if (typeof root !== 'string' || root === '') {
    return { error: 'store-unavailable', message: '没有配置数据根目录。' };
  }
  if (!isSessionController(sessionController)) {
    return {
      error: 'collector-unavailable',
      message: '宿主没有提供会话服务，无法在后台发起检索；请改用「复制指令」或安装本地采集器。',
    };
  }
  const current = readStatus(root);
  if (current !== null && current.state === 'running') {
    return {
      error: 'collector-running',
      message: '已有一次检索在跑（' + String(current.keyword ?? current.sessionTitle ?? '准备中') + '），等它结束再试。',
    };
  }

  const keyword = String(options.keyword ?? '').trim();
  let created;
  try {
    created = await sessionController.create({ cwd: root });
  } catch (error) {
    return { error: 'collector-spawn-failed', message: '创建后台会话失败：' + String(error?.message ?? error) };
  }
  const sessionId = created !== null && created !== undefined ? created.sessionId : undefined;
  if (typeof sessionId !== 'string' || sessionId === '') {
    return { error: 'collector-spawn-failed', message: '宿主没有返回会话 id，检索未启动。' };
  }

  const sessionTitle = '岗位检索 · ' + (keyword === '' ? '默认关键词' : keyword);
  try {
    if (typeof sessionController.rename === 'function') {
      await sessionController.rename({ sessionId: sessionId, title: sessionTitle });
    }
  } catch { /* 命名失败不影响检索 */ }

  // 先记基线：agent 可能在 prompt 返回后立刻开始写 feed，晚记会把新行算进旧基线。
  const baseline = feedLineCount(root);
  const requestId = 'jobs-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
  try {
    await sessionController.prompt({
      sessionId: sessionId,
      content: [{ type: 'text', text: sessionPrompt(keyword, root, options.allowed) }],
      requestId: requestId,
    }, new AbortController().signal);
  } catch (error) {
    return { error: 'collector-spawn-failed', message: '提交检索指令失败：' + String(error?.message ?? error) };
  }

  const status = {
    state: 'running',
    mode: 'session',
    sessionId: sessionId,
    sessionTitle: sessionTitle,
    keyword: keyword,
    allowed: Array.isArray(options.allowed) ? options.allowed.slice() : [],
    startedAt: now,
    feedLines: baseline,
    addedLines: 0,
    seenRunning: false,
  };
  writeCollectorStatus(root, status);
  if (options.monitor !== false) ensureMonitor(root, options.agentStatus, options.onFinish);
  return { started: true, mode: 'session', sessionId: sessionId, status: status };
}

/**
 * 推进一次会话式检索的状态机：观察到 agent 从 running 回到 idle，或超时，
 * 就收尾（自动 ingest + 写状态）。返回推进后的状态；没有会话在跑时返回 null。
 */
export function advanceSessionCollect(options = {}) {
  const root = options.root;
  if (typeof root !== 'string' || root === '') return null;
  const now = options.now ?? new Date().toISOString();
  const status = readStatus(root);
  if (status === null || status.mode !== 'session' || status.state !== 'running') return status;

  const startedAt = Date.parse(String(status.startedAt ?? ''));
  const nowMs = Date.parse(now);
  const elapsed = Number.isNaN(startedAt) || Number.isNaN(nowMs) ? 0 : nowMs - startedAt;
  const agentStatus = typeof options.agentStatus === 'function' ? options.agentStatus(status.sessionId) : null;
  const added = Math.max(0, feedLineCount(root) - Number(status.feedLines ?? 0));

  let next = status;
  if (agentStatus === 'running' && status.seenRunning !== true) {
    next = { ...status, seenRunning: true, addedLines: added };
  }

  const agentStopped = agentStatus !== 'running';
  // 只有「见过 running」或「feed 有新增」才算检索真的发生过；
  // 刚提交时 agent 可能还没进入 running，不能按时间把它当成已结束。
  const finished = agentStopped && (next.seenRunning === true || added > 0);
  // 60 秒还没动静：判定会话没进入检索（模型/浏览器不可用），报错但不 ingest
  const stalled = agentStopped && !finished && elapsed >= 60_000;
  if (!finished && !stalled && elapsed < SESSION_TIMEOUT_MS) {
    if (next !== status) writeCollectorStatus(root, next);
    return next;
  }

  if (stalled) {
    const errored = {
      ...next,
      state: 'error',
      error: 'session-idle',
      message: '会话已创建，但 60 秒内没有进入检索状态；可能模型或浏览器 MCP 不可用，请到会话查看。',
      finishedAt: now,
      addedLines: added,
    };
    writeCollectorStatus(root, errored);
    return errored;
  }

  if (!finished) {
    const errored = {
      ...next,
      state: 'error',
      error: 'session-timeout',
      message: '后台会话超过 15 分钟还没结束，已停止跟踪（会话可能仍在跑，可到侧边栏查看）。',
      finishedAt: now,
      addedLines: added,
    };
    writeCollectorStatus(root, errored);
    return errored;
  }

  const ingested = ingestFeed({ root: root, now: now });
  const done = {
    ...next,
    state: 'done',
    finishedAt: now,
    addedLines: added,
    ingested: ingested,
    message: added === 0
      ? '会话已结束，但 feed 没有新增行；可能是未登录、未找到岗位或浏览器不可用，请到会话里看原因。'
      : '',
  };
  writeCollectorStatus(root, done);
  return done;
}

/** 进程内监视器：每 2 秒推进一次，结束或超时即停；不阻止进程退出。 */
function ensureMonitor(root, agentStatus, onFinish) {
  if (monitors.has(root)) return;
  const timer = setInterval(() => {
    let status = null;
    try {
      status = advanceSessionCollect({ root: root, agentStatus: agentStatus });
    } catch { /* 单次推进失败不影响下一轮 */ }
    if (status === null || status.state !== 'running') {
      clearInterval(timer);
      monitors.delete(root);
      // 检索结束：把自动化浏览器收掉（调用方决定具体动作，登录模式不会走到这里）
      if (typeof onFinish === 'function') {
        try { Promise.resolve(onFinish(status)).catch(() => {}); } catch { /* 忽略 */ }
      }
    }
  }, MONITOR_INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();
  monitors.set(root, timer);
}

/** 测试与插件卸载用：停止所有监视器。 */
export function stopAllMonitors() {
  for (const timer of monitors.values()) clearInterval(timer);
  monitors.clear();
}

/** 供测试与文档引用：默认单轮上限与采集器一致。 */
export const SESSION_DEFAULT_TIMEOUT_MS = SESSION_TIMEOUT_MS;
export const COLLECTOR_DEFAULT_TIMEOUT_MS = DEFAULT_TIMEOUT_MS;
