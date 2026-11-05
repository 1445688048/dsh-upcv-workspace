/**
 * 检索源与登录判定自检（全离线）。
 * 运行：node tests/sources.test.mjs
 */
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { judgeAuth } from '../server/browser.js';
import {
  checkSources, listSources, readSourcesStatus, usableSources, writeSourceStatus,
} from '../server/sources.js';

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

const AUTH = {
  loginUrl: 'https://a.test/login',
  checkUrl: 'https://a.test/me',
  loggedIn: ['退出登录', '我的简历'],
  loggedOut: ['短信登录', '登录/注册'],
  cookie: 'sxs_usr',
  loginUrlPattern: '/login',
};

const tempRoot = () => {
  const dir = mkdtempSync(join(tmpdir(), 'upcv-sources-'));
  writeFileSync(join(dir, 'jobs-spec.json'), JSON.stringify({
    version: 1,
    feedPath: join(dir, 'jobs-feed.jsonl'),
    defaults: { city: '深圳', keywords: ['前端'] },
    channels: [
      { id: 'a', enabled: true, entry: 'https://a.test/?k={keyword}', auth: AUTH },
      { id: 'b', enabled: true, entry: 'https://b.test/' },
      { id: 'c', enabled: false, entry: 'https://c.test/' },
    ],
    rules: '只读',
  }, null, 2), 'utf8');
  return dir;
};

console.log('登录判定');
await check('被重定向到登录页 → expired（最高优先级）', async () => {
  const out = judgeAuth({ href: 'https://a.test/login?redirect=x', body: '退出登录' }, AUTH);
  assert.equal(out.state, 'expired');
  assert.match(out.note, /重定向/);
});

await check('命中已登录标记 → ok（即使页面里也残留登录按钮文本）', async () => {
  const out = judgeAuth({ href: 'https://a.test/me', body: '我的简历 退出登录 短信登录' }, AUTH);
  assert.equal(out.state, 'ok');
});

await check('只命中未登录标记 → expired', async () => {
  const out = judgeAuth({ href: 'https://a.test/me', body: '请先 短信登录 / 密码登录' }, AUTH);
  assert.equal(out.state, 'expired');
});

await check('没有页面标记但 cookie 在 → ok（兜底）', async () => {
  const out = judgeAuth({ href: 'https://a.test/me', body: '空页面', cookies: [{ name: 'sxs_usr', value: 'u1' }] }, AUTH);
  assert.equal(out.state, 'ok');
  assert.match(out.note, /cookie/);
});

await check('什么都没有 → unknown（不猜已登录）', async () => {
  const out = judgeAuth({ href: 'https://a.test/me', body: '空页面', cookies: [] }, AUTH);
  assert.equal(out.state, 'unknown');
});

console.log('检索源状态');
await check('listSources：disabled / no-auth / unknown 默认状态正确', async () => {
  const root = tempRoot();
  const list = listSources(root);
  assert.equal(list.sources.length, 3);
  const byId = Object.fromEntries(list.sources.map((item) => [item.id, item]));
  assert.equal(byId.a.status.state, 'unknown');
  assert.equal(byId.b.status.state, 'no-auth');
  assert.equal(byId.c.status.state, 'disabled');
  assert.equal(byId.a.loginUrl, 'https://a.test/login');
});

await check('checkSources：只检查 enabled + 有 auth 的渠道，结果落盘', async () => {
  const root = tempRoot();
  const calls = [];
  const out = await checkSources({
    root,
    check: async (channel) => { calls.push(channel.id); return { state: 'ok', note: '命中已登录标记' }; },
  });
  assert.deepEqual(calls, ['a']);
  assert.equal(out.results.length, 1);
  assert.equal(out.results[0].state, 'ok');
  assert.ok(typeof out.results[0].checkedAt === 'string');
  assert.equal(readSourcesStatus(root).a.state, 'ok');
});

await check('checkSources：检查抛错 → unknown，不让整轮崩', async () => {
  const root = tempRoot();
  const out = await checkSources({ root, check: async () => { throw new Error('boom'); } });
  assert.equal(out.results[0].state, 'unknown');
  assert.match(out.results[0].note, /boom/);
});

await check('usableSources：ok + 无登录要求的源可用；失效/停用被跳过', async () => {
  const root = tempRoot();
  writeSourceStatus(root, 'a', { state: 'ok' });
  const first = usableSources(root);
  assert.deepEqual(first.usable.sort(), ['a', 'b']);
  assert.deepEqual(first.skipped, [{ id: 'c', state: 'disabled' }]);

  writeSourceStatus(root, 'a', { state: 'expired', note: '登录失效' });
  const second = usableSources(root);
  assert.deepEqual(second.usable, ['b']);
  assert.equal(second.skipped.find((item) => item.id === 'a').state, 'expired');
});

await check('writeSourceStatus 合并写，不覆盖其他源', async () => {
  const root = tempRoot();
  writeSourceStatus(root, 'a', { state: 'ok' });
  writeSourceStatus(root, 'b', { state: 'expired' });
  const all = readSourcesStatus(root);
  assert.equal(all.a.state, 'ok');
  assert.equal(all.b.state, 'expired');
});

console.log('\n' + passed + ' 项通过');
