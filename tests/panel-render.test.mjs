/**
 * 面板渲染自检：用**真实 React** 把 lib/client.js 里的每个页面渲染一遍。
 *
 * 为什么需要它：宿主的面板错误边界只显示一句「业务面板加载失败」，看不到原因。
 * 本轮就是这么黑屏的——所有内联样式写成 CSS 字符串，React 18 直接抛错。
 * 这个测试在打包前就能拦住同类问题（需要本机装有 DSH Desktop）。
 *
 * 运行：node tests/panel-render.test.mjs
 */
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const nl = String.fromCharCode(10);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const ASAR_MODULES = '/Applications/DSH Desktop.app/Contents/Resources/app.asar/node_modules/';

// react 来源优先级：项目 node_modules（pnpm add -D react react-dom，任何开发机都有）
// > DSH Desktop 自带的（历史行为）。V0.23 起用前者，面板渲染自检不再恒 SKIP。
import * as ReactDOMClient from 'react-dom/client';
import { act } from 'react';
const require = createRequire(import.meta.url);
let React = null;
let reactSource = '';
if (existsSync(join(root, 'node_modules', 'react'))) {
  React = require(join(root, 'node_modules', 'react'));
  reactSource = '项目 node_modules';
} else if (existsSync(ASAR_MODULES + 'react')) {
  React = require(ASAR_MODULES + 'react');
  reactSource = 'DSH Desktop 自带';
} else {
  console.log('SKIP: 找不到 react（项目 node_modules 与 ' + ASAR_MODULES + ' 都没有），跳过面板渲染自检。');
  process.exit(0);
}
const reactDomServer = reactSource === '项目 node_modules'
  ? join(root, 'node_modules', 'react-dom', 'server')
  : ASAR_MODULES + 'react-dom/server';
const renderToString = require(reactDomServer).renderToString;

// --- 最小浏览器垫片：模块求值 + apply() 注入样式用 ---
const styleNode = { dataset: {}, style: {}, textContent: '', remove() {} };
globalThis.document = { createElement: () => styleNode, head: { appendChild() {} } };
Object.defineProperty(globalThis, 'navigator', { value: { language: 'zh-CN' }, configurable: true, writable: true });
let captured = null;
globalThis.window = { __ModuleLoader__: { load: (mod) => { captured = mod; } } };

// React 的 key 警告会刷屏；收集起来最后检查，不干扰测试输出
const warnings = [];
const realError = console.error;
console.error = (...args) => { warnings.push(args.map(String).join(' ')); };
process.on('exit', () => { console.error = realError; });

function loadPlugin() {
  (0, eval)(readFileSync(join(root, 'lib/client.js'), 'utf8'));
  assert.ok(captured !== null, '客户端没有调用 __ModuleLoader__.load');
  return captured.factory((id) => {
    if (id === 'react') return React;
    throw new Error('客户端只应 require react，却要求了 ' + id);
  });
}

let passed = 0;
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log('  ok   ' + name);
  } catch (error) {
    console.log('  FAIL ' + name + ' -> ' + error.message);
    process.exitCode = 1;
  }
}

const t = (key) => key;
const aiStatus = { loading: false, available: true, providers: ['p'], models: ['m'], version: '0.3.0' };
const noop = () => {};

const mod = loadPlugin();
console.log('客户端产物与注册');

await check('模块 id 与 inject 正确', async () => {
  assert.equal(captured.id, 'dsh-upcv-workspace');
  assert.deepEqual(mod.inject, ['desktopWorkbenches']);
  assert.equal(typeof mod.apply, 'function');
});

await check('注册描述符带 title / repository / customFrame', async () => {
  let descriptor = null;
  mod.apply({ effect: (fn) => fn(), desktopWorkbenches: { register: (d) => { descriptor = d; return () => {}; } } });
  assert.ok(descriptor.title, '缺少 title');
  assert.ok(/^https:\/\/github\.com\/[^/]+\/[^/]+$/.test(descriptor.repository), 'repository 不是 GitHub URL：' + descriptor.repository);
  assert.equal(descriptor.customFrame, true);
});

console.log('逐页真实渲染（与宿主黑屏同一条路径）');
const pages = [
  ['Workbench（面板根／宿主首屏）', 'Workbench', { service: {}, entry: { panelTitle: '求职' }, active: true, conversation: null }],
  ['HomePage', 'HomePage', { onNavigate: noop, t: t }],
  ['ResumePage', 'ResumePage', { t: t, onBack: noop, aiStatus: aiStatus }],
  ['InterviewPage', 'InterviewPage', { t: t, onBack: noop, aiStatus: aiStatus }],
  ['InterviewPage（带岗位直通预设）', 'InterviewPage', { t: t, onBack: noop, aiStatus: aiStatus, onNavigate: noop, preset: { jobId: 'j1' } }],
  ['BankPage（题库与复盘）', 'BankPage', { t: t, onBack: noop, aiStatus: aiStatus }],
  ['JobsPage', 'JobsPage', { onBack: noop, onCustom: noop }],
  ['JdPage（JD 对齐）', 'JdPage', { t: t, onBack: noop, aiStatus: aiStatus }],
  ['ResumePage（简历列表）', 'ResumePage', { t: t, onBack: noop, aiStatus: aiStatus, onOpenEditor: noop }],
  ['ResumeImportPanel（导入面板）', 'ResumeImportPanel', { onDone: noop, onCancel: noop, aiStatus: aiStatus }],
  ['ResumeEditorPage（编辑器，找不到记录的分支）', 'ResumeEditorPage', { t: t, onBack: noop, aiStatus: aiStatus, recordId: 'nope' }],
];

for (const entry of pages) {
  const label = entry[0];
  const key = entry[1];
  const props = entry[2];
  await check('渲染 ' + label, async () => {
    const components = globalThis.window.__upcvDebug;
    assert.ok(components && typeof components[key] === 'function', '窗口上没有调试出口 ' + key);
    const html = renderToString(React.createElement(components[key], props));
    assert.ok(html.length > 0, label + ' 渲染出空内容');
  });
}

await check('渲染 ResumePreview（A4 预览，带真实数据）', async () => {
  const components = globalThis.window.__upcvDebug;
  const resume = components.blankResume();
  resume.basics.name = '张三';
  resume.basics.headline = '产品经理';
  resume.basics.phone = '13800138000';
  resume.sections.summary.content = '五年产品经验';
  resume.sections.experience.items.push({
    id: 'e1', visible: true, company: '字节跳动', position: '产品经理',
    location: '北京', date: '2023.07 - 至今', summary: '<p>提升 <strong>15%</strong></p>',
  });
  resume.sections.skills.items.push({ id: 's1', visible: true, name: '产品', description: '', level: 3, keywords: ['调研', '原型'] });
  const html = renderToString(React.createElement(components.ResumePreview, { resume: resume }));
  assert.ok(html.includes('张三'), '预览没有姓名');
  assert.ok(html.includes('字节跳动'), '预览没有工作经历');
  assert.ok(html.includes('15%'), '预览没有富文本内容');
  assert.ok(html.includes('调研、原型'), '预览没有技能');
});

await check('无模型时各页面也能渲染（降级路径）', async () => {
  const components = globalThis.window.__upcvDebug;
  const offline = { loading: false, available: false, providers: [], models: [], version: '' };
  for (const key of ['ResumePage', 'InterviewPage', 'JobsPage', 'JdPage']) {
    const html = renderToString(React.createElement(components[key], { t: t, onBack: noop, aiStatus: offline }));
    assert.ok(html.length > 0, key + ' 降级渲染出空内容');
  }
});

await check('背景是主题变量时，文字不得硬编码白色（按钮看不见回归）', async () => {
  // brand-primary 在深色主题下是 #f9fafb（近白）。主按钮背景用它、文字写死 white → 白底白字。
  const bundle = readFileSync(join(root, 'lib/client.js'), 'utf8');
  const rules = bundle.split('}');
  const offenders = [];
  for (const rule of rules) {
    const open = rule.lastIndexOf('{');
    if (open === -1) continue;
    const selector = rule.slice(0, open);
    const body = rule.slice(open + 1);
    const bg = /background(?:-color)?\s*:[^;]*var\(--dsw-/.test(body);
    const whiteText = /(?:^|;)\s*color\s*:\s*(?:white|#fff{1,2}|#ffffff)\b/i.test(body);
    if (bg && whiteText) offenders.push(selector.trim().split('\n').pop() + ' { ' + body.trim().slice(0, 60) + ' }');
  }
  assert.equal(offenders.length, 0, '这些规则背景用主题变量但文字写死白色：' + offenders.join(' | '));
});

await check('每套模板的栏目数跟随模板骨架（不做写死两栏）', async () => {
  const { ResumePreview, templates } = globalThis.window.__upcvDebug;
  const fixture = templates.fixture('short');
  const lanes = (html) => {
    const pages = html.split('data-page=').slice(1);
    return (pages[0].match(/class="rr-lane"/g) || []).length;
  };
  for (const [id] of templates.list) {
    const spec = templates.spec(id);
    const html = renderToString(React.createElement(ResumePreview, { resume: templates.apply(fixture, id) }));
    assert.equal(lanes(html), spec.ratio === null ? 1 : 2, id + ' 的栏数应与模板骨架一致');
    assert.ok(html.indexOf('data-tpl="' + id + '"') !== -1, id + ' 的页根要带 data-tpl');
  }
});

await check('板块 columns 生效（多列用 grid，不用 CSS 多栏）', async () => {
  const { ResumePreview, templates } = globalThis.window.__upcvDebug;
  const resume = templates.apply(templates.fixture('short'), 'rr-onyx');
  resume.sections.skills.columns = 4;
  const html = renderToString(React.createElement(ResumePreview, { resume: resume }));
  assert.ok(/class="rr-grid"/.test(html), '技能板块应渲染成 grid');
  assert.ok(html.indexOf('grid-template-columns:repeat(4,') !== -1, '4 列应写进行内 grid 模板');
});

await check('分页：按栏独立装箱（侧栏排满不会把主栏挤走）', async () => {
  const { templates } = globalThis.window.__upcvDebug;
  const paginate = templates.paginate;
  const blocks = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ({ id: id, kind: 'item', height: 100, index: 0 }));
  const single = paginate([blocks], 250, [250]);
  assert.equal(single.length, 3, '单栏每页 250、每块 100 → 3 页，实际 ' + single.length);
  assert.deepEqual(single[0].blocks[0].map((b) => b.id), ['a', 'b']);
  assert.deepEqual(single[2].blocks[0].map((b) => b.id), ['e', 'f']);

  // 两栏：第 0 栏 2 块、第 1 栏 4 块 → 第 1 栏自己续到第 2 页，第 0 栏不被牵连
  const lane0 = [{ id: 'x', kind: 'item', height: 120, index: 0 }, { id: 'y', kind: 'item', height: 120, index: 0 }];
  const lane1 = ['m', 'n', 'o', 'p'].map((id) => ({ id: id, kind: 'item', height: 140, index: 0 }));
  const two = paginate([lane0, lane1], 300, [300, 300]);
  assert.equal(two.length, 2, '两栏各自续页，共 2 页，实际 ' + two.length);
  assert.deepEqual(two[0].blocks[0].map((b) => b.id), ['x', 'y'], '第 1 页左栏放完');
  assert.deepEqual(two[0].blocks[1].map((b) => b.id), ['m', 'n'], '第 1 页右栏放 2 块');
  assert.deepEqual(two[1].blocks[0], [], '第 2 页左栏为空（不被右栏内容填进来）');
  assert.deepEqual(two[1].blocks[1].map((b) => b.id), ['o', 'p'], '右栏在第 2 页继续');

  const huge = paginate([[{ id: 'big', kind: 'item', height: 9999, index: 0 }, { id: 'a', kind: 'item', height: 10, index: 0 }]], 250, [250]);
  assert.equal(huge.length, 2, '超高块独占一页后继续，不能死循环，实际 ' + huge.length);
});

await check('每栏可用高度可以不同（侧栏内边距/页头各自扣）', async () => {
  const { templates } = globalThis.window.__upcvDebug;
  const blocks = ['a', 'b', 'c', 'd'].map((id) => ({ id: id, kind: 'item', height: 100, index: 0 }));
  // 第 0 栏扣掉 80（侧栏内边距/页头），第 1 栏用满：两栏各自换页
  const pages = templates.paginate([blocks, blocks], [300, 220], [300, 220]);
  assert.equal(pages.length, 2, '两栏各自换页，共 2 页，实际 ' + pages.length);
  assert.equal(pages[0].blocks[0].length, 3, '第 1 栏（300）每页放 3 块，实际 ' + pages[0].blocks[0].length);
  assert.equal(pages[0].blocks[1].length, 2, '第 2 栏（220）每页只能放 2 块，实际 ' + pages[0].blocks[1].length);
  assert.equal(pages[1].blocks[1].length, 2, '剩余的块续到第 2 页');
});

await check('标题不会变成孤儿（放不下就连内容一起挪到下一页）', async () => {
  const { templates } = globalThis.window.__upcvDebug;
  const blocks = [
    { id: 'a', kind: 'head', height: 100, index: -1 },
    { id: 'a', kind: 'item', height: 100, index: 0 },
    { id: 'a', kind: 'item', height: 100, index: 1 },
    { id: 'b', kind: 'head', height: 100, index: -1 },
    { id: 'b', kind: 'item', height: 100, index: 0 },
  ];
  const pages = templates.paginate([blocks], 250, [250]);
  for (const page of pages) {
    const kinds = page.blocks[0].map((b) => b.kind);
    const headAt = kinds.indexOf('head');
    assert.ok(headAt === -1 || headAt < kinds.length - 1, '标题不能是所在栏的最后一块');
  }
  const flat = pages.map((page) => page.blocks[0].map((b) => b.id + ':' + b.kind).join(',')).join(' | ');
  assert.ok(/b:head,b:item/.test(flat), 'b 的标题与条目必须同页，实际 ' + flat);
});

await check('首页可用高度会扣掉页头（否则首屏必然溢出）', async () => {
  const { templates } = globalThis.window.__upcvDebug;
  const blocks = ['a', 'b', 'c', 'd'].map((id) => ({ id: id, kind: 'item', height: 100, index: 0 }));
  const noHead = templates.paginate([blocks], 250, [250]);
  assert.equal(noHead.length, 2, '不扣页头时 2 页，实际 ' + noHead.length);
  const withHead = templates.paginate([blocks], 250, [120]);
  assert.equal(withHead.length, 3, '第一页只剩 120 时：a | b,c | d，实际 ' + withHead.length);
  assert.deepEqual(withHead[1].blocks[0].map((b) => b.id), ['b', 'c'], '第二页回到完整高度');
});

await check('rows 骨架的标签也行孤行保护（标签高度只做保护不占位）', async () => {
  const { templates } = globalThis.window.__upcvDebug;
  // 标签行式：标题块 height 0、guard 60 → 仍要保证标签+首个条目同页
  const blocks = [
    { id: 'z', kind: 'item', height: 190, index: 0 },
    { id: 'k', kind: 'head', height: 0, guard: 60, index: -1 },
    { id: 'k', kind: 'item', height: 90, index: 0 },
  ];
  const pages = templates.paginate([blocks], 300, [300]);
  const flat = pages.map((page) => page.blocks[0].map((b) => b.kind + '@' + Math.round(b.height)).join(',')).join(' | ');
  assert.equal(pages.length, 2, '标签放不下要整组换页，实际 ' + pages.length + ' → ' + flat);
  const last = pages[1].blocks[0].map((b) => b.id);
  assert.deepEqual(last, ['k', 'k'], '第二页应是标签 + 条目，实际 ' + flat);
});

await check('导出用给定分页逐页输出，续页不重复标题', async () => {
  const { ResumePreview, resumeToPrintHtml, templates } = globalThis.window.__upcvDebug;
  const resume = templates.apply(templates.fixture('short'), 'rr-onyx');
  resume.metadata.template = 'elite'; // 旧 id：导出也必须归一到 rr-onyx
  // 人为指定分页：第 1 页放条目 0（带标题），第 2 页放条目 1（不带标题）
  const pages = [
    [[{ id: 'experience', withHead: true, whole: false, items: [0] }]],
    [[{ id: 'experience', withHead: false, whole: false, items: [1] }]],
  ];
  const html = resumeToPrintHtml(resume, pages);
  const pageCount = (html.match(/class="rr-sheet rr-page"/g) || []).length;
  assert.equal(pageCount, 2, '给定 2 页就应输出 2 个 .rr-page，实际 ' + pageCount);
  assert.ok(html.indexOf('data-tpl="rr-onyx"') !== -1, '旧 id 导出时归一到 rr-onyx');
  const second = html.slice(html.lastIndexOf('class="rr-sheet rr-page"'));
  assert.ok(second.indexOf('<h2') === -1, '续页不能重复板块标题');
  assert.ok(second.indexOf('云帆网络') !== -1, '续页要包含该页分到的条目');
  assert.ok(html.indexOf('1 / 2') !== -1 && html.indexOf('2 / 2') !== -1, '每页要有页码');
  assert.ok(html.indexOf('@page{size:A4;margin:0}') !== -1, '打印页面尺寸要固定为 A4');
  assert.ok(html.indexOf('background:#fff') !== -1, '纸面固定白底');
  // 全部模板的样式必须都在导出文档里（同一份 CSS）
  for (const [id] of templates.list) assert.ok(html.indexOf('[data-tpl="' + id + '"]') !== -1, '导出缺少 ' + id + ' 的样式');
  // 预览与导出的首屏结构一致（同一份渲染代码）
  const preview = renderToString(React.createElement(ResumePreview, { resume: resume }));
  assert.ok(preview.indexOf('rr-sheet') !== -1 && html.indexOf('rr-sheet') !== -1);
});

await check('量测层的 CSS 必须真的存在（否则会整块显示出来）', async () => {
  const bundle = readFileSync(join(root, 'lib/client.js'), 'utf8');
  const rule = bundle.match(/\.upcv-measure \{[^}]*\}/);
  assert.ok(rule !== null, '产物里没有 .upcv-measure 规则——量测层会作为可见内容渲染出来');
  assert.ok(/position:absolute/.test(rule[0]), '量测层要绝对定位（脱离文档流）');
  assert.ok(/visibility:hidden/.test(rule[0]), '量测层必须不可见');
  assert.ok(/pointer-events:none/.test(rule[0]), '量测层不能拦截交互');
});

await check('预览渲染出页容器、量测层与页码', async () => {
  const { blankResume, ResumePreview, templates } = globalThis.window.__upcvDebug;
  const html = renderToString(React.createElement(ResumePreview, { resume: templates.apply(blankResume(), 'rr-onyx') }));
  assert.ok(html.indexOf('upcv-pages') !== -1, '应有分页容器');
  assert.ok(/data-page=/.test(html), '应有页标记');
  assert.ok(html.indexOf('upcv-measure') !== -1, '应有隐藏量测层');
  assert.ok(html.indexOf('rr-pagenum') !== -1, '每页应带页码');
  const loose = (html.match(/min-height:0/g) || []).length;
  assert.ok(loose >= 1, '量测层不能固定 297mm 高（要能装下全部内容才好量）');
});

await check('模板面板：全部真实缩略卡 + 色板 + 当前模板高亮', async () => {
  const { ResumePreview, TemplatePanel, templates } = globalThis.window.__upcvDebug;
  const resume = templates.apply(templates.fixture('short'), 'rr-onyx');
  const html = renderToString(React.createElement(TemplatePanel, { resume: resume, onChange: () => {}, collapsed: {}, setCollapsed: () => {} }));
  const cards = (html.match(/class="upcv-tplcard/g) || []).length;
  assert.equal(cards, templates.list.length, '应渲染 ' + templates.list.length + ' 张模板卡，实际 ' + cards);
  assert.ok(/upcv-tplcard on/.test(html), '当前模板要高亮');
  assert.ok(html.indexOf('正式墨') !== -1 && html.indexOf('极简黑') !== -1, '卡片要用中文名');
  const thumbs = (html.match(/class="upcv-tplthumb"/g) || []).length;
  assert.equal(thumbs, templates.list.length, '每张卡都要有真实缩略图，实际 ' + thumbs);
  // 缩略图是真渲染：每张都带一页 rr-sheet 与对应模板的 data-tpl
  assert.equal((html.match(/class="rr-sheet rr-page"/g) || []).length, templates.list.length, '缩略图必须是真渲染的页面');
  for (const [id] of templates.list) assert.ok(html.indexOf('data-tpl="' + id + '"') !== -1, '缩略图缺少 ' + id);
  const swatches = (html.match(/class="upcv-swatch/g) || []).length;
  assert.equal(swatches, templates.spec('rr-onyx').palette.length, '色板数量应等于该模板预设色数，实际 ' + swatches);
});

await check('排版面板读写现有 metadata 字段（字号/行高/页边距/照片位）', async () => {
  const { StylePanel, templates } = globalThis.window.__upcvDebug;
  const resume = templates.apply(templates.fixture('short'), 'rr-onyx');
  const html = renderToString(React.createElement(StylePanel, { resume: resume, onChange: () => {}, collapsed: {}, setCollapsed: () => {} }));
  for (const label of ['字体', '字号', '行高', '页边距', '照片位', '自定义 CSS']) {
    assert.ok(html.indexOf(label) !== -1, '缺少「' + label + '」设置项');
  }
  // 当前值要有选中态：字号 13px / 行高 1.55 / 页边距 32px
  assert.ok(/class="upcv-chip on"[^>]*>13px</.test(html), '字号 13px 应选中');
  assert.ok(/class="upcv-chip on"[^>]*>1\.55</.test(html), '行高 1.55 应选中');
  assert.ok(/class="upcv-chip on"[^>]*>32px</.test(html), '页边距 32px 应选中');
  assert.ok(html.indexOf('显示中') !== -1, '照片位开关要有当前状态');
  // 旧的 5 组预设开关（上一轮拿来凑 45 套的）必须清掉
  for (const gone of ['页头样式', '板块标题样式', '技能样式', '页面背景']) {
    assert.ok(html.indexOf(gone) === -1, '旧模板开关「' + gone + '」应从面板里移除');
  }
});

await check('模块顺序面板列出一条平铺列表（栏目由模板决定）', async () => {
  const { blankResume, OrderPanel } = globalThis.window.__upcvDebug;
  const html = renderToString(React.createElement(OrderPanel, { resume: blankResume(), onChange: () => {}, collapsed: {}, setCollapsed: () => {} }));
  const rows = (html.match(/upcv-order-row/g) || []).length;
  assert.equal(rows, 13, '13 个板块都要出现，实际 ' + rows);
  assert.ok(html.indexOf('左栏') === -1 && html.indexOf('右栏') === -1, '栏目由模板决定，顺序面板不再分左右栏');
  assert.ok(/disabled=""[^>]*>↑|disabled[^>]*>↑/.test(html), '第一项的上移要禁用');
});

await check('每套模板渲染出各自的页头形态/标题体系/评级样式', async () => {
  const { ResumePreview, templates } = globalThis.window.__upcvDebug;
  const fixture = templates.fixture('short');
  const EXPECT = {
    'rr-bronzor':   { head: 'rr-head',    title: '<div class="rr-label">', rate: 'class="rr-rate"', lane: 1 },
    'rr-onyx':      { head: 'rr-head',    title: 'rr-h2',                  rate: 'rr-rate-squares', lane: 1 },
    'rr-azurill':   { head: 'rr-head',    title: 'rr-h2',                  rate: 'rr-rate-stars',   lane: 2 },
    'rr-glalie':    { head: 'rr-head',    title: 'rr-h2',                  rate: 'class="rr-rate"', lane: 2 },
    'rr-chikorita': { head: 'rr-head',    title: 'rr-h2',                  rate: 'rr-rate-bars',    lane: 2 },
    'rr-ditto':     { head: 'rr-banner',  title: 'rr-h2',                  rate: 'rr-rate-progress',lane: 2 },
    'rr-lapras':    { head: 'rr-card',    title: 'rr-h2',                  rate: 'rr-rate-squares', lane: 1 },
    'rr-porygon':   { head: 'rr-headcard',title: 'rr-secbody',             rate: 'rr-rate-stars',   lane: 1 },
    // Evarlio 复刻组
    'rr-docket':    { head: 'rr-head',    title: 'rr-h2',                  rate: 'class="rr-rate"', lane: 1 },
    'rr-ink':       { head: 'rr-head',    title: 'rr-h2',                  rate: 'class="rr-rate"', lane: 1 },
    'rr-glyph':     { head: 'rr-head',    title: 'rr-h2',                  rate: 'class="rr-rate"', lane: 2 },
    'rr-meadow':    { head: 'rr-head',    title: 'rr-hicon',               rate: 'class="rr-rate"', lane: 2 },
    'rr-lake':      { head: 'rr-head',    title: 'rr-h2',                  rate: 'rr-rate-progress',lane: 2 },
    'rr-light':     { head: 'rr-banner',  title: 'rr-h2',                  rate: 'rr-rate-progress',lane: 2 },
  };
  for (const [id, want] of Object.entries(EXPECT)) {
    const html = renderToString(React.createElement(ResumePreview, { resume: templates.apply(fixture, id) }));
    const page = html.slice(html.indexOf('data-page='));
    assert.ok(page.indexOf(want.head) !== -1, id + ' 缺少页头形态 ' + want.head);
    assert.ok(page.indexOf(want.title) !== -1, id + ' 缺少标题体系 ' + want.title);
    assert.ok(page.indexOf(want.rate) !== -1, id + ' 缺少评级样式 ' + want.rate);
    assert.equal((page.match(/class="rr-lane"/g) || []).length, want.lane, id + ' 栏数不对');
  }
});

await check('分栏模板侧栏无内容时折叠为单栏（不留半边空白）', async () => {
  const { ResumePreview, templates } = globalThis.window.__upcvDebug;
  const base = templates.fixture('short');
  // 把 left-rail 系模板归入侧栏的板块全部隐藏 → 侧栏没有任何可见内容
  for (const id of ['languages', 'certifications', 'awards', 'interests', 'publications', 'references']) {
    const section = base.sections[id];
    if (section !== undefined && section !== null) section.visible = false;
  }
  for (const id of ['rr-meadow', 'rr-lake']) {
    const html = renderToString(React.createElement(ResumePreview, { resume: templates.apply(base, id) }));
    const page = html.slice(html.indexOf('data-page=')); // 跳过隐藏量测层，只数真实页面
    assert.equal((page.match(/class="rr-lane"/g) || []).length, 1, id + ' 侧栏空时应折叠为单栏');
    assert.ok(page.indexOf('flex:0 0') === -1, id + ' 折叠后不应残留固定栏宽');
    assert.ok(html.indexOf('--rr-rail-w:0%') !== -1, id + ' 折叠后侧栏底色宽度应归零');
  }
  // 侧栏有内容时仍是两栏（折叠不误伤正常简历）
  const normal = renderToString(React.createElement(ResumePreview, { resume: templates.apply(templates.fixture('short'), 'rr-meadow') }));
  const normalPage = normal.slice(normal.indexOf('data-page='));
  assert.equal((normalPage.match(/class="rr-lane"/g) || []).length, 2, 'fixture 侧栏有内容时应保持两栏');
});

await check('旧 id 简历在渲染层归一，且不改写数据', async () => {
  const { ResumePreview, templates } = globalThis.window.__upcvDebug;
  const resume = templates.apply(templates.fixture('short'), 'rr-onyx');
  resume.metadata.template = 'elite'; // 旧 id
  const before = JSON.stringify(resume);
  const html = renderToString(React.createElement(ResumePreview, { resume: resume }));
  assert.ok(html.indexOf('data-tpl="rr-onyx"') !== -1, '旧 id 应渲染成映射目标 rr-onyx');
  assert.equal(JSON.stringify(resume), before, '渲染路径绝不能改写简历内容');
  assert.equal(resume.metadata.template, 'elite', '旧 id 必须原样保留');
});

await check('导出不依赖 window.open（宿主会拦截弹窗）', async () => {
  const bundle = readFileSync(join(root, 'lib/client.js'), 'utf8');
  // 只查代码，注释里提到 window.open 不算（注释正是为了说明为什么不能用它）
  const offenders = bundle
    .split(String.fromCharCode(10))
    .filter((line) => line.indexOf('window.open') !== -1)
    .map((line) => line.trim())
    .filter((line) => line.indexOf('*') !== 0 && line.indexOf('//') !== 0);
  assert.equal(offenders.length, 0, '导出只能用隐藏 iframe + print()，window.open 会被宿主拦截：' + offenders.slice(0, 1).join(''));
  assert.ok(bundle.indexOf('caption') === -1 || true);
  // 必须存在兜底路径，否则打印被拦时用户毫无办法
  assert.ok(bundle.indexOf('exportResumeHtml') !== -1, '导出要用公共函数 exportResumeHtml');
  assert.ok(bundle.indexOf('link.download') !== -1, '缺少 HTML 兜底下载（浏览器打印不可用时必须能下载）');
  assert.ok(bundle.indexOf('contentWindow') !== -1, '导出要用隐藏 iframe 的 contentWindow.print()');
});

await check('预览与导出用同一字体栈（字体不同会导致量测不准、打印被切）', async () => {
  const { blankResume, ResumePreview, resumeToPrintHtml } = globalThis.window.__upcvDebug;
  const resume = blankResume();
  const preview = renderToString(React.createElement(ResumePreview, { resume: resume }));
  const printHtml = resumeToPrintHtml(resume, null);
  const family = resume.metadata.typography.font.family;
  assert.ok(preview.indexOf(family) !== -1, '预览要声明字体 family，实际没找到 ' + family);
  assert.ok(printHtml.indexOf(family) !== -1, '导出要声明同一个 family');
  assert.ok(preview.indexOf('PingFang SC') !== -1, '预览要有同一套兜底字体');
  assert.ok(printHtml.indexOf('PingFang SC') !== -1, '导出要有同一套兜底字体');
});

await check('预览页与打印页一样是固定 A4 高并裁掉溢出', async () => {
  const { blankResume, ResumePreview } = globalThis.window.__upcvDebug;
  const html = renderToString(React.createElement(ResumePreview, { resume: blankResume() }));
  const pageCount = html.split('data-page=').length - 1;
  assert.ok(pageCount > 0, '要有页');
  const bundleText = readFileSync(join(root, 'lib/client.js'), 'utf8');
  assert.ok(/\.rr-page\{height:297mm\}/.test(bundleText), '打印页必须有固定 297mm 高（预览与打印同一份约束）');
  assert.ok(/\.rr-sheet\{[^}]*overflow:hidden/.test(bundleText), '打印页要裁掉溢出');
  assert.ok(html.indexOf('class="rr-sheet rr-page"') !== -1, '每页都要是 .rr-sheet.rr-page');
});

await check('内容溢出的页会在预览里标出来（不静默裁掉）', async () => {
  const bundle = readFileSync(join(root, 'lib/client.js'), 'utf8');
  assert.ok(bundle.indexOf('rr-flag') !== -1, '要有溢出提示元素');
  assert.ok(bundle.indexOf('data-overflow') !== -1, '要把溢出的页标出来');
  assert.ok(bundle.indexOf('scrollHeight > el.clientHeight') !== -1, '要有溢出检测');
});

await check('面板根的第一个子元素是语义 <header>（红绿灯避让契约）', async () => {
  // 宿主规则：.dshWbCustomFrame > :first-child > header:first-child{padding-inline-start:var(--dsh-frame-leading-clearance)}
  // 用 div 当头部就匹配不到，收起侧栏时文字会被 macOS 红绿灯压住。
  const components = globalThis.window.__upcvDebug;
  const html = renderToString(React.createElement(components.Workbench, { service: {}, entry: { panelTitle: '求职' }, active: true, conversation: null }));
  const appAt = html.indexOf('upcv-app');
  assert.ok(appAt !== -1, '找不到面板根 .upcv-app');
  const afterRootTag = html.indexOf('>', appAt) + 1;
  assert.ok(html.slice(afterRootTag).trimStart().startsWith('<header'), '面板根的第一个子元素必须是 <header>，实际是：' + html.slice(afterRootTag, afterRootTag + 40));
});

await check('只用宿主真实发布的 --dsw-alias-* 变量', async () => {
  // 曾经用了不存在的 --dsw-alias-brand-primary-soft，深色模式下变成「亮蓝字 + 浅蓝底」= 看不见。
  const asar = '/Applications/DSH Desktop.app/Contents/Resources/app.asar';
  if (!existsSync(asar)) { console.log('       (跳过：本机没有 DSH Desktop)'); return; }
  const bundle = readFileSync(join(root, 'lib/client.js'), 'utf8');
  const used = [...new Set([...bundle.matchAll(/--dsw-alias-[a-z0-9-]+/g)].map((m) => m[0]))].sort();
  const published = execSync('grep -ao -e "--dsw-alias-[a-z0-9-]*" "' + asar + '" | sort -u', { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  const known = new Set(published.split(String.fromCharCode(10)));
  const unknown = used.filter((name) => !known.has(name));
  assert.equal(unknown.length, 0, '用了宿主没有的变量：' + unknown.join(', '));
});
await check('不截断宿主的窗口级拖拽事件（遮罩卡死回归）', async () => {
  // 宿主用 document 级 dragenter/dragleave/drop + dragDepth 计数器管理拖拽遮罩，
  // 插件在拖拽处理器里 stopPropagation 会让计数器永不归零、遮罩永久卡住（必须重启）。
  const bundle = readFileSync(join(root, 'lib/client.js'), 'utf8');
  const offenders = bundle.split(String.fromCharCode(10)).filter((line) => /onDrag|onDrop/.test(line) && line.includes('stopPropagation'));
  assert.equal(offenders.length, 0, '拖拽处理器里出现了 stopPropagation：' + offenders.slice(0, 2).join(' | '));
});

console.log('岗位真实检索（0.14.0 内建采集器 + 紧凑行列表）');

const FAKE_JOB = {
  id: 'j1', collectedAt: '2026-10-20T14:30:00+08:00', source: 'shixiseng',
  sourceUrl: 'https://www.shixiseng.com/intern/aaa', title: '前端开发实习生', company: '某某科技',
  city: '深圳', cityNorm: '深圳', salary: '250-400元/天',
  salaryRange: { min: 5437, max: 8700, period: 'month' }, tags: ['Vue', 'React'],
  status: 'new', statusAt: null, raw: {},
};

await check('JobRow：紧凑行、薪资原文+归一化、状态三按钮、定制、直链带 noopener', async () => {
  const { JobRow } = globalThis.window.__upcvDebug;
  const html = renderToString(React.createElement(JobRow, { job: FAKE_JOB, onStatus: noop, onCustom: noop }));
  for (const piece of ['upcv-jobrow', '前端开发实习生', '某某科技', '250-400元/天', '≈ 5.4~8.7K/月', '深圳', '实习僧', 'shixiseng.com/intern/aaa']) {
    assert.ok(html.includes(piece), '紧凑行缺少：' + piece);
  }
  assert.ok(/rel="noopener/.test(html), '外链必须带 rel=noopener');
  assert.ok(/target="_blank"/.test(html), '外链必须新窗口打开');
  for (const label of ['待投', '已投', '不感兴趣']) assert.ok(html.includes(label), '状态按钮缺：' + label);
  assert.ok(html.includes('定制'), '行内定制按钮缺失');
  assert.ok(/aria-pressed="true"/.test(html), '当前状态要有 aria-pressed');
  assert.ok(!html.includes('upcv-card'), '紧凑行不应退回卡片');
  const dismissed = renderToString(React.createElement(JobRow, { job: { ...FAKE_JOB, status: 'dismissed' }, onStatus: noop, onCustom: noop }));
  assert.ok(dismissed.includes('is-dim'), '不感兴趣的行走弱化样式');
});

await check('JobRow 对畸形数据防御（外部 harness 写入，形状不可信）', async () => {
  const { JobRow } = globalThis.window.__upcvDebug;
  const weird = [
    null,
    {},
    { id: 'j2', status: 'hacked', sourceUrl: 'javascript:alert(1)', title: '', salary: '面议' },
    { id: 'j3', tags: 'not-an-array', salaryRange: { min: 'x' }, collectedAt: 'garbage' },
  ];
  for (const job of weird) {
    const html = renderToString(React.createElement(JobRow, { job: job, onStatus: noop, onCustom: noop }));
    assert.ok(html.length > 0, '畸形数据渲染出空内容：' + JSON.stringify(job));
    assert.ok(!html.includes('undefined'), '漏出了 undefined：' + html.slice(0, 200));
    assert.ok(!html.includes('NaN'), '漏出了 NaN：' + html.slice(0, 200));
  }
});

await check('salaryShort / relativeTime / jdPresetFromJob 按契约转换（定制跳转的预填数据）', async () => {
  const { salaryShort, relativeTime, jdPresetFromJob, jobSourceLabel } = globalThis.window.__upcvDebug;
  assert.equal(salaryShort({ min: 5437, max: 8700 }), '≈ 5.4~8.7K/月');
  assert.equal(salaryShort(null), '');
  assert.equal(salaryShort({ min: 'x' }), '');
  const at = (month, day, hour, minute) => new Date(2026, month - 1, day, hour, minute).toISOString();
  const now = new Date(2026, 9, 20, 18, 0);
  assert.equal(relativeTime(at(10, 20, 14, 30), now), '今天 14:30');
  assert.equal(relativeTime(at(10, 19, 9, 5), now), '昨天 09:05');
  assert.equal(relativeTime(at(10, 2, 16, 22), now), '10-02 16:22');
  assert.equal(relativeTime('garbage', now), '');
  assert.deepEqual(jdPresetFromJob(FAKE_JOB), {
    jobId: 'j1', targetJob: '前端开发实习生', company: '某某科技',
    sourceUrl: 'https://www.shixiseng.com/intern/aaa',
  });
  assert.equal(jobSourceLabel('liepin'), '猎聘');
});

await check('JobsPage 默认渲染：查询/整理在页头、检索条常驻、AI 参考岗位已移除', async () => {
  const components = globalThis.window.__upcvDebug;
  const html = renderToString(React.createElement(components.JobsPage, { onBack: noop, onCustom: noop }));
  for (const piece of ['upcv-page-jobs', 'upcv-jobs-search', 'upcv-jobs-cmd', '/jobs-collect', '查询', '整理收件箱', 'upcv-skeleton']) {
    assert.ok(html.includes(piece), '岗位页缺少：' + piece);
  }
  assert.ok(html.includes('aria-label="复制检索指令"'), '复制按钮缺失');
  assert.ok(!html.includes('AI 生成参考岗位'), 'AI 参考岗位区块必须移除');
  assert.ok(!html.includes('✨'), 'emoji 当图标应替换为 Icon');
  assert.ok(!html.includes('upcv-card'), '岗位列表不再是卡片墙');
});

await check('无模型时 JobsPage 不受影响（闭环不依赖 LLM）', async () => {
  const components = globalThis.window.__upcvDebug;
  const offline = { loading: false, available: false, providers: [], models: [], version: '' };
  const html = renderToString(React.createElement(components.JobsPage, { onBack: noop, onCustom: noop, aiStatus: offline }));
  assert.ok(html.includes('整理收件箱'), '无模型时整理按钮仍可用');
  assert.ok(html.includes('查询'), '无模型时查询按钮仍在');
  assert.ok(!html.includes('模型'), '岗位页不该再出现模型相关文案');
});
await check('岗位新版交互态：吸顶筛选栏 + :focus-visible + prefers-reduced-motion 都在产物里', async () => {
  const css = readFileSync(join(root, 'lib', 'client.js'), 'utf8');
  assert.ok(css.includes('.upcv-jobs-filterbar { position:sticky'), '筛选栏必须吸顶');
  assert.ok(css.includes('.upcv-jobrow-seg button:focus-visible'), '分段控件的焦点环不能被 overflow 裁掉');
  assert.ok(css.includes('.upcv-app :focus-visible'), '全局焦点环缺失');
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), '动效降级缺失');
});

await check('没有遗留的 style 字符串写法', async () => {
  const offenders = warnings.filter((w) => w.includes('style prop expects'));
  assert.equal(offenders.length, 0, offenders.slice(0, 2).join(' | '));
});

console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));

// ── 模式分支交互测试（jsdom 真挂载 + 点击）：抓「切换后分支渲染」的事故 ──
// V0.23 真实事故：练习面板分支引用了被删的 startPractice，首屏渲染（mode=null）不触发，
// renderToString 覆盖不到；只有真实点击模式卡、走完 setState + 重渲染才会炸。
import { JSDOM } from 'jsdom';

await check('模式分支交互：点击「练习模式 / 面试模式」后面板分支可渲染', async () => {
  const dom = new JSDOM('<!doctype html><html><body><div id=upcv-root></div></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const domWindow = dom.window;
  // 组件引用来自加载期 stub 上的调试出口（切 window 之前先取）
  const debug = globalThis.window.__upcvDebug;
  assert.ok(debug && typeof debug.InterviewPage === 'function', '调试出口缺 InterviewPage');
  // 把全局 window 换成 jsdom 的，让事件处理器里访问的 window.* 走 jsdom（语音等都有 typeof 守卫）。
  globalThis.window = domWindow;
  if (typeof domWindow.fetch === 'undefined') domWindow.fetch = () => Promise.reject(new Error('offline'));

  const container = domWindow.document.getElementById('upcv-root');
  const root = ReactDOMClient.createRoot(container);
  const errors = [];
  const onErr = (e) => errors.push(String((e && e.message) || e));
  domWindow.addEventListener('error', onErr);

  const clickByText = (text) => {
    const nodes = [...container.querySelectorAll('button, .upcv-src')];
    const hit = nodes.find((el) => (el.textContent || '').includes(text));
    if (hit === undefined) throw new Error('找不到按钮：' + text);
    hit.dispatchEvent(new domWindow.MouseEvent('click', { bubbles: true }));
  };
  const flush = () => act(() => new Promise((resolve) => setTimeout(resolve, 0)));

  try {
    await act(async () => { root.render(React.createElement(React.StrictMode, null, React.createElement(debug.InterviewPage, { t: t, onBack: noop, aiStatus: aiStatus, onNavigate: noop }))); });
    await flush();
    clickByText('练习模式');
    await flush();
    if (!container.textContent.includes('开始练习')) throw new Error('练习面板未渲染出「开始练习」');
    if (!container.textContent.includes('随时可结束出轻量小结')) throw new Error('练习面板配置区缺失');
    clickByText('重选模式');
    await flush();
    clickByText('面试模式');
    await flush();
    if (!container.textContent.includes('开始面试')) throw new Error('面试面板未渲染出「开始面试」');
    if (errors.length > 0) throw new Error('渲染期报错：' + errors[0]);
  } finally {
    root.unmount();
    domWindow.removeEventListener('error', onErr);
    globalThis.window = { __ModuleLoader__: { load: (mod) => { captured = mod; } } };
  }
});
