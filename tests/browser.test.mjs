/**
 * 浏览器管家集成自检（离线）：本地 HTTP 页面 → headless Chrome(CDP) → 登录判定 → 会话恢复。
 * 没有 Chrome 时跳过（与 pdf 测试同一策略）。
 * 运行：node tests/browser.test.mjs
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkSource, closeBrowser, ensureBrowser, isCdpUp, openLogin } from '../server/browser.js';
import { findChrome } from '../server/pdf.js';

const chrome = findChrome('');
if (chrome === null) {
  console.log('浏览器管家：本机没有 Chrome，跳过集成自检');
  process.exit(0);
}
const dshHome = String(process.env.DSH_HOME ?? '').trim();
const moduleDir = dshHome === '' ? '' : join(dshHome, 'mcp/playwright/node_modules');
if (moduleDir === '' || !existsSync(join(moduleDir, 'playwright', 'package.json'))) {
  console.log('浏览器管家：没有配置 DSH_HOME 或找不到 Playwright 安装（' + (moduleDir || 'DSH_HOME 未设置') + '），跳过集成自检');
  process.exit(0);
}
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

const server = createServer((req, res) => {
  if (req.url === '/login') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'set-cookie': 'sid=abc; Path=/; HttpOnly' });
    res.end('<!doctype html><html><body>登录页</body></html>');
    return;
  }
  if (req.url === '/out') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end('<!doctype html><html><body>请先 短信登录</body></html>');
    return;
  }
  const loggedIn = String(req.headers.cookie ?? '').includes('sid=abc');
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><html><body>' + (loggedIn ? '我的简历 退出登录' : '请先 短信登录') + '</body></html>');
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const pagePort = server.address().port;
const baseUrl = 'http://127.0.0.1:' + pagePort;
const cdpPort = 9600 + Math.floor(Math.random() * 300);
const profile = mkdtempSync(join(tmpdir(), 'upcv-browser-'));
const statePath = join(profile, 'state.json');
const base = { port: cdpPort, profile, moduleDir, headless: true, timeoutMs: 20000, statePath };
const auth = {
  checkUrl: baseUrl + '/in',
  loggedIn: ['退出登录'],
  loggedOut: ['短信登录'],
};

async function killChrome() {
  try { execFileSync('pkill', ['-f', 'remote-debugging-port=' + cdpPort]); } catch { /* 已退出 */ }
  for (let i = 0; i < 50; i += 1) {
    if (!(await isCdpUp(cdpPort, 200))) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
}

try {
  await check('ensureBrowser 用独立 profile 拉起可连的 CDP 浏览器', async () => {
    const ensured = await ensureBrowser(base);
    assert.equal(ensured.running, true, JSON.stringify(ensured));
    assert.equal(await isCdpUp(cdpPort), true);
  });

  await check('openLogin 打开登录页并保留页面（不自动关闭）', async () => {
    const result = await openLogin({ ...base, url: baseUrl + '/login' });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.match(result.url, /\/login$/);
  });

  await check('checkSource：命中已登录标记 → ok，并写出 storageState', async () => {
    const result = await checkSource({ ...base, auth });
    assert.equal(result.state, 'ok', JSON.stringify(result));
    assert.equal(existsSync(statePath), true, '登录有效时应保存 cookie 快照');
  });

  await check('Chrome 重启后：storageState 把会话 cookie 恢复 → 仍是 ok', async () => {
    await killChrome();
    const ensured = await ensureBrowser(base);
    assert.equal(ensured.running, true, JSON.stringify(ensured));
    const result = await checkSource({ ...base, auth });
    assert.equal(result.state, 'ok', JSON.stringify(result));
  });

  await check('checkSource：未登录页面 → expired', async () => {
    const result = await checkSource({ ...base, auth: { ...auth, checkUrl: baseUrl + '/out' } });
    assert.equal(result.state, 'expired', JSON.stringify(result));
  });

  await check('closeBrowser：优雅关闭管家浏览器，端口释放', async () => {
    const result = await closeBrowser(base);
    assert.equal(result.closed, true, JSON.stringify(result));
    assert.equal(await isCdpUp(cdpPort, 300), false);
  });
} finally {
  await new Promise((resolve) => server.close(resolve));
  await killChrome();
}

console.log('\n' + passed + ' 项通过');
