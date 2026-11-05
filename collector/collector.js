#!/usr/bin/env node
/**
 * 岗位检索采集器（spec/feed 契约的第三个客户端）。
 *
 * 它只做四件事：
 *   1. 读 <root>/jobs-spec.json（渠道、入口模板、maxPages、默认城市/关键词）；
 *   2. 用 headed 浏览器 + 专用 user-data-dir 逐渠道打开入口页（登录一次长期有效）；
 *   3. 用通用规则提取岗位（JSON-LD JobPosting 优先，链接+容器启发式兜底；不含任何平台选择器）；
 *   4. 按 3.1 契约逐行追加 <root>/jobs-feed.jsonl，并把进度写进 collector-status.json。
 *
 * 红线（写进 spec.rules 的不变量）：只读不写——不点投递、不发消息、不登录新账号；
 * 单渠道单轮不超过 maxPages（代码里再钳到 2）；无 sourceUrl 的条目不写入。
 *
 * 依赖：playwright **只装在本目录**（由 scripts/setup-collector.mjs 安装），不进插件、不进 tgz。
 *
 * 用法：node collector.js --spec <jobs-spec.json> [--keyword 前端] [--timeout-ms 600000]
 */
import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_PAGES_CAP = 2;
export const STATUS_FILE = 'collector-status.json';
export const LOCK_FILE = 'collector.lock';
export const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000;

/** maxPages 钳到 [1,2]：红线「单渠道 maxPages ≤ 2」由代码兜底，不只靠 spec 自觉。 */
export function clampMaxPages(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(1, Math.min(MAX_PAGES_CAP, Math.floor(n)));
}

/** 入口模板：{keyword}/{city} 各自 URL 编码后替换，模板其余部分原样保留。 */
export function buildEntryUrl(template, options = {}) {
  const raw = String(template ?? '').trim();
  if (raw === '') return '';
  const keyword = encodeURIComponent(String(options.keyword ?? '').trim());
  const city = encodeURIComponent(String(options.city ?? '').trim());
  return raw.replace(/\{keyword\}/g, keyword).replace(/\{city\}/g, city);
}

/** 读 spec；坏 JSON / 缺字段都返回错误，不猜、不写回。 */
export function readSpec(specPath) {
  if (typeof specPath !== 'string' || specPath === '') return { error: 'spec-missing', message: '没有指定 --spec。' };
  if (!existsSync(specPath)) return { error: 'spec-missing', message: '找不到检索规格：' + specPath };
  let spec;
  try { spec = JSON.parse(readFileSync(specPath, 'utf8')); }
  catch (error) { return { error: 'spec-invalid', message: 'jobs-spec.json 不是合法 JSON：' + String(error && error.message) }; }
  if (spec === null || typeof spec !== 'object' || Array.isArray(spec)) return { error: 'spec-invalid', message: 'jobs-spec.json 必须是对象。' };
  if (typeof spec.feedPath !== 'string' || !isAbsolute(spec.feedPath)) return { error: 'spec-invalid', message: 'jobs-spec.json 的 feedPath 必须是绝对路径。' };
  if (spec.channels !== undefined && !Array.isArray(spec.channels)) return { error: 'spec-invalid', message: 'jobs-spec.json 的 channels 必须是数组。' };
  return { spec: spec };
}

/** pid 是否还活着（EPERM 仍算活着）。 */
export function isAlive(pid) {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; }
  catch (error) { return error !== null && error !== undefined && error.code === 'EPERM'; }
}

function readLock(lockPath) {
  try {
    const value = JSON.parse(readFileSync(lockPath, 'utf8'));
    if (value !== null && typeof value === 'object' && Number.isFinite(value.pid)) return value;
    return null;
  } catch { return null; }
}

/**
 * 单实例锁：wx 原子创建；持有者已死时接管（仍然用 wx 防并发）。
 * @returns {{ok:true, pid:number, replaced?:boolean} | {ok:false, error:string, holder?:object, message?:string}}
 */
export function acquireLock(lockPath, pid = process.pid, now = new Date().toISOString()) {
  const payload = JSON.stringify({ pid: pid, startedAt: now });
  try {
    writeFileSync(lockPath, payload, { encoding: 'utf8', flag: 'wx' });
    return { ok: true, pid: pid };
  } catch (error) {
    if (error === null || error === undefined || error.code !== 'EEXIST') {
      return { ok: false, error: 'lock-unwritable', message: '无法创建单实例锁：' + String(error && error.message) };
    }
  }
  const holder = readLock(lockPath);
  if (holder !== null && isAlive(holder.pid)) return { ok: false, error: 'already-running', holder: holder };
  // 上一个采集器被强杀留下陈锁：接管
  try { rmSync(lockPath, { force: true }); } catch { /* 忽略 */ }
  try {
    writeFileSync(lockPath, payload, { encoding: 'utf8', flag: 'wx' });
    return { ok: true, pid: pid, replaced: true };
  } catch {
    return { ok: false, error: 'already-running', holder: readLock(lockPath) };
  }
}

/** 只释放自己持有的锁（避免误删下一轮的锁）。 */
export function releaseLock(lockPath, pid = process.pid) {
  const holder = readLock(lockPath);
  if (holder === null || holder.pid !== pid) return false;
  try { rmSync(lockPath, { force: true }); return true; } catch { return false; }
}

/** 原子写状态（临时文件 + rename）；失败不抛，采集继续（状态只是辅助通道）。 */
export function writeStatus(statusPath, status) {
  try {
    const tmp = statusPath + '.tmp';
    writeFileSync(tmp, JSON.stringify({ ...status, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
    renameSync(tmp, statusPath);
    return true;
  } catch { return false; }
}

/**
 * 在页面里执行：提取岗位。必须是自包含函数（page.evaluate 只序列化函数体，没有闭包）。
 * 策略（不含任何平台选择器）：
 *   1) JSON-LD application/ld+json 里的 JobPosting（最可信）；
 *   2) 链接 + 最近容器文本的启发式：标题取链接文本，薪资/公司/城市从容器文本里用通用模式取。
 * 拿不到公司名的条目不写入（契约要求 company，不编造）。
 */
export function extractJobsInPage(payload) {
  const baseUrl = payload && payload.baseUrl ? String(payload.baseUrl) : '';
  const fallbackCity = payload && payload.fallbackCity ? String(payload.fallbackCity) : '';
  const clean = (value) => String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  const absolute = (href) => {
    try { const u = new URL(String(href), baseUrl); u.hash = ''; return u.href; } catch (e) { return ''; }
  };
  const jobs = [];
  const seen = new Set();
  const push = (row) => {
    const sourceUrl = absolute(row.sourceUrl);
    const title = clean(row.title);
    const company = clean(row.company);
    if (!/^https?:\/\//i.test(sourceUrl) || title === '' || company === '' || seen.has(sourceUrl)) return;
    seen.add(sourceUrl);
    jobs.push({
      sourceUrl: sourceUrl,
      title: title.slice(0, 120),
      company: company.slice(0, 80),
      city: clean(row.city) || fallbackCity,
      salary: clean(row.salary).slice(0, 40),
      tags: Array.isArray(row.tags) ? row.tags.map(clean).filter((tag) => tag !== '').slice(0, 8) : [],
    });
  };

  // ── 1) JSON-LD JobPosting ──
  const walk = (node, depth) => {
    if (node === null || node === undefined || depth > 5) return;
    if (Array.isArray(node)) { for (const item of node) walk(item, depth + 1); return; }
    if (typeof node !== 'object') return;
    const type = Array.isArray(node['@type']) ? node['@type'].join(' ') : String(node['@type'] || '');
    if (/JobPosting/i.test(type)) {
      const places = Array.isArray(node.jobLocation) ? node.jobLocation : [node.jobLocation];
      const city = places.map((place) => clean(place && place.address && place.address.addressLocality)).find((value) => value !== '') || '';
      let salary = '';
      const base = node.baseSalary;
      if (base !== null && typeof base === 'object') {
        const value = base.value !== null && typeof base.value === 'object' ? base.value : base;
        const min = Number(value.minValue);
        const max = Number(value.maxValue);
        const unit = String(value.unitText || '').toUpperCase();
        const suffix = unit === 'MONTH' ? '元/月' : unit === 'YEAR' ? '元/年' : unit === 'DAY' ? '元/天' : unit === 'HOUR' ? '元/小时' : '';
        if (Number.isFinite(min) && Number.isFinite(max)) salary = min + '-' + max + suffix;
        else if (Number.isFinite(min)) salary = String(min) + suffix;
      }
      push({
        title: node.title || node.name,
        company: node.hiringOrganization && node.hiringOrganization.name,
        city: city,
        salary: salary,
        sourceUrl: node.url || (Array.isArray(node.sameAs) ? node.sameAs[0] : node.sameAs) || '',
        tags: node.employmentType,
      });
    }
    for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity']) if (node[key] !== undefined) walk(node[key], depth + 1);
  };
  for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
    try { walk(JSON.parse(script.textContent || ''), 0); } catch (e) { /* 坏 JSON-LD 跳过 */ }
  }

  // ── 2) 链接 + 容器启发式 ──
  const SALARY = /\d[\d.]*\s*(?:[-–—~～至]\s*\d[\d.]*\s*)?(?:元\s*\/\s*[天日月]|[Kk千万])/;
  const COMPANY = /([\u4e00-\u9fa5A-Za-z0-9（）()·&]{2,40}(?:股份有限公司|有限公司|集团|科技|网络|信息|传媒|工作室|事务所|研究院|银行|证券))/;
  const JOB_PATH = /(job|jobs|zhaopin|intern|position|recruit|shixi|xiaoyuan)/i;
  const SKIP_TITLE = /登录|注册|首页|下载|客服|帮助|下一页|上一页|查看更多|返回|关于|隐私|协议/;
  for (const anchor of document.querySelectorAll('a[href]')) {
    if (anchor.closest('nav, header, footer')) continue;
    const sourceUrl = absolute(anchor.getAttribute('href'));
    if (sourceUrl === '') continue;
    const title = clean(anchor.getAttribute('title') || anchor.textContent);
    if (title.length < 4 || title.length > 60 || SKIP_TITLE.test(title)) continue;
    let node = anchor;
    for (let depth = 0; depth < 3 && node.parentElement; depth += 1) {
      const next = node.parentElement;
      if (clean(next.textContent).length > 400) break;
      // 一旦上到「列表层」（含多个链接），公司/薪资就会串到别的岗位，必须停在单条容器内
      if (next.querySelectorAll('a[href]').length > 1) break;
      node = next;
    }
    const text = clean(node.textContent);
    const salaryMatch = text.match(SALARY);
    if (!JOB_PATH.test(sourceUrl) && salaryMatch === null) continue;
    // 按「元素文本」而不是整段拼接文本取字段：整段拼接会把相邻字段连成
    // 「250-400元/天深圳某某网络科技有限公司」，公司名就会带上工资/城市的尾巴。
    const parts = [];
    for (const el of node.querySelectorAll('span, em, i, b, strong, small, p, div, td, dd')) {
      const value = clean(el.textContent);
      if (value !== '' && value !== title && value.length <= 60) parts.push(value);
    }
    if (parts.length === 0) parts.push(text);
    let salary = salaryMatch === null ? '' : salaryMatch[0];
    let company = '';
    let cityName = '';
    for (const part of parts) {
      if (salary === '') { const hit = part.match(SALARY); if (hit !== null) salary = hit[0]; }
      if (company === '') { const hit = part.match(COMPANY); if (hit !== null) company = hit[1]; }
      if (cityName === '') {
        const hit = part.replace(/市$/, '').match(/^(北京|上海|深圳|广州|杭州|成都|武汉|南京|西安|苏州|长沙|重庆|天津|厦门|合肥|郑州|青岛|济南|大连|东莞|珠海|宁波|无锡|福州|佛山)$/);
        if (hit !== null) cityName = hit[1];
      }
    }
    if (company === '') continue;
    push({
      title: title,
      company: company,
      city: cityName,
      salary: salary,
      sourceUrl: sourceUrl,
      tags: [],
    });
  }
  return jobs;
}

/** 在页面里执行：找下一页（rel=next 或「下一页」链接）；找不到返回空串。 */
export function findNextPageInPage(payload) {
  const baseUrl = payload && payload.baseUrl ? String(payload.baseUrl) : '';
  const clean = (value) => String(value === null || value === undefined ? '' : value).replace(/\s+/g, ' ').trim();
  for (const anchor of document.querySelectorAll('a[href]')) {
    const rel = String(anchor.getAttribute('rel') || '').toLowerCase().split(/\s+/);
    const text = clean(anchor.textContent);
    if (!rel.includes('next') && !/^(下一页|下页|下一頁|next)$/i.test(text)) continue;
    try { const u = new URL(anchor.getAttribute('href'), baseUrl); u.hash = ''; return u.href; } catch (e) { /* 忽略坏链接 */ }
  }
  return '';
}

/** 采集器行 → 3.1 feed 行（字段逐字段一致；collectedAt 带本地时区偏移）。 */
export function toFeedRow(row, source, collectedAt) {
  return {
    collectedAt: collectedAt,
    source: String(source ?? ''),
    sourceUrl: String(row.sourceUrl ?? '').trim(),
    title: String(row.title ?? '').trim(),
    company: String(row.company ?? '').trim(),
    city: String(row.city ?? '').trim(),
    salary: String(row.salary ?? '').trim(),
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    raw: {},
  };
}

/** 本地时区 ISO 8601（契约要求带时区；toISOString 的 Z 也算，但本地偏移更可读）。 */
export function isoWithOffset(date = new Date()) {
  const pad = (n) => String(Math.floor(Math.abs(n))).padStart(2, '0');
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + 'T' + pad(date.getHours()) + ':' + pad(date.getMinutes()) + ':' + pad(date.getSeconds())
    + sign + pad(offset / 60) + ':' + pad(offset % 60);
}

function appendFeed(feedPath, rows) {
  if (rows.length === 0) return 0;
  mkdirSync(dirname(feedPath), { recursive: true });
  appendFileSync(feedPath, rows.map((row) => JSON.stringify(row)).join(String.fromCharCode(10)) + String.fromCharCode(10), 'utf8');
  return rows.length;
}

/** Playwright 只在真正检索时才加载：未安装依赖时给一条可执行的错误，而不是 import 期就崩。 */
async function loadPlaywright() {
  try { return await import('playwright'); }
  catch {
    const error = new Error('采集器依赖未安装：在本目录运行 npm install（或在插件目录运行 node scripts/setup-collector.mjs）。');
    error.code = 'playwright-missing';
    throw error;
  }
}

async function collectChannel(context, channel, options) {
  const maxPages = clampMaxPages(channel.maxPages);
  const rows = [];
  const seen = new Set();
  let url = buildEntryUrl(channel.entry, { keyword: options.keyword, city: options.city });
  if (url === '') return rows;
  for (let pageNo = 1; pageNo <= maxPages; pageNo += 1) {
    options.onProgress(pageNo);
    const page = await context.newPage();
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
      // 不认平台选择器：给首屏异步渲染一段固定宽限，宁可少抓也不猜 DOM
      await page.waitForTimeout(1500);
      const found = await page.evaluate(extractJobsInPage, { baseUrl: page.url(), fallbackCity: options.city });
      for (const row of Array.isArray(found) ? found : []) {
        if (typeof row.sourceUrl !== 'string' || seen.has(row.sourceUrl)) continue;
        seen.add(row.sourceUrl);
        rows.push(row);
      }
      const next = await page.evaluate(findNextPageInPage, { baseUrl: page.url() });
      if (typeof next !== 'string' || next === '' || next === url) break;
      url = next;
    } finally {
      await page.close().catch(() => {});
    }
  }
  return rows;
}

function parseArgs(argv) {
  const args = { spec: undefined, keyword: undefined, timeoutMs: undefined };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    const value = argv[i + 1];
    if (key === '--spec' && value !== undefined) { args.spec = value; i += 1; }
    else if (key === '--keyword' && value !== undefined) { args.keyword = value; i += 1; }
    else if (key === '--timeout-ms' && value !== undefined) { args.timeoutMs = Number(value); i += 1; }
    else if (key === '--help' || key === '-h') { args.help = true; }
  }
  return args;
}

/**
 * 主流程。返回进程退出码：0 成功 / 1 检索出错 / 2 参数或单实例问题 / 124 超时。
 * 供测试注入 deps.browser（默认懒加载 playwright）与 deps.log。
 */
export async function main(argv = [], deps = {}) {
  const args = parseArgs(argv);
  const log = typeof deps.log === 'function' ? deps.log : (line) => console.log('[collector] ' + line);
  if (args.help === true) { console.log('用法：collector.js --spec <jobs-spec.json> [--keyword 前端] [--timeout-ms 600000]'); return 0; }
  if (args.spec === undefined) { console.error('[collector] 缺少 --spec <jobs-spec.json>'); return 2; }
  const specPath = resolve(args.spec);
  const root = dirname(specPath);
  const statusPath = join(root, STATUS_FILE);
  const lockPath = join(root, LOCK_FILE);

  // 单实例：先抢锁，抢不到就退出（绝不动别人的状态文件）
  const lock = acquireLock(lockPath);
  if (!lock.ok) {
    const holder = lock.holder === undefined ? '' : '（pid ' + String(lock.holder && lock.holder.pid) + '）';
    console.error('[collector] 已有一次检索在跑' + holder + '，本次拒绝启动。');
    return 2;
  }

  const startedAt = isoWithOffset(new Date());
  const status = {
    state: 'running', channel: null, page: 0, addedLines: 0, skippedLines: 0,
    startedAt: startedAt, finishedAt: null, error: null, message: null, pid: process.pid,
  };
  const save = () => writeStatus(statusPath, status);
  const timeoutMs = Number(args.timeoutMs) > 0 ? Number(args.timeoutMs) : DEFAULT_TIMEOUT_MS;
  let timer = null;

  try {
    const read = readSpec(specPath);
    if (read.error !== undefined) {
      status.state = 'error'; status.error = read.error; status.message = read.message;
      status.finishedAt = isoWithOffset(new Date()); save();
      console.error('[collector] ' + read.message);
      return 2;
    }
    const spec = read.spec;
    save();
    timer = setTimeout(() => {
      status.state = 'error'; status.error = 'timeout';
      status.message = '采集器自身超时（' + Math.round(timeoutMs / 60000) + ' 分钟），已退出。';
      status.finishedAt = isoWithOffset(new Date()); save();
      releaseLock(lockPath);
      process.exit(124);
    }, timeoutMs);
    if (typeof timer.unref === 'function') timer.unref();

    const defaults = spec.defaults !== null && typeof spec.defaults === 'object' ? spec.defaults : {};
    const city = String(defaults.city ?? '').trim();
    const keyword = String(args.keyword ?? (Array.isArray(defaults.keywords) ? defaults.keywords.join(' ') : '')).trim();
    const channels = (Array.isArray(spec.channels) ? spec.channels : []).filter((channel) => channel !== null && typeof channel === 'object' && channel.enabled !== false);
    log('规格：' + channels.length + ' 个启用渠道，城市=' + (city === '' ? '（未设置）' : city) + '，关键词=' + (keyword === '' ? '（未设置）' : keyword));

    if (channels.length === 0) {
      status.state = 'done'; status.message = '没有启用的渠道，未检索。'; status.finishedAt = isoWithOffset(new Date());
      save();
      log('没有启用的渠道，直接结束。');
      return 0;
    }

    const playwright = deps.browser === undefined ? await loadPlaywright() : deps.browser;
    const context = await playwright.chromium.launchPersistentContext(join(root, 'browser-profile'), {
      headless: false,
      locale: 'zh-CN',
      viewport: { width: 1440, height: 900 },
    });
    try {
      for (const channel of channels) {
        status.channel = String(channel.id ?? '');
        status.page = 0;
        save();
        const found = await collectChannel(context, channel, {
          keyword: keyword, city: city,
          onProgress: (pageNo) => { status.page = pageNo; save(); log(status.channel + ' 第 ' + pageNo + ' 页'); },
        });
        const collectedAt = isoWithOffset(new Date());
        const rows = [];
        for (const row of found) {
          const feedRow = toFeedRow(row, channel.id, collectedAt);
          if (feedRow.sourceUrl === '' || feedRow.title === '' || feedRow.company === '') { status.skippedLines += 1; continue; }
          rows.push(feedRow);
        }
        status.addedLines += appendFeed(String(spec.feedPath), rows);
        save();
      }
    } finally {
      await context.close().catch(() => {});
    }
    status.state = 'done';
    status.channel = null;
    status.finishedAt = isoWithOffset(new Date());
    save();
    log('完成：新增 ' + status.addedLines + ' 行，跳过 ' + status.skippedLines + ' 行。');
    return 0;
  } catch (error) {
    status.state = 'error';
    status.error = (error && error.code) || 'collector-failed';
    status.message = String(error && error.message ? error.message : error).slice(0, 400);
    status.finishedAt = isoWithOffset(new Date());
    save();
    console.error('[collector] 失败：' + status.message);
    return 1;
  } finally {
    if (timer !== null) clearTimeout(timer);
    releaseLock(lockPath);
  }
}

const invoked = process.argv[1] === undefined ? '' : pathToFileURL(process.argv[1]).href;
if (import.meta.url === invoked) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error) => {
    console.error('[collector] 未捕获异常：' + String(error && error.stack ? error.stack : error));
    process.exitCode = 1;
  });
}
