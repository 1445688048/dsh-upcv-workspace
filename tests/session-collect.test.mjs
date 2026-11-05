/**
 * 会话式岗位检索自检（全离线）：skill 指令 / 会话创建 / 完成状态机 / 自动 ingest。
 * 运行：node tests/session-collect.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { readCollectorStatus } from '../server/collector.js';
import {
  advanceSessionCollect, feedLineCount, isSessionController, sessionPrompt,
  startSessionCollect, stopAllMonitors,
} from '../server/session-collect.js';

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

const tempRoot = () => mkdtempSync(join(tmpdir(), 'upcv-session-'));
const statusOf = (root) => readCollectorStatus(root).status;
const feedLine = (n) => JSON.stringify({
  collectedAt: '2026-10-20T14:30:00+08:00',
  source: 'shixiseng',
  sourceUrl: 'https://www.shixiseng.com/intern/' + n,
  title: '前端实习 ' + n,
  company: '某公司 ' + n,
  city: '深圳',
  salary: '250-400元/天',
});

function fakeController() {
  const calls = [];
  return {
    calls,
    create: async (request) => { calls.push({ method: 'create', request }); return { sessionId: 'session-test-1' }; },
    rename: async (request) => { calls.push({ method: 'rename', request }); return { title: request.title }; },
    prompt: async (request, signal) => { calls.push({ method: 'prompt', request, aborted: signal.aborted }); return { accepted: true }; },
  };
}

console.log('会话式检索');

await check('isSessionController 只认 create + prompt', async () => {
  assert.equal(isSessionController(null), false);
  assert.equal(isSessionController({ create() {} }), false);
  assert.equal(isSessionController({ create() {}, prompt() {} }), true);
});

await check('sessionPrompt 带关键词、数据根、只读与自动入库约束', async () => {
  const text = sessionPrompt('前端', '/tmp/root');
  assert.ok(text.includes('前端'));
  assert.ok(text.includes('/tmp/root'));
  assert.ok(text.includes('单渠道最多 2 页'));
  assert.ok(text.includes('不要自己入库'));
  assert.ok(text.includes('不投递'));
});

await check('启动：create(cwd=root) → rename → prompt 自动发送，状态写 running/session', async () => {
  const root = tempRoot();
  const controller = fakeController();
  const result = await startSessionCollect({ root, keyword: '前端', sessionController: controller, monitor: false });
  assert.equal(result.started, true);
  assert.equal(result.mode, 'session');
  assert.equal(controller.calls[0].method, 'create');
  assert.equal(controller.calls[0].request.cwd, root);
  assert.equal(controller.calls[1].method, 'rename');
  assert.equal(controller.calls[1].request.title, '岗位检索 · 前端');
  assert.equal(controller.calls[2].method, 'prompt');
  assert.equal(controller.calls[2].aborted, false);
  assert.ok(controller.calls[2].request.content[0].text.includes('前端'));
  const status = statusOf(root);
  assert.equal(status.state, 'running');
  assert.equal(status.mode, 'session');
  assert.equal(status.sessionId, 'session-test-1');
  assert.equal(status.seenRunning, false);
  stopAllMonitors();
});

await check('推进：agent running → idle，自动 ingest 并轮转 feed', async () => {
  const root = tempRoot();
  const controller = fakeController();
  const start = new Date('2026-10-20T14:00:00.000Z').toISOString();
  await startSessionCollect({ root, keyword: '前端', sessionController: controller, now: start, monitor: false });
  writeFileSync(join(root, 'jobs-feed.jsonl'), feedLine(1) + String.fromCharCode(10) + feedLine(2) + String.fromCharCode(10), 'utf8');

  const seen = advanceSessionCollect({ root, agentStatus: () => 'running', now: start });
  assert.equal(seen.state, 'running');
  assert.equal(seen.seenRunning, true);

  const done = advanceSessionCollect({ root, agentStatus: () => 'idle', now: '2026-10-20T14:01:00.000Z' });
  assert.equal(done.state, 'done');
  assert.equal(done.addedLines, 2);
  assert.equal(done.ingested.added, 2);
  assert.equal(done.ingested.duplicates, 0);
  assert.equal(feedLineCount(root), 0, 'feed 已被 ingest 轮转');
  assert.ok(readdirSync(root).some((name) => name.startsWith('jobs-feed.done-')), '应有轮转后的 done 文件');
  const jobs = JSON.parse(readFileSync(join(root, 'jobs.json'), 'utf8'));
  assert.equal(jobs.length, 2);
  stopAllMonitors();
});

await check('刚提交、agent 还没 running：宽限期内不误判完成', async () => {
  const root = tempRoot();
  await startSessionCollect({ root, keyword: '前端', sessionController: fakeController(), now: '2026-10-20T14:00:00.000Z', monitor: false });
  const still = advanceSessionCollect({ root, agentStatus: () => 'idle', now: '2026-10-20T14:00:03.000Z' });
  assert.equal(still.state, 'running', '3 秒就判完成会把「还没开始」当「已结束」');
  stopAllMonitors();
});

await check('60 秒没进入 running 且 feed 无新增：session-idle，不 ingest', async () => {
  const root = tempRoot();
  await startSessionCollect({ root, keyword: '前端', sessionController: fakeController(), now: '2026-10-20T14:00:00.000Z', monitor: false });
  const out = advanceSessionCollect({ root, agentStatus: () => 'idle', now: '2026-10-20T14:01:01.000Z' });
  assert.equal(out.state, 'error');
  assert.equal(out.error, 'session-idle');
  assert.equal(feedLineCount(root), 0);
  stopAllMonitors();
});

await check('超时：15 分钟仍未结束 → session-timeout（不 ingest）', async () => {
  const root = tempRoot();
  await startSessionCollect({ root, keyword: '前端', sessionController: fakeController(), now: '2026-10-20T14:00:00.000Z', monitor: false });
  writeFileSync(join(root, 'jobs-feed.jsonl'), feedLine(1) + String.fromCharCode(10), 'utf8');
  const out = advanceSessionCollect({ root, agentStatus: () => 'running', now: '2026-10-20T14:16:00.000Z' });
  assert.equal(out.state, 'error');
  assert.equal(out.error, 'session-timeout');
  assert.equal(feedLineCount(root), 1, '超时不应 ingest，保留 feed 供人工处理');
  stopAllMonitors();
});

await check('已有检索在跑：第二次启动返回 collector-running', async () => {
  const root = tempRoot();
  await startSessionCollect({ root, keyword: '前端', sessionController: fakeController(), monitor: false });
  const again = await startSessionCollect({ root, keyword: 'Java', sessionController: fakeController(), monitor: false });
  assert.equal(again.error, 'collector-running');
  stopAllMonitors();
});

await check('宿主没有会话服务：collector-unavailable，不崩溃', async () => {
  const root = tempRoot();
  const out = await startSessionCollect({ root, keyword: '前端', sessionController: null, monitor: false });
  assert.equal(out.error, 'collector-unavailable');
});

await check('会话模式 running 没有 pid 不被 readCollectorStatus 判成 collector-unverifiable', async () => {
  const root = tempRoot();
  await startSessionCollect({ root, keyword: '前端', sessionController: fakeController(), monitor: false });
  const read = readCollectorStatus(root);
  assert.equal(read.status.state, 'running');
  assert.equal(read.status.error, undefined);
  stopAllMonitors();
});

console.log('\n' + passed + ' 项通过');
