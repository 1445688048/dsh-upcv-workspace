/**
 * 岗位页 UI 自检（真实 React + jsdom + 真实事件）：
 * 查询按钮三态 / 未安装置灰 / 紧凑行列表 / 行内「定制」带 jobId 跳 JD 对齐并预填目标岗位。
 *
 * 为什么不用 renderToString：预填、三态、跳转都发生在 effect 与事件里，SSR 不跑 effect。
 * 运行：node tests/jobs-ui.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASAR_MODULES = '/Applications/DSH Desktop.app/Contents/Resources/app.asar/node_modules/';

if (!existsSync(ASAR_MODULES + 'jsdom') || !existsSync(ASAR_MODULES + 'react-dom')) {
  console.log('SKIP: 本机找不到 DSH Desktop 自带的 jsdom/react-dom，跳过岗位页 UI 自检。');
  process.exit(0);
}

// React 的 key 警告会刷屏（JdPage 存量代码）；收集起来不干扰测试输出
const warnings = [];
const realError = console.error;
console.error = (...args) => { warnings.push(args.map(String).join(' ')); };
process.on('exit', () => { console.error = realError; });

const require = createRequire(import.meta.url);
const { JSDOM } = require(ASAR_MODULES + 'jsdom');
const React = require(ASAR_MODULES + 'react');
const { createRoot } = require(ASAR_MODULES + 'react-dom/client');
const act = React.act;

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost/',
  beforeParse(win) { Object.defineProperty(win.navigator, 'language', { value: 'zh-CN', configurable: true }); },
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Node = dom.window.Node;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// ── 假后端：岗位库 / spec / 采集器状态（每次测试可改）──
const JOB_A = {
  id: 'j1', collectedAt: '2026-10-20T14:30:00+08:00', source: 'shixiseng',
  sourceUrl: 'https://www.shixiseng.com/intern/aaa', title: '前端开发实习生', company: '某某科技',
  city: '深圳', cityNorm: '深圳', salary: '250-400元/天',
  salaryRange: { min: 5437, max: 8700, period: 'month' }, tags: ['Vue', 'React'], status: 'new', statusAt: null, raw: {},
};
const JOB_B = {
  id: 'j2', collectedAt: '2026-10-20T10:02:00+08:00', source: 'liepin',
  sourceUrl: 'https://www.liepin.com/job/bbb', title: '前端工程师', company: '另一家网络',
  city: '深圳', cityNorm: '深圳', salary: '15-25K',
  salaryRange: { min: 15000, max: 25000, period: 'month' }, tags: ['TypeScript'], status: 'applied', statusAt: null, raw: {},
};
const SPEC = {
  version: 1, feedPath: '/tmp/jobs-feed.jsonl',
  defaults: { city: '深圳', keywords: ['前端'] },
  channels: [], rules: '只读不写',
};

const SOURCES = [
  { id: 'shixiseng', enabled: true, entry: 'https://www.shixiseng.com/s?k={keyword}', hasAuth: true, loginUrl: 'https://www.shixiseng.com/user/login', status: { state: 'ok', note: '命中已登录标记', checkedAt: '2026-10-20T18:30:00+08:00' } },
  { id: 'liepin', enabled: false, entry: 'https://www.liepin.com/city-深圳/{keyword}/', hasAuth: false, loginUrl: '', status: { state: 'disabled' } },
  { id: 'other', enabled: true, entry: 'https://other.test/', hasAuth: false, loginUrl: '', status: { state: 'no-auth' } },
];

let jobs = [JOB_A, JOB_B];
let installed = true;
let collectState = 'idle';
let sessionMode = false;
let statusFails = false;
let lastCollectBody = null;
const statusObject = () => {
  if (collectState === 'running') return { state: 'running', channel: 'shixiseng', page: 1, addedLines: 3, startedAt: '2026-10-20T14:02:00+08:00', finishedAt: null, error: null };
  if (collectState === 'done') {
    if (sessionMode) return {
      state: 'done', mode: 'session', sessionId: 'session-test', sessionTitle: '岗位检索 · 前端', keyword: '前端',
      addedLines: 9, ingested: { added: 7, duplicates: 2, dropped: 0, badLines: 0, warnings: [] },
      startedAt: '2026-10-20T13:50:00+08:00', finishedAt: '2026-10-20T13:58:00+08:00', error: null,
    };
    return { state: 'done', channel: null, page: 1, addedLines: 12, startedAt: '2026-10-20T13:50:00+08:00', finishedAt: '2026-10-20T13:58:00+08:00', error: null };
  }
  if (collectState === 'error') return { state: 'error', error: 'page-timeout', message: '猎聘第 1 页加载超时（60s）', startedAt: '2026-10-20T13:40:00+08:00', finishedAt: '2026-10-20T13:41:00+08:00' };
  return null;
};

globalThis.fetch = async (url, init) => {
  const target = String(url);
  const method = init !== undefined && init.method !== undefined ? String(init.method) : 'GET';
  let body = { ok: true };
  if (target.includes('/meta')) body = { ok: true, version: '0.14.0', ai: { available: true, providers: ['p'], models: ['m'] } };
  else if (target.includes('/jobs/collect/status')) {
    if (statusFails) throw new Error('status endpoint down');
    body = { ok: true, installed: installed, status: statusObject() };
  }
  else if (target.includes('/jobs/sources/check')) body = { ok: true, results: [{ id: 'shixiseng', state: 'ok', note: '命中已登录标记', checkedAt: '2026-10-20T18:30:00+08:00' }] };
  else if (target.includes('/jobs/sources/login')) body = { ok: true, url: 'https://www.shixiseng.com/user/login' };
  else if (target.includes('/jobs/sources')) body = { ok: true, sources: SOURCES, browser: { port: 9333, running: true } };
  else if (target.includes('/jobs/collect')) {
    lastCollectBody = JSON.parse(String(init && init.body ? init.body : '{}'));
    collectState = 'running';
    body = { ok: true, started: true, status: statusObject() };
  } else if (target.includes('/jobs/feed')) body = { ok: true, items: jobs, note: 'ok' };
  else if (target.includes('/jobs/spec')) body = { ok: true, spec: SPEC, created: false };
  else if (target.includes('/jobs/ingest')) body = { ok: true, added: 0, duplicates: 0, dropped: 0, badLines: 0, warnings: [] };
  else if (target.includes('/store')) body = { items: [], note: 'ok' };
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => body };
};
dom.window.fetch = globalThis.fetch;

let captured = null;
dom.window.__ModuleLoader__ = { load: (mod) => { captured = mod; } };
(0, eval)(readFileSync(join(root, 'lib', 'client.js'), 'utf8'));
const plugin = captured.factory((id) => {
  if (id === 'react') return React;
  throw new Error('客户端只应 require react，却要求了 ' + id);
});
plugin.apply({ effect: (fn) => fn(), desktopWorkbenches: { register: () => () => {} } });
const debug = dom.window.__upcvDebug;
const h = React.createElement;

const host = dom.window.document.getElementById('root');
let reactRoot = null;
const flush = async (ms = 25) => { await act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); }); };
async function mount(element) {
  if (reactRoot !== null) await act(async () => { reactRoot.unmount(); });
  host.innerHTML = '';
  reactRoot = createRoot(host);
  await act(async () => { reactRoot.render(element); });
  await flush();
}
async function unmount() {
  if (reactRoot === null) return;
  await act(async () => { reactRoot.unmount(); });
  reactRoot = null;
  host.innerHTML = '';
}
async function click(selector) {
  const el = host.querySelector(selector);
  assert.ok(el !== null, '找不到可点击元素：' + selector);
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await flush();
}
async function clickText(text) {
  const nodes = [...host.querySelectorAll('button')];
  const hit = nodes.find((node) => (node.textContent || '').includes(text));
  assert.ok(hit !== undefined, '找不到按钮：' + text);
  await act(async () => { hit.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  await flush();
}
const text = () => host.textContent || '';

let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

const reset = () => { jobs = [JOB_A, JOB_B]; installed = true; collectState = 'idle'; sessionMode = false; lastCollectBody = null; statusFails = false; };

console.log('采集器未安装 / 三态');
await check('未安装：查询置灰、小字给出 setup 引导、空态说明安装', async () => {
  reset(); installed = false; jobs = [];
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  const query = host.querySelector('.upcv-jobs-head-actions .upcv-btn-primary');
  assert.ok(query !== null, '页头没有查询按钮');
  assert.equal(query.disabled, true, '未安装时查询必须置灰');
  assert.ok(text().includes('未安装采集器'), '小字要提示未安装');
  assert.ok(text().includes('setup-collector.mjs'), '要给出 setup 命令');
  assert.ok(text().includes('还没安装检索采集器'), '空态要说明先安装');
  await unmount();
});

await check('状态读取失败：明确提示，且不假装「未安装」', async () => {
  reset(); statusFails = true;
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  assert.ok(text().includes('读取检索状态失败'), '要明确提示读取失败');
  assert.ok(!text().includes('未安装采集器'), '读取失败不能冒充未安装');
  assert.equal(host.querySelector('.upcv-jobs-head-actions .upcv-btn-primary').disabled, true, '状态未知时查询不可点');
  await unmount();
  statusFails = false;
});

await check('检索中：按钮禁用显示「检索中…」，小字显示渠道与页数', async () => {
  reset(); collectState = 'running';
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  const query = host.querySelector('.upcv-jobs-head-actions .upcv-btn-primary');
  assert.equal(query.disabled, true);
  assert.ok((query.textContent || '').includes('检索中'), '按钮文案应为检索中');
  assert.ok(text().includes('检索中 · 实习僧 · 第 1 页'), '小字要显示进度：' + text().slice(0, 160));
  await unmount();
});

await check('会话式完成：小字显示自动入库条数（不再提示点整理）', async () => {
  reset(); sessionMode = true; collectState = 'done';
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  assert.ok(text().includes('已自动入库 7 条'), '要显示自动入库结果：' + text().slice(0, 200));
  assert.ok(text().includes('重复 2'), '要显示重复命中数');
  assert.ok(!text().includes('点「整理收件箱」入库'), '会话模式已自动入库，不应再提示去整理');
  await unmount();
});

await check('检索源弹窗：列出渠道、登录状态与操作按钮', async () => {
  reset();
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  await clickText('检索源');
  await flush();
  assert.ok(text().includes('实习僧'), '要列出渠道名');
  assert.ok(text().includes('已登录'), '要显示登录状态');
  assert.ok(text().includes('已停用'), '停用渠道要有标记');
  assert.ok(text().includes('无需登录'), '无登录要求的渠道要区分');
  const actions = [...host.querySelectorAll('.upcv-source-actions button')].map((node) => node.textContent);
  assert.ok(actions.includes('登录'), '要有登录按钮');
  assert.ok(actions.includes('检查'), '要有检查按钮');
  await unmount();
});

await check('完成：小字显示「上次查询：完成 · 新增 12 行 feed」并提示去整理', async () => {
  reset(); collectState = 'done';
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  assert.ok(text().includes('上次查询：完成'), '缺少完成文案');
  assert.ok(text().includes('新增 12 行 feed'), '缺少新增行数');
  assert.ok(text().includes('整理收件箱'), '要提示手动入库（不自动）');
  assert.equal(host.querySelector('.upcv-jobs-head-actions .upcv-btn-primary').disabled, false, '完成后查询按钮恢复可点');
  await unmount();
});

await check('失败：小字显示失败原因，按钮恢复可点', async () => {
  reset(); collectState = 'error';
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  assert.ok(text().includes('上次查询失败'), '缺少失败文案');
  assert.ok(text().includes('猎聘第 1 页加载超时'), '缺少失败原因');
  assert.equal(host.querySelector('.upcv-jobs-head-actions .upcv-btn-primary').disabled, false);
  await unmount();
});

await check('点查询：POST 带关键词（默认取 spec），状态转 running 且按钮禁用', async () => {
  reset();
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  assert.equal(lastCollectBody, null);
  await click('.upcv-jobs-head-actions .upcv-btn-primary');
  assert.deepEqual(lastCollectBody, { keyword: '前端' }, '默认关键词应取 spec.defaults.keywords');
  assert.equal(host.querySelector('.upcv-jobs-head-actions .upcv-btn-primary').disabled, true);
  assert.ok(text().includes('检索中'), '启动后应进入检索中状态');
  await unmount();
});

console.log('紧凑行列表与本地筛选');
await check('列表是紧凑行（无卡片），状态三按钮与定制/直链齐全', async () => {
  reset();
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  assert.equal(host.querySelectorAll('.upcv-jobrow').length, 2, '两条岗位应渲染成两行');
  assert.equal(host.querySelectorAll('.upcv-card').length, 0, '不应再出现卡片');
  assert.equal(host.querySelectorAll('.upcv-jobrow-custom').length, 2, '每行都要有定制按钮');
  assert.equal(host.querySelectorAll('.upcv-jobrow-link').length, 2, '每行都要有直链');
  assert.ok(host.querySelector('.upcv-jobrow-link').getAttribute('href').includes('shixiseng.com/intern/aaa'));
  assert.equal(host.querySelectorAll('.upcv-jobrow-seg button').length, 6, '每行 3 个状态按钮');
  assert.ok(text().includes('共 2 条 · 待投 1'), '筛选栏计数应按当前筛选：' + text().slice(0, 200));
  await unmount();
});

await check('本地筛选：状态「已投」只剩一条，来源/薪资下限可组合', async () => {
  reset();
  await mount(h(debug.JobsPage, { onBack: () => {}, onCustom: () => {} }));
  await clickText('已投');
  assert.equal(host.querySelectorAll('.upcv-jobrow').length, 1, '已投应只剩 JOB_B');
  assert.ok(text().includes('前端工程师'));
  assert.ok(!text().includes('前端开发实习生'), '待投的岗位应被筛掉');
  const floor = host.querySelector('.upcv-jobs-floor');
  assert.ok(floor !== null, '筛选栏缺少薪资下限下拉');
  await act(async () => {
    floor.value = '20000';
    floor.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });
  await flush();
  assert.equal(host.querySelectorAll('.upcv-jobrow').length, 0, '15-25K 的最低 15K < 20K 下限，应被筛掉');
  assert.ok(text().includes('没有匹配当前筛选的岗位'));
  await unmount();
});

console.log('「定制」跳转 JD 对齐并预填目标岗位');
await check('点行内定制：进入 JD 页，目标岗位预填、公司/直链展示、提示手贴 JD', async () => {
  reset();
  await mount(h(debug.Workbench, { service: {}, entry: {}, active: true, conversation: null }));
  await clickText('岗位推荐');
  assert.equal(host.querySelectorAll('.upcv-jobrow').length, 2, '应先到岗位页');
  await click('.upcv-jobrow-custom');
  const preset = host.querySelector('.upcv-jdsrc');
  assert.ok(preset !== null, '没有进入带预填的 JD 对齐页');
  const targetInput = host.querySelector('input[placeholder^="目标岗位"]');
  assert.ok(targetInput !== null, 'JD 页缺少目标岗位输入框');
  assert.equal(targetInput.value, '前端开发实习生', '目标岗位没有预填（jobId 没传到 JD 页？）');
  const link = host.querySelector('.upcv-jdsrc-link');
  assert.ok(link !== null, '预填条缺少 sourceUrl 直链');
  assert.equal(link.getAttribute('href'), JOB_A.sourceUrl);
  assert.ok(/rel="noopener/.test(link.outerHTML), '直链必须带 noopener');
  assert.ok(text().includes('某某科技'), '预填条要展示公司');
  assert.ok(text().includes('JD 原文需要你从上面的直链复制'), '要明确 JD 由用户手贴、不自动抓取');
  await unmount();
});

await check('从首页直接进 JD 页不带预填（preset 只在「定制」时生效）', async () => {
  reset();
  await mount(h(debug.Workbench, { service: {}, entry: {}, active: true, conversation: null }));
  await clickText('JD 对齐');
  assert.equal(host.querySelector('.upcv-jdsrc'), null, '普通入口不应出现岗位预填条');
  const targetInput = host.querySelector('input[placeholder^="目标岗位"]');
  assert.equal(targetInput.value, '', '普通入口不应预填目标岗位');
  await unmount();
});

console.log(''); console.log(passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
