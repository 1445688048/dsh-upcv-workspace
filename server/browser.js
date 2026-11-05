/**
 * 浏览器管家（Phase 3.1）：一个带 CDP 端口的 Chrome，插件与 browser MCP 共用同一 profile。
 *
 * 为什么需要它：登录必须发生在「没有 agent 操作」的稳定窗口里，而 agent 的
 * Playwright MCP 又必须使用同一个浏览器 profile 才能共享登录态。做法是：
 *   - 插件用 --remote-debugging-port 拉起一个普通 Chrome（不接管页面）；
 *   - MCP 改成 --cdp-endpoint 连它（不再自己起浏览器）；
 *   - 插件通过 Playwright connectOverCDP 打开登录标签 / 检查登录态，全程不经过 agent。
 *
 * 零新依赖：Playwright 复用 browser MCP 已安装的那份（<DSH_HOME>/mcp/playwright/node_modules）。
 *
 * @module dsh-upcv-workspace/browser
 */
import { spawn } from 'node:child_process';
import { chmodSync, existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';

import { findChrome } from './pdf.js';

export const DEFAULT_CDP_PORT = 9333;
const CDP_HOST = '127.0.0.1';
const CDP_TIMEOUT_MS = 15000;
const CHECK_TIMEOUT_MS = 30000;

let launching = null;

export function cdpBase(port) {
  return 'http://' + CDP_HOST + ':' + Number(port || DEFAULT_CDP_PORT);
}

/** CDP 端口是否已经在服务（浏览器已经在跑）。 */
export async function isCdpUp(port, timeoutMs = 800) {
  try {
    const res = await fetch(cdpBase(port) + '/json/version', { signal: AbortSignal.timeout(timeoutMs) });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 确保管家浏览器在跑：已在跑直接返回；否则用固定 profile 拉起一个普通 Chrome。
 * @param {{port?:number, profile:string, chromePath?:string, timeoutMs?:number}} options
 * @returns {Promise<{running:boolean, started?:boolean, port?:number, error?:string, message?:string}>}
 */
export async function ensureBrowser(options = {}) {
  const port = Number(options.port) > 0 ? Number(options.port) : DEFAULT_CDP_PORT;
  if (await isCdpUp(port)) return { running: true, started: false, port: port };
  if (launching !== null) {
    await launching.catch(() => {});
    return { running: await isCdpUp(port), started: false, port: port };
  }
  const profile = String(options.profile ?? '').trim();
  if (profile === '') return { running: false, error: 'no-profile', message: '没有配置浏览器 profile 目录。' };
  const chrome = findChrome(options.chromePath);
  if (chrome === null) {
    return { running: false, error: 'no-browser', message: '本机没有找到 Chrome / Chromium（可用 chromePath 配置）。' };
  }
  launching = new Promise((resolve) => {
    // 参数用数组，不经过 shell；detached 让浏览器在插件重载/退出后继续活着。
    const args = [
      ...(options.headless === true ? ['--headless=new'] : []),
      '--remote-debugging-port=' + port,
      '--remote-allow-origins=*',
      '--user-data-dir=' + profile,
      '--no-first-run',
      '--no-default-browser-check',
      'about:blank',
    ];
    try {
      const child = spawn(chrome, args, { detached: true, stdio: 'ignore' });
      child.unref();
      resolve({ ok: true });
    } catch (error) {
      resolve({ ok: false, message: String(error?.message ?? error) });
    }
  });
  const spawned = await launching;
  launching = null;
  if (spawned.ok !== true) return { running: false, error: 'spawn-failed', message: spawned.message };

  const deadline = Date.now() + (Number(options.timeoutMs) > 0 ? Number(options.timeoutMs) : CDP_TIMEOUT_MS);
  while (Date.now() < deadline) {
    if (await isCdpUp(port)) return { running: true, started: true, port: port };
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return {
    running: false,
    error: 'cdp-timeout',
    message: '浏览器已启动，但 CDP 端口没有响应；如果同一个 profile 已有 Chrome 在跑，请先完全退出它。',
  };
}

/** 从 browser MCP 的安装目录加载 Playwright（不新增插件依赖）。 */
function loadChromium(moduleDir) {
  const dir = String(moduleDir ?? '').trim();
  if (dir === '') throw new Error('没有配置 Playwright 目录（browserModuleDir）。');
  const require = createRequire(resolve(dir, 'noop.cjs'));
  const playwright = require('playwright');
  if (playwright === null || playwright === undefined || typeof playwright.chromium?.connectOverCDP !== 'function') {
    throw new Error('Playwright 不可用：' + dir);
  }
  return playwright.chromium;
}

/** 连接管家浏览器执行一段操作；无论成败都断开 CDP（不关浏览器）。 */
export async function withBrowser(options, operation) {
  const port = Number(options.port) > 0 ? Number(options.port) : DEFAULT_CDP_PORT;
  const chromium = loadChromium(options.moduleDir);
  const browser = await chromium.connectOverCDP(cdpBase(port), { timeout: 10000 });
  try {
    return await operation(browser);
  } finally {
    await browser.close().catch(() => {});
  }
}

/**
 * 关闭管家浏览器（CDP Browser.close，优雅退出，Chrome 会 flush cookie）。
 * 检索结束后调用，把自动化窗口收掉；登录/检查期间不要调用。
 */
export async function closeBrowser(options = {}) {
  const port = Number(options.port) > 0 ? Number(options.port) : DEFAULT_CDP_PORT;
  if (!(await isCdpUp(port))) return { closed: true, running: false };
  try {
    await withBrowser(options, async (browser) => {
      const cdp = await browser.newBrowserCDPSession();
      await cdp.send('Browser.close').catch(() => {});
    });
  } catch { /* 浏览器可能随关闭一起断开连接，忽略 */ }
  for (let i = 0; i < 25; i += 1) {
    if (!(await isCdpUp(port, 200))) return { closed: true, running: false };
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return { closed: false, running: true };
}

/** 从 storageState 恢复 cookie（Chrome 关闭后会话 cookie 会丢，靠这份快照找回来）。 */
async function restoreState(options, context) {
  const path = String(options.statePath ?? '').trim();
  if (path === '' || !existsSync(path)) return;
  try {
    const state = JSON.parse(readFileSync(path, 'utf8'));
    if (state !== null && typeof state === 'object' && Array.isArray(state.cookies) && state.cookies.length > 0) {
      await context.addCookies(state.cookies);
    }
  } catch { /* 状态坏了按未登录处理 */ }
}

/** 把当前 cookie 存成 storageState（0600，只有当前用户可读）。 */
async function saveState(options, context) {
  const path = String(options.statePath ?? '').trim();
  if (path === '') return false;
  try {
    await context.storageState({ path: path });
    try { chmodSync(path, 0o600); } catch { /* 权限收紧失败不影响登录 */ }
    return true;
  } catch {
    return false;
  }
}

/**
 * 打开一个登录标签页，然后断开连接——页面留给用户操作，不自动刷新/导航。
 * @returns {Promise<{ok:boolean, url?:string, error?:string, message?:string}>}
 */
export async function openLogin(options = {}) {
  const ensured = await ensureBrowser(options);
  if (ensured.running !== true) return { ok: false, ...ensured };
  const url = String(options.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: 'bad-url', message: '登录地址不是 http(s)。' };
  try {
    return await withBrowser(options, async (browser) => {
      const context = browser.contexts()[0];
      if (context === undefined) throw new Error('浏览器没有默认上下文。');
      await restoreState(options, context);
      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: CHECK_TIMEOUT_MS });
      await page.bringToFront();
      return { ok: true, url: page.url() };
    });
  } catch (error) {
    return { ok: false, error: 'login-failed', message: String(error?.message ?? error) };
  }
}

/**
 * 判定登录态：优先「被重定向到登录页」，其次页面标记，最后才用 cookie 兜底。
 * @param {{href?:string, body?:string, cookies?:Array<{name:string,value:string}>}} observed
 * @param {{loginUrlPattern?:string, loggedIn?:string[], loggedOut?:string[], cookie?:string}} auth
 */
export function judgeAuth(observed, auth = {}) {
  const checkedAt = new Date().toISOString();
  const href = String(observed?.href ?? '');
  const body = String(observed?.body ?? '');
  const cookies = Array.isArray(observed?.cookies) ? observed.cookies : [];
  const pattern = typeof auth.loginUrlPattern === 'string' ? auth.loginUrlPattern : '';
  if (pattern !== '' && href.includes(pattern)) {
    return { state: 'expired', note: '被重定向到登录页', url: href, checkedAt: checkedAt };
  }
  const loggedIn = Array.isArray(auth.loggedIn) ? auth.loggedIn : [];
  const loggedOut = Array.isArray(auth.loggedOut) ? auth.loggedOut : [];
  if (loggedIn.some((marker) => marker !== '' && body.includes(marker))) {
    return { state: 'ok', note: '命中已登录标记', url: href, checkedAt: checkedAt };
  }
  if (loggedOut.some((marker) => marker !== '' && body.includes(marker))) {
    return { state: 'expired', note: '命中未登录标记', url: href, checkedAt: checkedAt };
  }
  if (typeof auth.cookie === 'string' && auth.cookie !== '' && cookies.some((cookie) => cookie.name === auth.cookie && cookie.value !== '')) {
    return { state: 'ok', note: '按 cookie 判断（页面没有明确标记）', url: href, checkedAt: checkedAt };
  }
  return { state: 'unknown', note: '页面没有命中登录/未登录标记', url: href, checkedAt: checkedAt };
}

/**
 * 检查一个源的登录态：打开 checkUrl → 读页面/URL/cookie → judgeAuth。
 * @returns {Promise<{state:'ok'|'expired'|'unknown', note?:string, url?:string, checkedAt:string}>}
 */
export async function checkSource(options = {}) {
  const checkedAt = new Date().toISOString();
  const auth = options.auth !== null && typeof options.auth === 'object' ? options.auth : {};
  const checkUrl = String(auth.checkUrl ?? '').trim();
  if (!/^https?:\/\//i.test(checkUrl)) {
    return { state: 'unknown', note: '没有配置有效的 checkUrl', checkedAt: checkedAt };
  }
  const ensured = await ensureBrowser(options);
  if (ensured.running !== true) {
    return { state: 'unknown', note: ensured.message ?? '浏览器管家未启动', checkedAt: checkedAt };
  }
  try {
    return await withBrowser(options, async (browser) => {
      const context = browser.contexts()[0];
      if (context === undefined) throw new Error('浏览器没有默认上下文。');
      await restoreState(options, context);
      const page = await context.newPage();
      let observed;
      try {
        await page.goto(checkUrl, { waitUntil: 'domcontentloaded', timeout: CHECK_TIMEOUT_MS });
        await page.waitForTimeout(1500);
        const href = page.url();
        const body = await page.evaluate(() => (document.body === null ? '' : document.body.innerText).slice(0, 8000));
        const cookies = await context.cookies(checkUrl).catch(() => []);
        observed = { href: href, body: body, cookies: cookies };
      } finally {
        await page.close().catch(() => {});
      }
      const verdict = judgeAuth(observed, auth);
      // 登录有效时顺手存快照；下次 Chrome 重启后 restoreState 会把会话 cookie 加回来
      if (verdict.state === 'ok') await saveState(options, context);
      return verdict;
    });
  } catch (error) {
    return { state: 'unknown', note: '检查失败：' + String(error?.message ?? error), checkedAt: checkedAt };
  }
}
