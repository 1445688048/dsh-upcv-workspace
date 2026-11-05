/**
 * 内建采集器自检（全部离线）：采集器纯函数 / 页面提取 / CLI 契约 / 插件侧进程管理。
 *
 * 覆盖计划 11.5 的硬性验收：假 collector 桩脚本 spawn → 状态轮询 → 完成 → 超时强杀 → 单实例拒绝，
 * 以及「未安装返回 collector-not-installed」与真实 collector 的单实例锁。
 * 运行：node tests/collector.test.mjs
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildEntryUrl, clampMaxPages, extractJobsInPage, isoWithOffset, readSpec, toFeedRow,
} from '../collector/collector.js';
import {
  DEFAULT_TIMEOUT_MS, isPidAlive, readCollectorStatus, startCollect, writeCollectorStatus,
} from '../server/collector.js';

const nl = String.fromCharCode(10);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const COLLECTOR = join(root, 'collector', 'collector.js');
const ASAR_MODULES = '/Applications/DSH Desktop.app/Contents/Resources/app.asar/node_modules/';

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

const tempRoot = () => mkdtempSync(join(tmpdir(), 'upcv-collector-'));
const writeSpec = (dir, over) => {
  const spec = Object.assign({
    version: 1,
    feedPath: join(dir, 'jobs-feed.jsonl'),
    defaults: { city: '深圳', keywords: ['前端'] },
    channels: [],
    rules: '只读不写：不点投递、不发消息',
  }, over);
  writeFileSync(join(dir, 'jobs-spec.json'), JSON.stringify(spec, null, 2), 'utf8');
  return spec;
};
const installStub = (dir, body) => {
  mkdirSync(join(dir, 'collector'), { recursive: true });
  writeFileSync(join(dir, 'collector', 'collector.js'), body, 'utf8');
};
const waitFor = async (predicate, timeoutMs = 3000) => {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return predicate();
};

console.log('采集器纯函数');
await check('clampMaxPages 把单渠道页数钳在 [1,2]（红线：≤2）', async () => {
  assert.equal(clampMaxPages(1), 1);
  assert.equal(clampMaxPages(2), 2);
  assert.equal(clampMaxPages(9), 2);
  assert.equal(clampMaxPages(0), 1);
  assert.equal(clampMaxPages('x'), 1);
  assert.equal(clampMaxPages(undefined), 1);
});

await check('buildEntryUrl：关键词/城市各自 URL 编码，模板其余部分原样', async () => {
  assert.equal(
    buildEntryUrl('https://www.shixiseng.com/s?k={keyword}&city={city}', { keyword: 'Java 后端', city: '深圳' }),
    'https://www.shixiseng.com/s?k=Java%20%E5%90%8E%E7%AB%AF&city=%E6%B7%B1%E5%9C%B3'
  );
  assert.equal(buildEntryUrl('https://www.liepin.com/city-深圳/{keyword}/', { keyword: '前端', city: '深圳' }), 'https://www.liepin.com/city-深圳/%E5%89%8D%E7%AB%AF/');
  assert.equal(buildEntryUrl('', { keyword: 'x' }), '');
  assert.equal(buildEntryUrl('https://x.test/?q={keyword}&q={keyword}', { keyword: 'a b' }), 'https://x.test/?q=a%20b&q=a%20b');
});

await check('isoWithOffset 产出带时区偏移的 ISO 8601（feed 契约要求）', async () => {
  const text = isoWithOffset(new Date(2026, 9, 20, 14, 30, 5));
  assert.match(text, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{2}:\d{2}$/);
  assert.equal(new Date(text).getTime(), new Date(2026, 9, 20, 14, 30, 5).getTime());
});

await check('toFeedRow 的字段与 3.1 契约逐字段一致', async () => {
  const row = toFeedRow({ sourceUrl: ' https://x.test/j/1 ', title: ' 前端 ', company: ' 某公司 ', city: ' 深圳 ', salary: ' 250-400元/天 ', tags: ['Vue'] }, 'shixiseng', '2026-10-20T14:30:00+08:00');
  assert.deepEqual(Object.keys(row).sort(), ['city', 'collectedAt', 'company', 'raw', 'salary', 'source', 'sourceUrl', 'tags', 'title']);
  assert.equal(row.sourceUrl, 'https://x.test/j/1');
  assert.equal(row.source, 'shixiseng');
  assert.equal(row.title, '前端');
  assert.deepEqual(row.tags, ['Vue']);
  assert.deepEqual(row.raw, {});
});

await check('readSpec：缺 --spec / 文件不存在 / 坏 JSON / 相对 feedPath 都明确报错', async () => {
  const dir = tempRoot();
  try {
    assert.equal(readSpec('').error, 'spec-missing');
    assert.equal(readSpec(join(dir, 'nope.json')).error, 'spec-missing');
    writeFileSync(join(dir, 'broken.json'), '{ nope', 'utf8');
    assert.equal(readSpec(join(dir, 'broken.json')).error, 'spec-invalid');
    writeFileSync(join(dir, 'relative.json'), JSON.stringify({ feedPath: 'jobs-feed.jsonl', channels: [] }), 'utf8');
    assert.match(readSpec(join(dir, 'relative.json')).message, /绝对路径/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

console.log('页面提取（JSON-LD + 链接/容器启发式，无平台选择器）');
const require = createRequire(import.meta.url);
let JSDOM = null;
try { JSDOM = require(ASAR_MODULES + 'jsdom').JSDOM; } catch { /* 没有宿主就跳过 DOM 部分 */ }
const withDom = (html, fn) => {
  if (JSDOM === null) { console.log('       (跳过：本机没有 jsdom)'); return; }
  const dom = new JSDOM('<!doctype html><html><body>' + html + '</body></html>', { url: 'https://www.shixiseng.com/s?k=前端' });
  const previous = globalThis.document;
  globalThis.document = dom.window.document;
  try { fn(dom); } finally { globalThis.document = previous; dom.window.close(); }
};

await check('JSON-LD JobPosting 优先提取（标题/公司/城市/薪资/链接/标签）', async () => {
  const ld = {
    '@context': 'https://schema.org',
    '@type': 'JobPosting',
    title: '前端开发实习生',
    hiringOrganization: { '@type': 'Organization', name: '某某科技有限公司' },
    jobLocation: { '@type': 'Place', address: { addressLocality: '深圳' } },
    baseSalary: { '@type': 'MonetaryAmount', value: { minValue: 250, maxValue: 400, unitText: 'DAY' } },
    employmentType: ['INTERN'],
    url: 'https://www.shixiseng.com/intern/ld1',
  };
  withDom('<script type="application/ld+json">' + JSON.stringify(ld) + '</script>', () => {
    const jobs = extractJobsInPage({ baseUrl: 'https://www.shixiseng.com/s?k=x', fallbackCity: '深圳' });
    assert.equal(jobs.length, 1);
    assert.equal(jobs[0].title, '前端开发实习生');
    assert.equal(jobs[0].company, '某某科技有限公司');
    assert.equal(jobs[0].city, '深圳');
    assert.equal(jobs[0].salary, '250-400元/天');
    assert.equal(jobs[0].sourceUrl, 'https://www.shixiseng.com/intern/ld1');
    assert.deepEqual(jobs[0].tags, ['INTERN']);
  });
});

await check('链接启发式：只收有公司名/薪资/职位路径的条目，无公司名不编造', async () => {
  const html = [
    '<nav><a href="/job/nav1">登录</a></nav>',
    '<ul>',
      '<li><a href="/intern/good1">前端开发实习生</a><span>250-400元/天</span><span>深圳</span><span>某某网络科技有限公司</span></li>',
      '<li><a href="https://www.shixiseng.com/intern/good2">后端开发实习生</a><span>15-25K</span><span>云脉数据技术有限公司</span></li>',
      '<li><a href="/intern/nocompany">测试实习生</a><span>200-300元/天</span></li>',
      '<li><a href="/intern/good3">前端工程师</a><span>某某信息科技有限公司</span></li>',
    '</ul>',
  ].join('');
  withDom(html, () => {
    const jobs = extractJobsInPage({ baseUrl: 'https://www.shixiseng.com/s?k=x', fallbackCity: '深圳' });
    const urls = jobs.map((job) => job.sourceUrl);
    assert.ok(urls.includes('https://www.shixiseng.com/intern/good1'), '带薪资/公司/职位路径的条目要收：' + urls.join(','));
    assert.ok(urls.includes('https://www.shixiseng.com/intern/good2'), '第二类列表结构也要能收');
    assert.ok(!urls.some((url) => url.includes('nocompany')), '拿不到公司名的条目必须丢弃（不编造）');
    assert.ok(!urls.some((url) => url.includes('/job/nav1')), '导航链接必须排除');
    const first = jobs.find((job) => job.sourceUrl.includes('good1'));
    assert.equal(first.company, '某某网络科技有限公司');
    assert.equal(first.salary, '250-400元/天');
    assert.equal(first.city, '深圳');
  });
});

await check('同一页重复链接去重（sourceUrl 为主键）', async () => {
  const html = '<ul><li><a href="/intern/same">前端实习生</a><span>15-25K</span><span>某某科技有限公司</span></li><li><a href="/intern/same">前端实习生</a><span>15-25K</span><span>某某科技有限公司</span></li></ul>';
  withDom(html, () => {
    const jobs = extractJobsInPage({ baseUrl: 'https://www.shixiseng.com/s?k=x', fallbackCity: '深圳' });
    assert.equal(jobs.length, 1);
  });
});

console.log('采集器 CLI（真实进程，无 Playwright 也能验证契约与锁）');
const runCollector = (dir, extra = []) => spawnSync(process.execPath, [COLLECTOR, '--spec', join(dir, 'jobs-spec.json'), ...extra], {
  encoding: 'utf8',
  timeout: 15000,
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
});

await check('没有启用渠道：退出 0，写 done，feed 不创建，锁释放', async () => {
  const dir = tempRoot();
  try {
    writeSpec(dir);
    const result = runCollector(dir);
    assert.equal(result.status, 0, 'stderr: ' + result.stderr);
    const status = JSON.parse(readFileSync(join(dir, 'collector-status.json'), 'utf8'));
    assert.equal(status.state, 'done');
    assert.equal(status.addedLines, 0);
    assert.ok(Number.isFinite(status.pid), 'pid 必须记录（插件据此判断进程是否还活着）');
    assert.equal(existsSync(join(dir, 'collector.lock')), false, '正常结束必须释放锁');
    assert.equal(existsSync(join(dir, 'jobs-feed.jsonl')), false, '没有条目就不该创建 feed');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await check('单实例锁：锁被活着的进程持有时拒绝启动（退出 2，不碰状态文件）', async () => {
  const dir = tempRoot();
  try {
    writeSpec(dir);
    writeFileSync(join(dir, 'collector.lock'), JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() }), 'utf8');
    const result = runCollector(dir);
    assert.equal(result.status, 2, 'stderr: ' + result.stderr);
    assert.match(result.stderr, /已有一次检索在跑/);
    assert.equal(existsSync(join(dir, 'collector-status.json')), false, '拒绝启动时不得改写状态文件');
    assert.equal(existsSync(join(dir, 'collector.lock')), true, '不得删除别人的锁');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await check('坏 spec：退出 2 并把 spec-invalid 写进状态文件（原文件不动）', async () => {
  const dir = tempRoot();
  try {
    const broken = '{ broken json';
    writeFileSync(join(dir, 'jobs-spec.json'), broken, 'utf8');
    const result = runCollector(dir);
    assert.equal(result.status, 2);
    assert.equal(readFileSync(join(dir, 'jobs-spec.json'), 'utf8'), broken, '绝不自动重写 spec');
    const status = JSON.parse(readFileSync(join(dir, 'collector-status.json'), 'utf8'));
    assert.equal(status.state, 'error');
    assert.equal(status.error, 'spec-invalid');
    assert.equal(existsSync(join(dir, 'collector.lock')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

console.log('插件侧进程管理（桩 collector：spawn → 轮询 → 完成 / 超时 / 崩溃 / 单实例）');
const STUB_OK = [
  "const fs = require('fs'); const path = require('path');",
  "const root = path.dirname(process.argv[process.argv.indexOf('--spec') + 1]);",
  "const statusFile = path.join(root, 'collector-status.json');",
  "const write = (v) => fs.writeFileSync(statusFile, JSON.stringify(v));",
  "write({ state: 'running', channel: 'shixiseng', page: 1, addedLines: 0, startedAt: new Date().toISOString(), finishedAt: null, error: null, pid: process.pid });",
  "setTimeout(() => {",
  "  fs.appendFileSync(path.join(root, 'jobs-feed.jsonl'), JSON.stringify({ collectedAt: new Date().toISOString(), source: 'stub', sourceUrl: 'https://example.test/j/1', title: '前端实习', company: '桩公司', city: '深圳', salary: '250-400元/天', tags: [], raw: {} }) + String.fromCharCode(10));",
  "  write({ state: 'done', channel: null, page: 1, addedLines: 1, startedAt: new Date().toISOString(), finishedAt: new Date().toISOString(), error: null, pid: process.pid });",
  "  process.exit(0);",
  "}, 250);",
].join(nl);
const STUB_HANG = [
  "const fs = require('fs'); const path = require('path');",
  "const root = path.dirname(process.argv[process.argv.indexOf('--spec') + 1]);",
  "fs.writeFileSync(path.join(root, 'collector-status.json'), JSON.stringify({ state: 'running', channel: 'shixiseng', page: 1, addedLines: 0, startedAt: new Date().toISOString(), finishedAt: null, error: null, pid: process.pid }));",
  "setTimeout(() => {}, 20000);",
].join(nl);
const STUB_CRASH = [
  "const fs = require('fs'); const path = require('path');",
  "const root = path.dirname(process.argv[process.argv.indexOf('--spec') + 1]);",
  "fs.writeFileSync(path.join(root, 'collector-status.json'), JSON.stringify({ state: 'running', channel: 'shixiseng', page: 1, addedLines: 0, startedAt: new Date().toISOString(), finishedAt: null, error: null, pid: process.pid }));",
  "console.error('boom: 浏览器启动失败');",
  "process.exit(3);",
].join(nl);

await check('未安装：startCollect 返回 collector-not-installed，且不写状态', async () => {
  const dir = tempRoot();
  try {
    writeSpec(dir);
    const result = await startCollect({ root: dir });
    assert.equal(result.error, 'collector-not-installed');
    assert.match(result.message, /setup-collector\.mjs/);
    assert.equal(existsSync(join(dir, 'collector-status.json')), false);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await check('spawn → 状态 running → 单实例拒绝 → 完成 done（含 feed 追加）', async () => {
  const dir = tempRoot();
  try {
    writeSpec(dir);
    installStub(dir, STUB_OK);
    const first = await startCollect({ root: dir, keyword: '前端', timeoutMs: 5000 });
    assert.equal(first.started, true);
    assert.ok(Number.isFinite(first.pid));
    const during = readCollectorStatus(dir);
    assert.equal(during.installed, true);
    assert.equal(during.status.state, 'running');
    const second = await startCollect({ root: dir, keyword: '前端', timeoutMs: 5000 });
    assert.equal(second.error, 'collector-running');
    assert.ok(await waitFor(() => readCollectorStatus(dir).status.state === 'done', 3000), '桩 collector 应写 done');
    const status = readCollectorStatus(dir).status;
    assert.equal(status.addedLines, 1);
    assert.ok(readFileSync(join(dir, 'jobs-feed.jsonl'), 'utf8').includes('https://example.test/j/1'));
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await check('超时：SIGKILL 强杀，状态写 error/timeout，进程不再存活', async () => {
  const dir = tempRoot();
  try {
    writeSpec(dir);
    installStub(dir, STUB_HANG);
    const started = Date.now();
    // 容差放宽：全量 check 并发时轮询会慢，300ms 阈值 + 2s 窗口曾偶发超窗（flaky）
    const result = await startCollect({ root: dir, timeoutMs: 1500 });
    assert.equal(result.started, true);
    assert.ok(await waitFor(() => readCollectorStatus(dir).status.state === 'error', 4000), '超时要写 error');
    const status = readCollectorStatus(dir).status;
    assert.equal(status.error, 'timeout');
    assert.match(status.message, /强制结束/);
    assert.ok(await waitFor(() => isPidAlive(result.pid) === false, 4000), '超时后子进程必须被强杀');
    assert.ok(Date.now() - started < 9000);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await check('崩溃：子进程半路退出，兜底写 collector-exited 并带 stderr 尾巴', async () => {
  const dir = tempRoot();
  try {
    writeSpec(dir);
    installStub(dir, STUB_CRASH);
    await startCollect({ root: dir, timeoutMs: 5000 });
    assert.ok(await waitFor(() => readCollectorStatus(dir).status.state === 'error', 3000));
    const status = readCollectorStatus(dir).status;
    assert.equal(status.error, 'collector-exited');
    assert.match(status.message, /code=3/);
    assert.match(status.message, /boom/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

await check('状态文件异常：损坏 / 超大 / running 但 pid 已死或缺失都被翻成 error', async () => {
  const dir = tempRoot();
  try {
    installStub(dir, '');
    writeFileSync(join(dir, 'collector-status.json'), '{ broken', 'utf8');
    assert.equal(readCollectorStatus(dir).status.error, 'status-corrupt');
    writeFileSync(join(dir, 'collector-status.json'), JSON.stringify({ state: 'running', channel: 'x', pid: 99999999 }), 'utf8');
    assert.equal(readCollectorStatus(dir).status.error, 'collector-exited');
    writeFileSync(join(dir, 'collector-status.json'), JSON.stringify({ state: 'running', channel: 'x' }), 'utf8');
    assert.equal(readCollectorStatus(dir).status.error, 'collector-unverifiable');
    writeCollectorStatus(dir, { state: 'done', channel: null, page: 1, addedLines: 2, startedAt: 'x', finishedAt: 'y', error: null, pid: process.pid });
    assert.equal(readCollectorStatus(dir).status.state, 'done');
    assert.equal(DEFAULT_TIMEOUT_MS, 600000, '默认超时必须是 10 分钟');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
