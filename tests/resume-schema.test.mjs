/**
 * 简历数据模型自检：空白模板、日期、HTML 清洗、upcv 映射规则、归一、编辑器操作。
 * 运行：node tests/resume-schema.test.mjs
 */
import assert from 'node:assert/strict';
import {
  applyTemplate, moveSectionOrder, templateArchetype, templateSpec, templateLayout, templatePalette,
  normalizeTemplateId, DEFAULT_TEMPLATE_ID, TEMPLATE_MIGRATION,
  SECTION_ORDER, ITEM_FIELDS, layoutSectionIds, orderedSectionIds,
  TEMPLATES,
  FONT_FAMILIES, FONT_SIZES, LINE_HEIGHTS, PAGE_MARGINS, PRIMARY_COLORS, BACKGROUND_COLORS, TEXT_COLORS,
  customStylesOf, setCustomStyle,
  setFontFamily, setFontSize, setLineHeight, setPageMargin, setThemeColor, setCustomCss,
  blankResume, blankItem, newId, formatDate, normalizeMonth,
  sanitizeHtml, stripTags, simplifiedToResume, normalizeResume, resumeToPlainText, resumeStats,
  addItem, removeItem, updateItem, moveItem, setSection, updateBasics, addCustomField, removeCustomField,
} from '../server/resume-schema.js';

const nl = String.fromCharCode(10);
let passed = 0;
async function check(name, fn) {
  try { await fn(); passed += 1; console.log('  ok   ' + name); }
  catch (error) { console.log('  FAIL ' + name + ' -> ' + error.message); process.exitCode = 1; }
}

console.log('空白模板');
await check('14 个 section + custom，形状与 upcv 一致', async () => {
  const resume = blankResume();
  assert.equal(SECTION_ORDER.length, 13);
  for (const id of SECTION_ORDER) assert.ok(resume.sections[id], '缺少 section ' + id);
  assert.ok(resume.sections.custom !== undefined);
  assert.equal(Object.keys(resume.sections).length, 14);
  assert.equal(typeof resume.sections.summary.content, 'string');
  assert.ok(Array.isArray(resume.sections.experience.items));
  assert.equal(resume.sections.education.name, '教育经历');
});

await check('默认布局 = 网站默认（双栏 standard）', async () => {
  const meta = blankResume().metadata;
  assert.equal(meta.layout.length, 1, '外层只有一个布局');
  // 默认模板是 rr-onyx（单栏）：栏目分工由模板决定，不再固定双栏
  assert.equal(meta.layout[0].length, 1, '默认模板单栏');
  assert.ok(meta.layout[0][0].indexOf('experience') !== -1, '默认顺序里要有工作经历');
});

await check('渲染顺序跟随布局，未进布局的板块补在后面', async () => {
  const resume = blankResume();
  const ids = orderedSectionIds(resume);
  assert.equal(ids.length, SECTION_ORDER.length, '不能漏板块');
  assert.ok(ids.indexOf('profiles') < ids.indexOf('languages'), 'profiles 在左栏、languages 在右栏，展开后 profiles 在前');
  assert.deepEqual(layoutSectionIds(resume).length, ids.length);
});
await check('metadata 与 upcv 默认值一致', async () => {
  const meta = blankResume().metadata;
  assert.equal(meta.template, 'rr-onyx', '新简历默认用 rr-onyx（旧 id 由归一函数处理）');
  // 纸面固定白底（数据层不存纸面色；Evarlio 组的米白纸底由模板 CSS 的 --rr-paper 呈现）
  assert.deepEqual(meta.theme, { background: '#ffffff', text: '#242424', primary: '#312e81' });
  assert.equal(meta.page.margin, 32);
  assert.equal(meta.page.format, 'a4');
  assert.equal(meta.typography.font.family, 'Noto Sans SC');
  assert.equal(meta.typography.font.size, 13);
  assert.equal(String(meta.typography.lineHeight), '1.55', '中文行高默认 1.55');
  assert.equal(meta.layout.length, 1, '只有一个布局');
  assert.equal(meta.layout[0].length, 1, '默认模板单栏');
});

await check('basics 含 picture.effects 与 customFields', async () => {
  const basics = blankResume().basics;
  assert.deepEqual(basics.picture.effects, { hidden: false, border: false, grayscale: false });
  assert.ok(Array.isArray(basics.customFields));
  assert.deepEqual(basics.url, { label: '', href: '' });
});

await check('blankItem 按 section 字段表生成，且 id 唯一', async () => {
  for (const id of Object.keys(ITEM_FIELDS)) {
    const item = blankItem(id);
    assert.ok(item.id);
    for (const field of ITEM_FIELDS[id]) assert.ok(field.key in item, id + ' 缺少字段 ' + field.key);
  }
  assert.notEqual(newId(), newId());
});

console.log('日期');
await check('normalizeMonth 归一各种写法', async () => {
  assert.equal(normalizeMonth('2023-09'), '2023.09');
  assert.equal(normalizeMonth('2023-09-01'), '2023.09');
  assert.equal(normalizeMonth('2023/9'), '2023.09');
  assert.equal(normalizeMonth('2023'), '2023');
  assert.equal(normalizeMonth('至今'), '');
  assert.equal(normalizeMonth('present'), '');
  assert.equal(normalizeMonth(''), '');
});

await check('formatDate 起止与至今', async () => {
  assert.equal(formatDate('2023-07', '2024-01'), '2023.07 - 2024.01');
  assert.equal(formatDate('2023-07', ''), '2023.07 - 至今');
  assert.equal(formatDate('', '2024-01'), '2024.01');
  assert.equal(formatDate('', ''), '');
});

console.log('HTML 清洗');
await check('保留白名单标签，剥掉全部属性', async () => {
  const out = sanitizeHtml('<p class="x" onclick="alert(1)">hi <strong>15%</strong></p>');
  assert.equal(out, '<p>hi <strong>15%</strong></p>');
});
await check('script/style/iframe 被整块丢弃', async () => {
  const out = sanitizeHtml('<script>alert(1)</script>ok<iframe src=x></iframe>');
  assert.equal(out, 'ok');
});
await check('非白名单标签被丢但文字保留', async () => {
  assert.equal(sanitizeHtml('<div>a<img src=x>b</div>'), 'ab');
});
await check('stripTags 输出纯文本', async () => {
  assert.equal(stripTags('<ul><li>a</li><li>b</li></ul>'), 'a b');
});

console.log('upcv 映射规则');
await check('work + internship 合并进 experience 并改名', async () => {
  const resume = simplifiedToResume({
    experiences: [
      { type: 'work', organization: '字节', title: '产品经理', startDate: '2021-07', endDate: '2024-01' },
      { type: 'internship', organization: '腾讯', title: '产品实习', startDate: '2020-06', endDate: '2020-09' },
    ],
  });
  assert.equal(resume.sections.experience.name, '工作&实习经历');
  assert.equal(resume.sections.experience.items.length, 2);
  assert.equal(resume.sections.experience.items[0].company, '字节');
  assert.equal(resume.sections.experience.items[0].position, '产品经理');
  assert.equal(resume.sections.experience.items[0].date, '2021.07 - 2024.01');
});

await check('只有实习时 section 叫「实习经历」', async () => {
  const resume = simplifiedToResume({ experiences: [{ type: 'internship', organization: 'A', title: 'B' }] });
  assert.equal(resume.sections.experience.name, '实习经历');
  assert.equal(resume.sections.experience.items.length, 1);
});

await check('organization/extracurricular/other 合并进 volunteer 并动态命名', async () => {
  const both = simplifiedToResume({ experiences: [
    { type: 'organization', organization: '学生会' },
    { type: 'extracurricular', organization: '社团' },
  ] });
  assert.equal(both.sections.volunteer.name, '社团组织与工作以外经历');
  assert.equal(both.sections.volunteer.items.length, 2);
  const orgOnly = simplifiedToResume({ experiences: [{ type: 'organization', organization: '学生会' }] });
  assert.equal(orgOnly.sections.volunteer.name, '社团和组织经历');
  const extraOnly = simplifiedToResume({ experiences: [{ type: 'extracurricular', organization: 'x' }] });
  assert.equal(extraOnly.sections.volunteer.name, '工作以外经历');
  const otherOnly = simplifiedToResume({ experiences: [{ type: 'other', organization: 'x' }] });
  assert.equal(otherOnly.sections.volunteer.name, '其他经历');
});

await check('project 进 projects，公司名优先取 organization', async () => {
  const resume = simplifiedToResume({ experiences: [{ type: 'project', title: '搜索优化', organization: '某厂', description: '负责人' }] });
  assert.equal(resume.sections.projects.items.length, 1);
  assert.equal(resume.sections.projects.items[0].name, '搜索优化');
  assert.equal(resume.sections.projects.items[0].description, '负责人');
});

await check('JSON Resume 的 work/projects/volunteer 分开数组也能收', async () => {
  const resume = simplifiedToResume({
    basics: { name: '张三', label: '产品经理', email: 'a@b.c' },
    work: [{ name: '字节', position: 'PM' }],
    projects: [{ name: '项目A', description: '负责人' }],
    volunteer: [{ organization: '学生会', position: '部长' }],
    education: [{ institution: '北大', area: '计算机', studyType: '本科' }],
    skills: [{ name: '产品', keywords: ['调研', '原型'] }],
    awards: [{ title: '一等奖', awarder: '校级' }],
    certificates: [{ name: 'CET-6', issuer: '教育部' }],
  });
  assert.equal(resume.basics.name, '张三');
  assert.equal(resume.basics.headline, '产品经理');
  assert.equal(resume.sections.experience.items[0].company, '字节');
  assert.equal(resume.sections.projects.items[0].name, '项目A');
  assert.equal(resume.sections.volunteer.items[0].organization, '学生会');
  assert.deepEqual(resume.sections.skills.items[0].keywords, ['调研', '原型']);
  assert.equal(resume.sections.awards.items[0].awarder, '校级');
  assert.equal(resume.sections.certifications.items[0].name, 'CET-6');
});

await check('描述字段自动过 HTML 清洗', async () => {
  const resume = simplifiedToResume({ work: [{ name: 'A', summary: '<p onclick="x">ok</p><script>bad</script>' }] });
  assert.equal(resume.sections.experience.items[0].summary, '<p>ok</p>');
});

console.log('归一');
await check('半成品 schema 合并进空白模板并补 id', async () => {
  const { resume, problems } = normalizeResume({
    basics: { name: '李四' },
    sections: { experience: { name: '工作经历', items: [{ company: 'A', position: 'B' }] } },
  });
  assert.equal(resume.basics.name, '李四');
  assert.equal(resume.sections.experience.items.length, 1);
  assert.ok(resume.sections.experience.items[0].id);
  assert.equal(resume.sections.experience.items[0].company, 'A');
  assert.equal(problems.length, 0);
});

await check('缺姓名时给出 problem 提示', async () => {
  const { problems } = normalizeResume({ work: [{ name: 'A' }] });
  assert.ok(problems.some((p) => p.indexOf('姓名') !== -1));
});

await check('metadata 里的主题/字号/边距被收下且有范围保护', async () => {
  const { resume } = normalizeResume({
    basics: { name: 'x' },
    sections: {},
    metadata: { theme: { primary: '#ff0000' }, page: { margin: 999 }, typography: { font: { size: 99 } } },
  });
  assert.equal(resume.metadata.theme.primary, '#ff0000');
  assert.equal(resume.metadata.page.margin, 32, '越界边距应保持默认（默认模板 rr-onyx 的 32px）');
  assert.equal(resume.metadata.typography.font.size, 13, '越界字号应保持默认');
});

console.log('编辑器操作（不可变）');
await check('addItem 不修改入参', async () => {
  const before = blankResume();
  const after = addItem(before, 'experience');
  assert.equal(before.sections.experience.items.length, 0);
  assert.equal(after.sections.experience.items.length, 1);
});

await check('updateItem / removeItem 按 id 生效', async () => {
  let resume = addItem(blankResume(), 'skills');
  const id = resume.sections.skills.items[0].id;
  resume = updateItem(resume, 'skills', id, 'name', '产品');
  assert.equal(resume.sections.skills.items[0].name, '产品');
  resume = removeItem(resume, 'skills', id);
  assert.equal(resume.sections.skills.items.length, 0);
});

await check('moveItem 上下移与越界保护', async () => {
  let resume = blankResume();
  resume = addItem(resume, 'projects');
  resume = addItem(resume, 'projects');
  const first = resume.sections.projects.items[0].id;
  const moved = moveItem(resume, 'projects', first, 1);
  assert.equal(moved.sections.projects.items[1].id, first);
  assert.equal(moveItem(resume, 'projects', first, -1).sections.projects.items[0].id, first, '越界应不动');
});

await check('setSection 改可见性与名称；updateBasics 改基本信息', async () => {
  let resume = blankResume();
  resume = setSection(resume, 'interests', { visible: false });
  assert.equal(resume.sections.interests.visible, false);
  resume = updateBasics(resume, 'name', '王五');
  assert.equal(resume.basics.name, '王五');
});

await check('自定义字段增改删', async () => {
  let resume = addCustomField(blankResume(), '政治面貌', '党员');
  const id = resume.basics.customFields[0].id;
  assert.equal(resume.basics.customFields[0].value, '党员');
  resume = removeCustomField(resume, id);
  assert.equal(resume.basics.customFields.length, 0);
});

console.log('文本投影与统计');
await check('resumeToPlainText 含基本信息与各 section', async () => {
  const resume = simplifiedToResume({
    basics: { name: '张三', phone: '138' },
    summary: '五年产品经验',
    work: [{ name: '字节', position: 'PM', summary: '<p>做了 A</p>' }],
  });
  const text = resumeToPlainText(resume);
  assert.ok(text.indexOf('张三') !== -1);
  assert.ok(text.indexOf('五年产品经验') !== -1);
  assert.ok(text.indexOf('字节') !== -1);
  assert.ok(text.indexOf('<p>') === -1, '不应带 HTML 标签');
});

await check('resumeStats 统计填充情况', async () => {
  const empty = resumeStats(blankResume());
  assert.equal(empty.sectionsFilled, 0);
  assert.equal(empty.hasName, false);
  const filled = resumeStats(simplifiedToResume({ basics: { name: 'x' }, work: [{ name: 'A' }] }));
  assert.equal(filled.hasName, true);
  assert.ok(filled.sectionsFilled >= 1);
  assert.equal(filled.items, 1);
});

console.log('导入完整性');
await check('work.highlights 合并进 summary，不丢要点', async () => {
  const resume = simplifiedToResume({
    work: [{ name: '某公司', position: 'Java', startDate: '2022-03', endDate: '2026-06',
      summary: '<p>负责后端开发。</p>',
      highlights: ['接口性能优化 30%', '<li>主导 3 个模块重构</li>'] }],
  });
  const summary = resume.sections.experience.items[0].summary;
  assert.ok(summary.indexOf('负责后端开发') !== -1, '原 summary 保留');
  assert.ok(summary.indexOf('接口性能优化 30%') !== -1, '第一条要点没丢');
  assert.ok(summary.indexOf('主导 3 个模块重构') !== -1, '已是 <li> 的要点没丢');
  assert.ok(summary.indexOf('<ul><li>') !== -1, '要点被包成列表');
});

await check('projects.highlights 同样合并', async () => {
  const resume = simplifiedToResume({ projects: [{ name: '项目A', summary: '<p>做A</p>', highlights: ['成果1'] }] });
  assert.ok(resume.sections.projects.items[0].summary.indexOf('成果1') !== -1);
});

await check('没有 highlights 时 summary 不被包装', async () => {
  const resume = simplifiedToResume({ work: [{ name: 'A', summary: '<p>只有描述</p>' }] });
  assert.equal(resume.sections.experience.items[0].summary, '<p>只有描述</p>');
});

console.log('样式系统（customStyles + metadata）');
await check('选项写在 metadata.customStyles（与网站同一位置）', async () => {
  const resume = setCustomStyle(blankResume(), 'ratingStyle', 'stars');
  assert.equal(resume.metadata.customStyles.ratingStyle, 'stars');
  assert.equal(customStylesOf(blankResume()).ratingStyle, undefined, '未设置不写键');
});

await check('字体/字号/行高/页边距/配色/自定义 CSS 写入正确位置', async () => {
  let resume = setFontFamily(blankResume(), 'Noto Serif SC');
  assert.equal(resume.metadata.typography.font.family, 'Noto Serif SC');
  resume = setFontSize(resume, 16);
  assert.equal(resume.metadata.typography.font.size, 16);
  resume = setLineHeight(resume, '1.8');
  assert.equal(resume.metadata.typography.lineHeight, '1.8');
  resume = setPageMargin(resume, 40);
  assert.equal(resume.metadata.page.margin, 40);
  resume = setThemeColor(resume, 'primary', '#0d9488');
  assert.equal(resume.metadata.theme.primary, '#0d9488');
  resume = setThemeColor(resume, 'background', '#f8fafc');
  assert.equal(resume.metadata.theme.background, '#f8fafc');
  resume = setCustomCss(resume, '.rich { color: red; }');
  assert.equal(resume.metadata.css.visible, true);
  resume = setCustomCss(resume, '   ');
  assert.equal(resume.metadata.css.visible, false);
});

console.log('模板库（14 套：8 套移植自 Reactive Resume v4 + 6 套复刻自 Evarlio 免费模板）');
await check('14 套模板目录、原型与色板齐备', async () => {
  assert.equal(TEMPLATES.length, 14, '本轮 14 套真实设计');
  assert.deepEqual(TEMPLATES.map((pair) => pair[0]), [
    'rr-bronzor', 'rr-onyx', 'rr-azurill', 'rr-glalie', 'rr-chikorita', 'rr-ditto', 'rr-lapras', 'rr-porygon',
    'rr-docket', 'rr-ink', 'rr-glyph', 'rr-meadow', 'rr-lake', 'rr-light',
  ]);
  for (const [id, name] of TEMPLATES) {
    assert.ok(name.length > 0, id + ' 要有中文名');
    const spec = templateSpec(id);
    assert.equal(spec.id, id);
    assert.notEqual(spec.archetype, null, id + ' 要有结构原型');
    assert.equal(spec.palette.length >= 6 && spec.palette.length <= 8, true, id + ' 色板 6-8 个，实际 ' + spec.palette.length);
    assert.equal(spec.palette[0][0], spec.color, id + ' 色板第一个必须是默认主色');
    assert.equal(templatePalette(id).length, spec.palette.length);
    assert.ok(['rows', 'single', 'split', 'left-rail', 'right-rail', 'banner-split', 'cards', 'bands'].includes(spec.body), id + ' body 非法：' + spec.body);
  }
  // 12 个原型互不相同（不能再是「原型 × 主题色」的排列组合）；Evarlio 组的 4 个
  // 新原型（serif-single / numbered-split / left-rail-flow / left-rail-icon）都是
  // 现有 body 骨架的变体，不引入新分页逻辑
  assert.equal(new Set(TEMPLATES.map(([id]) => templateSpec(id).archetype)).size, 12, '14 套模板应覆盖 12 个原型');
  // 中文排版：行高落在 1.5-1.6，字号有上下限
  for (const [id] of TEMPLATES) {
    const spec = templateSpec(id);
    const lh = Number(spec.lineHeight);
    assert.ok(lh >= 1.5 && lh <= 1.6, id + ' 中文行高应在 1.5-1.6，实际 ' + spec.lineHeight);
    assert.ok(spec.fontSize >= 12 && spec.fontSize <= 14, id + ' 正文字号要克制，实际 ' + spec.fontSize);
  }
});

await check('旧 45 套 id 全部有显式迁移映射', async () => {
  const OLD_IDS = [
    'angledslate', 'rhyhorn', 'onyx', 'elite', 'modern', 'dynamicpreview', 'glalie', 'timeline',
    'chikorita', 'elegance', 'gengar', 'minimalist', 'pikachu', 'streamline', 'azurill', 'nosepass',
    'onecolumn', 'ditto', 'cascade', 'bronzor', 'techcard', 'leafish', 'harmony', 'kakuna',
    'inkwell', 'classicbusiness', 'modernbusiness', 'professionallawyer', 'fashiongradient', 'neoncapsule',
    'layeredelegant', 'layeredcard', 'layeredcapsule', 'modernelegant', 'modernsplit', 'layeredcarddual',
    'wavecenter', 'cardcapsule', 'wavecapsule', 'carddashed', 'cardsplit', 'gridstandard', 'gridsplit',
    'gridelegant', 'campusrecruit',
  ];
  assert.equal(OLD_IDS.length, 45, '旧目录是 45 套');
  const newIds = TEMPLATES.map((pair) => pair[0]);
  for (const oldId of OLD_IDS) {
    const target = TEMPLATE_MIGRATION[oldId];
    assert.notEqual(target, undefined, oldId + ' 缺迁移映射');
    assert.ok(newIds.includes(target), oldId + ' 映射到了不存在的模板 ' + target);
    assert.equal(normalizeTemplateId(oldId), target, oldId + ' 归一结果不对');
  }
  assert.equal(Object.keys(TEMPLATE_MIGRATION).length, 45, '映射表不应有多余条目');
  // 目录里的旧模板 id 不能再出现在新目录里
  for (const oldId of OLD_IDS) assert.ok(!newIds.includes(oldId), oldId + ' 不该留在新目录里');
});

await check('归一函数：新 id 原样返回，未知/空落到默认模板', async () => {
  for (const [id] of TEMPLATES) assert.equal(normalizeTemplateId(id), id);
  assert.equal(normalizeTemplateId('不存在的模板'), DEFAULT_TEMPLATE_ID);
  assert.equal(normalizeTemplateId(''), DEFAULT_TEMPLATE_ID);
  assert.equal(normalizeTemplateId(null), DEFAULT_TEMPLATE_ID);
  assert.equal(normalizeTemplateId(undefined), DEFAULT_TEMPLATE_ID);
  assert.equal(DEFAULT_TEMPLATE_ID, 'rr-onyx', '默认模板是正式墨（单栏、正式、中文简历最稳）');
  assert.equal(templateArchetype('elite'), 'formal-single', '旧 id 也能问出原型');
  assert.equal(templateArchetype('不存在的模板'), null);
});

await check('applyTemplate 逐套写入整版参数（8 套逐条断言）', async () => {
  const base = blankResume();
  const EXPECT = {
    'rr-bronzor':   { archetype: 'label-rows',    body: 'rows',         headerLane: 'page', lanes: 1, color: '#2f2f2f', margin: 32, rating: 'dots' },
    'rr-onyx':      { archetype: 'formal-single', body: 'single',       headerLane: 'page', lanes: 1, color: '#312e81', margin: 32, rating: 'squares' },
    'rr-azurill':   { archetype: 'centered-split',body: 'split',        headerLane: 'page', lanes: 2, color: '#2563eb', margin: 28, rating: 'stars' },
    'rr-glalie':    { archetype: 'left-rail',     body: 'left-rail',    headerLane: 0,      lanes: 2, color: '#0f766e', margin: 0,  rating: 'dots' },
    'rr-chikorita': { archetype: 'right-rail',    body: 'right-rail',   headerLane: 0,      lanes: 2, color: '#166534', margin: 0,  rating: 'bars' },
    'rr-ditto':     { archetype: 'banner-split',  body: 'banner-split', headerLane: 'page', lanes: 2, color: '#db2777', margin: 0,  rating: 'progress' },
    'rr-lapras':    { archetype: 'card-stack',    body: 'cards',        headerLane: 'page', lanes: 1, color: '#0e7490', margin: 22, rating: 'squares' },
    'rr-porygon':   { archetype: 'band-stack',    body: 'bands',        headerLane: 'page', lanes: 1, color: '#1e3a8a', margin: 26, rating: 'stars' },
    // Evarlio 复刻组
    'rr-docket':    { archetype: 'serif-single',   body: 'single',       headerLane: 'page', lanes: 1, color: '#49373c', margin: 36, rating: 'dots' },
    'rr-ink':       { archetype: 'serif-single',   body: 'single',       headerLane: 'page', lanes: 1, color: '#2f7a78', margin: 36, rating: 'dots' },
    'rr-glyph':     { archetype: 'numbered-split', body: 'split',        headerLane: 'page', lanes: 2, color: '#2c2825', margin: 36, rating: 'dots' },
    'rr-meadow':    { archetype: 'left-rail-icon', body: 'left-rail',    headerLane: 0,      lanes: 2, color: '#384934', margin: 0,  rating: 'dots' },
    'rr-lake':      { archetype: 'left-rail-flow', body: 'left-rail',    headerLane: 0,      lanes: 2, color: '#29463d', margin: 0,  rating: 'progress' },
    'rr-light':     { archetype: 'banner-split',   body: 'banner-split', headerLane: 'page', lanes: 2, color: '#22262b', margin: 0,  rating: 'progress' },
  };
  for (const [id, want] of Object.entries(EXPECT)) {
    const next = applyTemplate(base, id);
    const spec = templateSpec(id);
    assert.equal(next.metadata.template, id, id + ' 要写入 metadata.template');
    assert.equal(spec.archetype, want.archetype, id + ' 原型不对');
    assert.equal(spec.body, want.body, id + ' body 不对');
    assert.equal(spec.headerLane, want.headerLane, id + ' 页头所属栏不对');
    assert.equal(spec.rating, want.rating, id + ' 评级样式不对');
    assert.equal(next.metadata.theme.primary, want.color, id + ' 默认主色不对');
    assert.equal(next.metadata.page.margin, want.margin, id + ' 页边距不对');
    assert.equal(next.metadata.typography.lineHeight, spec.lineHeight, id + ' 行高要按模板写');
    assert.equal(next.metadata.layout[0].length, want.lanes, id + ' 栏目数不对');
    assert.equal(next.metadata.layout[0].reduce((n, col) => n + col.length, 0), SECTION_ORDER.length, id + ' 板块不能丢');
    assert.equal(orderedSectionIds(next).length, SECTION_ORDER.length, id + ' 顺序里不能丢板块');
  }
});

await check('旧 id 走归一：applyTemplate 落到映射目标', async () => {
  const base = blankResume();
  const legacy = applyTemplate(base, 'elite');
  assert.equal(legacy.metadata.template, 'rr-onyx', '旧 id 应用后要写成新 id');
  assert.equal(applyTemplate(base, 'chikorita').metadata.template, 'rr-chikorita');
  assert.equal(applyTemplate(base, 'ditto').metadata.template, 'rr-ditto');
  assert.equal(applyTemplate(base, '不存在的模板').metadata.template, DEFAULT_TEMPLATE_ID);
});

await check('旧简历只做渲染层归一，不改写文件里的 id', async () => {
  // 模拟「打开一份旧简历文件」：metadata.template 是旧 id
  const stored = JSON.parse(JSON.stringify(blankResume()));
  stored.metadata.template = 'elite';
  const before = JSON.stringify(stored);
  // 渲染层只会问「该用哪套模板」，不会写回
  assert.equal(normalizeTemplateId(stored.metadata.template), 'rr-onyx');
  assert.equal(templateSpec(stored.metadata.template).id, 'rr-onyx');
  assert.equal(templateLayout(stored, stored.metadata.template)[0].length, 1);
  assert.equal(JSON.stringify(stored), before, '读取路径绝不能改写简历内容');
  assert.equal(stored.metadata.template, 'elite', '旧 id 必须原样保留');
});

await check('keepColor：切模板时保留用户已选主色', async () => {
  const base = setThemeColor(blankResume(), 'primary', '#b45309');
  const kept = applyTemplate(base, 'rr-lapras', { keepColor: true });
  assert.equal(kept.metadata.theme.primary, '#b45309', 'keepColor 时不能覆盖主色');
  const reset = applyTemplate(base, 'rr-lapras');
  assert.equal(reset.metadata.theme.primary, '#0e7490', '默认行为是回到模板默认色');
});

await check('分栏模板把侧栏板块切到侧栏（栏目分工）', async () => {
  const base = blankResume();
  const glalie = applyTemplate(base, 'rr-glalie');
  const left = glalie.metadata.layout[0][0];
  const right = glalie.metadata.layout[0][1];
  for (const id of ['languages', 'certifications', 'interests']) assert.ok(left.includes(id), 'glalie 的 ' + id + ' 应在左侧栏');
  for (const id of ['summary', 'experience', 'education']) assert.ok(right.includes(id), 'glalie 的 ' + id + ' 应在主栏');
  const chiko = applyTemplate(base, 'rr-chikorita');
  assert.ok(chiko.metadata.layout[0][1].includes('certifications'), 'chikorita 彩色栏在右，证书在右栏');
  assert.ok(chiko.metadata.layout[0][0].includes('experience'), 'chikorita 主栏在左');
  // 用户改顺序后栏目分工仍然按模板
  const moved = moveSectionOrder(chiko, 'experience', -1);
  assert.ok(moved.metadata.layout[0][0].includes('experience'), '调顺序不该把工作经历挪进彩色栏');
});

console.log('模块顺序');
await check('模块顺序：平铺上移/下移，边界不变', async () => {
  let resume = blankResume();
  const ids = () => orderedSectionIds(resume);
  const first = ids()[0];
  const second = ids()[1];
  resume = moveSectionOrder(resume, first, 1);
  assert.equal(ids()[1], first, '下移后应排到第二位');
  assert.equal(ids()[0], second, '原第二位升到第一位');
  resume = moveSectionOrder(resume, first, -1);
  assert.equal(ids()[0], first, '再上移应回到第一位');
  assert.equal(moveSectionOrder(resume, first, -1), resume, '已在首项时上移应无变化');
  const all = ids();
  assert.equal(moveSectionOrder(resume, all[all.length - 1], 1), resume, '已在末项时下移应无变化');
  assert.equal(orderedSectionIds(resume).length, SECTION_ORDER.length, '移动不能丢板块');
});

console.log(nl + passed + ' 项通过' + (process.exitCode ? '，存在失败' : ''));
