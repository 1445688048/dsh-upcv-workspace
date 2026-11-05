/**
 * 内建采集器的进程管理（Phase 2.5）。
 *
 * 职责边界：
 *  - 插件只负责「拉起 <config.root>/collector/collector.js」+「读它写的 collector-status.json」；
 *  - 采集器自身是 spec/feed 契约的第三个客户端，平台检索逻辑全在它那边；
 *  - 未安装时明确返回 collector-not-installed，不崩溃、不静默。
 *
 * 进程纪律照抄 pdf.js：参数用数组交给 execFile（不过 shell）、超时、错误显式返回；
 * 额外一条：宿主服务端跑在 Electron 里，execFile(process.execPath) 必须带
 * ELECTRON_RUN_AS_NODE=1，否则会去启动一个桌面窗口而不是执行脚本。
 *
 * @module dsh-upcv-workspace/collector
 */
import { execFile } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { ensureSpec } from './jobs.js';

export const COLLECTOR_DIR = 'collector';
export const COLLECTOR_SCRIPT = 'collector.js';
export const STATUS_FILE = 'collector-status.json';
/** 默认 10 分钟强制结束：采集是 headed 浏览器，卡住不能拖住整个面板。 */
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;
/** 状态文件超过这个大小一定不是我们写的，按损坏处理。 */
const STATUS_MAX_BYTES = 256 * 1024;

/** 采集器在数据根下的三个固定位置。 */
export function collectorPaths(root) {
  const base = typeof root === 'string' && root !== '' ? root : '';
  const dir = base === '' ? '' : join(base, COLLECTOR_DIR);
  return {
    dir: dir,
    script: dir === '' ? '' : join(dir, COLLECTOR_SCRIPT),
    spec: base === '' ? '' : join(base, 'jobs-spec.json'),
    status: base === '' ? '' : join(base, STATUS_FILE),
  };
}

/** 采集器装没装：只认 <root>/collector/collector.js 是否存在（不看目录）。 */
export function isCollectorInstalled(root) {
  const paths = collectorPaths(root);
  return paths.script !== '' && existsSync(paths.script);
}

/** pid 是否还活着；EPERM 说明进程存在但不属于当前用户，仍算活着。 */
export function isPidAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error !== null && error !== undefined && error.code === 'EPERM'; }
}

function corruptStatus(message) {
  return { state: 'error', error: 'status-corrupt', message: message };
}

/** 原样读状态文件（不做 running 有效性推导），供 readCollectorStatus 与进程收尾共用。 */
function readStatusFile(root) {
  const paths = collectorPaths(root);
  if (paths.status === '' || !existsSync(paths.status)) return { note: 'empty', value: null };
  try {
    if (statSync(paths.status).size > STATUS_MAX_BYTES) return { note: 'oversized', value: null };
    const value = JSON.parse(readFileSync(paths.status, 'utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return { note: 'corrupt', value: null };
    return { note: 'ok', value: value };
  } catch { return { note: 'corrupt', value: null }; }
}

/**
 * 读采集器状态文件。
 *
 * 三种「不该继续显示检索中」的情况会被就地翻成 error：
 *   - 文件坏 / 超大 / 不是对象（status-corrupt / status-oversized）；
 *   - state=running 但 pid 已不存在（collector-exited，被系统或用户杀了）；
 *   - state=running 但没有 pid（collector-unverifiable，无法证明它还活着）。
 * 状态文件是采集器与插件共享的唯一通道，读失败绝不让岗位页崩溃。
 *
 * @returns {{installed:boolean, status:object|null}}
 */
export function readCollectorStatus(root, now = new Date().toISOString()) {
  const installed = isCollectorInstalled(root);
  const read = readStatusFile(root);
  if (read.note === 'empty') return { installed: installed, status: null };
  if (read.note === 'oversized') return { installed: installed, status: corruptStatus('collector-status.json 异常大，已忽略。') };
  if (read.note === 'corrupt') return { installed: installed, status: corruptStatus('collector-status.json 不是合法 JSON，已忽略。') };
  const parsed = read.value;
  const state = parsed.state === 'running' || parsed.state === 'done' || parsed.state === 'error' ? parsed.state : 'error';
  const status = { ...parsed, state: state };
  if (state !== 'running') return { installed: installed, status: status };
  // 会话式检索（mode:'session'）的存活由 agent 状态负责，没有 pid 不是错误
  if (parsed.mode === 'session') return { installed: installed, status: status };
  if (!Number.isFinite(parsed.pid)) {
    return { installed: installed, status: { ...status, state: 'error', error: 'collector-unverifiable', message: '状态文件没有记录采集器进程号，无法确认它是否还在跑。' } };
  }
  if (!isPidAlive(parsed.pid)) {
    return { installed: installed, status: { ...status, state: 'error', error: 'collector-exited', finishedAt: now, message: '采集器进程已经退出（可能被系统或用户终止）。' } };
  }
  return { installed: installed, status: status };
}

/** 原子写状态文件（临时文件 + rename），与 jobs/store 同一手法。 */
export function writeCollectorStatus(root, status) {
  const paths = collectorPaths(root);
  if (paths.status === '') return false;
  const record = { ...status, updatedAt: new Date().toISOString() };
  const tmp = paths.status + '.tmp';
  try {
    mkdirSync(root, { recursive: true });
    writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
    renameSync(tmp, paths.status);
    return true;
  } catch { return false; }
}

/** 进程 stdout/stderr 的尾巴：只留最后一段，出错时够定位问题。 */
function tailText(text, max = 2000) {
  const clean = String(text ?? '');
  return clean.length > max ? clean.slice(clean.length - max) : clean;
}

/**
 * 启动一次检索。
 *
 * @param {{root:string, keyword?:string, timeoutMs?:number, run?:Function}} options
 *        run 只供测试注入（默认 execFile）。
 * @returns {Promise<{started:true, pid:number|null, timeoutMs:number, status:object}
 *                   | {error:string, message?:string}>}
 */
export async function startCollect(options = {}) {
  const root = options.root;
  if (typeof root !== 'string' || root === '') return { error: 'store-unavailable', message: '没有配置数据根目录。' };
  const paths = collectorPaths(root);
  if (!isCollectorInstalled(root)) {
    return {
      error: 'collector-not-installed',
      message: '还没安装采集器：在插件目录运行 node scripts/setup-collector.mjs（会装到 ' + join(root, COLLECTOR_DIR) + '），装好后重启面板。',
    };
  }
  const current = readCollectorStatus(root);
  if (current.status !== null && current.status.state === 'running') {
    return {
      error: 'collector-running',
      message: '已有一次检索在跑（' + String(current.status.channel ?? '准备中') + '），等它结束再试。',
    };
  }
  const spec = ensureSpec(root);
  if (spec.error !== undefined) return { error: spec.error, message: spec.message };

  const keyword = String(options.keyword ?? '').trim();
  const timeoutMs = Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : DEFAULT_TIMEOUT_MS;
  const args = [paths.script, '--spec', paths.spec, '--timeout-ms', String(timeoutMs)];
  if (keyword !== '') args.push('--keyword', keyword);
  const startedAt = new Date().toISOString();
  const run = options.run === undefined ? execFile : options.run;
  let child = null;
  try {
    // 参数是数组、不经过 shell；环境里带上 ELECTRON_RUN_AS_NODE，宿主里 process.execPath 是 Electron。
    child = run(process.execPath, args, {
      cwd: paths.dir,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      windowsHide: true,
      maxBuffer: 1024 * 1024,
      timeout: timeoutMs + 5000,
      killSignal: 'SIGKILL',
    }, () => {});
  } catch (error) {
    return { error: 'collector-spawn-failed', message: '无法启动采集器：' + String(error && error.message).slice(0, 160) };
  }
  if (child === null || child === undefined) return { error: 'collector-spawn-failed', message: '无法启动采集器进程。' };

  // 先落一次 running（带 pid），UI 立刻就能看到「检索中」；采集器随后会持续覆盖进度。
  const initial = {
    state: 'running', channel: null, page: 0, addedLines: 0, skippedLines: 0,
    startedAt: startedAt, finishedAt: null, error: null,
    pid: Number.isFinite(child.pid) ? child.pid : null,
    keyword: keyword === '' ? null : keyword,
    timeoutMs: timeoutMs,
  };
  writeCollectorStatus(root, initial);

  let output = '';
  const collectOutput = (chunk) => { output = tailText(output + String(chunk), 4000); };
  if (typeof child.stdout?.on === 'function') child.stdout.on('data', collectOutput);
  if (typeof child.stderr?.on === 'function') child.stderr.on('data', collectOutput);

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    // 强杀：SIGKILL，不给采集器留清理窗口（浏览器是它的子进程，由它自己负责收尾）
    try { child.kill('SIGKILL'); } catch { /* 已退出 */ }
    writeCollectorStatus(root, {
      ...initial, state: 'error', error: 'timeout', finishedAt: new Date().toISOString(),
      message: '检索超过 ' + Math.round(timeoutMs / 60000) + ' 分钟，已强制结束采集器进程。',
    });
  }, timeoutMs);
  if (typeof timer.unref === 'function') timer.unref();

  const finalize = (code, signal) => {
    clearTimeout(timer);
    if (timedOut) return;
    // 采集器正常收尾时会自己写 done/error；这里只在「它半路死了」时兜底，不覆盖它的结论。
    const after = readStatusFile(root);
    if (after.note !== 'ok') return;
    if (after.value.state !== 'running') return;
    writeCollectorStatus(root, {
      ...initial, state: 'error', error: 'collector-exited', finishedAt: new Date().toISOString(),
      message: '采集器意外退出（code=' + String(code) + (signal ? ', signal=' + String(signal) : '') + '）。' + (output === '' ? '' : ' 输出：' + tailText(output)),
    });
  };
  if (typeof child.on === 'function') child.on('exit', finalize);
  if (typeof child.on === 'function') child.on('error', (error) => { finalize('spawn-error', String((error && error.code) ?? '')); });

  return {
    started: true,
    pid: initial.pid,
    timeoutMs: timeoutMs,
    status: initial,
  };
}
