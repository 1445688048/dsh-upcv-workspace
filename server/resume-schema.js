/**
 * 简历数据模型。
 *
 * 结构 1:1 对齐 upcv.tech（逆向结论见 docs/UPCV-RESUME-RE.md）：他们的编辑器基于开源
 * 项目 Reactive Resume 的 schema，我们直接照抄这套结构，而不是自造一套扁平字段。
 *
 * 三个要点：
 * 1. 每个 section 有自己的 item 字段集合（见 ITEM_FIELDS），编辑器按它渲染表单；
 * 2. metadata 承载排版（模板、分栏、纸张、主题色、字体），预览与导出都读它；
 * 3. 模型回包可能是 JSON Resume 格式，也可能是半成品 schema——normalizeResume 两种都收，
 *    并且**只搬运不补写**：模型没给的字段留空，不替用户编经历。
 *
 * @module dsh-upcv-workspace/resume-schema
 */

/** section 顺序（决定编辑器左栏与预览右栏的默认顺序）。 */
export const SECTION_ORDER = [
  'profiles', 'summary', 'education', 'experience', 'projects', 'volunteer',
  'languages', 'skills', 'interests', 'certifications', 'awards', 'publications', 'references',
];

/** section 中文名（与 upcv 完全一致）。 */
export const SECTION_LABELS = {
  summary: '个人总结',
  awards: '荣誉奖项',
  certifications: '证书',
  education: '教育经历',
  experience: '工作经历',
  volunteer: '志愿者经历',
  interests: '兴趣爱好',
  languages: '语言',
  profiles: '社交主页',
  projects: '项目经历',
  publications: '出版物',
  references: '推荐信',
  skills: '技能',
};


/** 基本信息字段（编辑器「基本信息」面板按它渲染）。 */
export const BASICS_FIELDS = [
  { key: 'name', label: '姓名' },
  { key: 'headline', label: '职业标签' },
  { key: 'email', label: '邮箱' },
  { key: 'phone', label: '电话' },
  { key: 'location', label: '城市' },
];

/**
 * 各 section 的 item 字段。
 * multiline 的字段在编辑器里渲染成多行文本域；rich 的字段内容允许 HTML（会做白名单清洗）。
 */
export const ITEM_FIELDS = {
  profiles: [
    { key: 'network', label: '平台' },
    { key: 'username', label: '账号' },
    { key: 'url', label: '链接' },
  ],
  education: [
    { key: 'institution', label: '学校' },
    { key: 'studyType', label: '学历' },
    { key: 'area', label: '专业' },
    { key: 'score', label: '成绩' },
    { key: 'date', label: '时间' },
    { key: 'summary', label: '描述', multiline: true, rich: true },
  ],
  experience: [
    { key: 'company', label: '公司' },
    { key: 'position', label: '职位' },
    { key: 'location', label: '城市' },
    { key: 'date', label: '时间' },
    { key: 'summary', label: '工作内容', multiline: true, rich: true },
  ],
  projects: [
    { key: 'name', label: '项目名称' },
    { key: 'description', label: '角色' },
    { key: 'date', label: '时间' },
    { key: 'summary', label: '项目描述', multiline: true, rich: true },
  ],
  volunteer: [
    { key: 'organization', label: '组织' },
    { key: 'position', label: '角色' },
    { key: 'location', label: '城市' },
    { key: 'date', label: '时间' },
    { key: 'summary', label: '经历描述', multiline: true, rich: true },
  ],
  languages: [
    { key: 'name', label: '语言' },
    { key: 'description', label: '水平说明' },
    { key: 'level', label: '掌握程度（1-5）' },
  ],
  skills: [
    { key: 'name', label: '技能类别' },
    { key: 'description', label: '说明' },
    { key: 'level', label: '掌握程度（1-5）' },
    { key: 'keywords', label: '具体技能（顿号分隔）' },
  ],
  interests: [{ key: 'name', label: '兴趣' }, { key: 'keywords', label: '关键词（顿号分隔）' }],
  certifications: [
    { key: 'name', label: '证书名称' },
    { key: 'issuer', label: '颁发机构' },
    { key: 'date', label: '获得时间' },
    { key: 'summary', label: '描述', multiline: true, rich: true },
  ],
  awards: [
    { key: 'title', label: '奖项名称' },
    { key: 'awarder', label: '颁发机构' },
    { key: 'date', label: '获奖时间' },
    { key: 'summary', label: '描述', multiline: true, rich: true },
  ],
  publications: [
    { key: 'name', label: '标题' },
    { key: 'publisher', label: '出版方' },
    { key: 'date', label: '时间' },
    { key: 'summary', label: '摘要', multiline: true, rich: true },
  ],
  references: [
    { key: 'name', label: '姓名' },
    { key: 'description', label: '关系说明' },
    { key: 'summary', label: '推荐语', multiline: true, rich: true },
  ],
};

/** 允许出现在描述里的 HTML 标签（其余一律丢弃，属性全部剥掉）。 */
const ALLOWED_TAGS = ['p', 'br', 'ul', 'ol', 'li', 'strong', 'em', 'b', 'i', 'u', 'h1', 'h2', 'h3', 'h4'];

/** 这些元素的**内容**也要一起丢弃（不只是标签）。 */
const RAW_TEXT_TAGS = ['script', 'style', 'iframe', 'object', 'embed', 'noscript', 'title', 'textarea'];

/** id 生成：时间戳 36 进制 + 随机后缀，稳定且不冲突。 */
export function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * HTML 白名单清洗（描述字段允许富文本，模型可能带 script/onclick）。
 * 逐字符扫描而不是正则替换：属性**全部**剥掉，因此不存在事件属性漏网。
 */
export function sanitizeHtml(input) {
  if (typeof input !== 'string' || input === '') return '';
  let out = '';
  let index = 0;
  while (index < input.length) {
    const lt = input.indexOf('<', index);
    if (lt === -1) { out += input.slice(index); break; }
    out += input.slice(index, lt);
    const gt = input.indexOf('>', lt);
    if (gt === -1) { out += input.slice(lt); break; }
    const inner = input.slice(lt + 1, gt);
    const closing = inner.charAt(0) === '/';
    const head = (closing ? inner.slice(1) : inner).trim().split(' ')[0].split('/')[0];
    const name = head.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (RAW_TEXT_TAGS.indexOf(name) !== -1) {
      // raw-text 元素：连内容一起丢。否则 <script>alert(1)</script> 会把 alert(1) 留在正文里。
      if (!closing) {
        const close = input.toLowerCase().indexOf('</' + name, index);
        if (close === -1) { index = input.length; continue; }
        const endGt = input.indexOf('>', close);
        index = endGt === -1 ? input.length : endGt + 1;
        continue;
      }
      index = gt + 1;
      continue;
    }
    if (ALLOWED_TAGS.indexOf(name) !== -1) {
      out += name === 'br' ? '<br>' : '<' + (closing ? '/' : '') + name + '>';
    }
    index = gt + 1;
  }
  return out;
}
/** 把任意日期写法归一成 YYYY.MM；空/至今返回空串。 */
export function normalizeMonth(value) {
  const text = String(value == null ? '' : value).trim();
  if (text === '') return '';
  const lower = text.toLowerCase();
  if (text === '至今' || text === '现在' || lower === 'present' || lower === 'now') return '';
  const digits = text.replace(/[^0-9]/g, '');
  if (digits.length >= 6) return digits.slice(0, 4) + '.' + digits.slice(4, 6);
  if (digits.length === 5) return digits.slice(0, 4) + '.0' + digits.slice(4);
  if (digits.length === 4) return digits;
  return text;
}

/** 起止时间 → 展示串。结束为空表示在职/在读。 */
export function formatDate(start, end) {
  const from = normalizeMonth(start);
  const to = normalizeMonth(end);
  if (from === '' && to === '') return '';
  if (from === '') return to;
  if (to === '') return from + ' - 至今';
  return from + ' - ' + to;
}

/** section 的公共形状。 */
function sectionBase(id) {
  return { id: id, name: SECTION_LABELS[id] || id, columns: 1, separateLinks: true, visible: true };
}

/** 某个 section 的空 item（键顺序与 ITEM_FIELDS 一致，预览渲染不会出现 undefined 键）。 */
export function blankItem(sectionId) {
  const item = { id: newId(), visible: true };
  for (const field of ITEM_FIELDS[sectionId] || []) {
    item[field.key] = field.key === 'level' ? 3 : (field.key === 'keywords' ? [] : '');
  }
  return item;
}

/** 空白简历（等价于 upcv 新建空白简历时服务端初始化出来的 data）。 */
export function blankResume() {
  const sections = {};
  for (const id of SECTION_ORDER) {
    const base = sectionBase(id);
    if (id === 'summary') {
      sections[id] = { ...base, content: '' };
    } else {
      sections[id] = { ...base, items: [] };
    }
  }
  sections.custom = {};
  return {
    basics: {
      name: '', headline: '', email: '', phone: '', location: '',
      url: { label: '', href: '' },
      customFields: [],
      picture: { url: '', size: 64, aspectRatio: 1, borderRadius: 0, effects: { hidden: false, border: false, grayscale: false } },
    },
    sections: sections,
    metadata: {
      template: DEFAULT_TEMPLATE_ID,
      layout: [[SECTION_ORDER.slice()]],
      css: { value: '', visible: false },
      // 与默认模板 rr-onyx 的页边距一致（32px）
      page: { margin: 32, format: 'a4', options: { breakLine: true, pageNumbers: true } },
      theme: { background: '#ffffff', text: '#242424', primary: '#312e81' },
      typography: {
        font: { family: 'Noto Sans SC', subset: 'chinese-simplified', variants: ['regular'], size: 13 },
        lineHeight: '1.55',
        hideIcons: false,
        underlineLinks: false,
      },
      notes: '',
    },
  };
}

/** 布局里出现的 section id（按列顺序展开，去重）。 */
export function layoutSectionIds(resume) {
  const layout = resume == null || resume.metadata == null ? null : resume.metadata.layout;
  const columns = Array.isArray(layout) && Array.isArray(layout[0]) ? layout[0] : [];
  const ids = [];
  for (const column of columns) {
    if (!Array.isArray(column)) continue;
    for (const id of column) if (ids.indexOf(id) === -1) ids.push(id);
  }
  return ids;
}

/** 渲染与编辑顺序：布局顺序打头，没进布局的 section 按 SECTION_ORDER 补在后面。 */
export function orderedSectionIds(resume) {
  const ids = layoutSectionIds(resume);
  return ids.concat(SECTION_ORDER.filter((id) => ids.indexOf(id) === -1));
}

/** 文本化：把简历压成纯文本（用于复用为 JD 对齐输入）。 */
export function resumeToPlainText(resume) {
  if (resume == null || typeof resume !== 'object') return '';
  const parts = [];
  const basics = resume.basics || {};
  const head = [basics.name, basics.headline].filter((v) => typeof v === 'string' && v !== '').join(' · ');
  if (head !== '') parts.push(head);
  const contact = [basics.phone, basics.email, basics.location].filter((v) => typeof v === 'string' && v !== '').join(' | ');
  if (contact !== '') parts.push(contact);
  const sections = resume.sections || {};
  for (const id of orderedSectionIds(resume)) {
    const section = sections[id];
    if (section == null || section.visible === false) continue;
    if (id === 'summary') {
      if (typeof section.content === 'string' && section.content.trim() !== '') {
        parts.push('【' + section.name + '】' + section.content.trim());
      }
      continue;
    }
    const items = Array.isArray(section.items) ? section.items : [];
    const lines = [];
    for (const item of items) {
      if (item == null || item.visible === false) continue;
      const fields = (ITEM_FIELDS[id] || []).filter((field) => field.key !== 'summary' && field.key !== 'description');
      const titleParts = [];
      for (const field of fields) {
        const value = item[field.key];
        if (Array.isArray(value) && value.length > 0) titleParts.push(value.join('、'));
        else if (typeof value === 'string' && value.trim() !== '') titleParts.push(value.trim());
      }
      const summary = [item.summary, item.description].filter((v) => typeof v === 'string' && v.trim() !== '').join(' ');
      const line = [titleParts.join(' · '), stripTags(summary)].filter((v) => v !== '').join('：');
      if (line !== '') lines.push(line);
    }
    if (lines.length > 0) parts.push('【' + section.name + '】' + lines.join('；'));
  }
  return parts.join('\n');
}

/** 去掉 HTML 标签（纯文本投影用）。 */
export function stripTags(input) {
  if (typeof input !== 'string') return '';
  let out = '';
  let index = 0;
  while (index < input.length) {
    const lt = input.indexOf('<', index);
    if (lt === -1) { out += input.slice(index); break; }
    out += input.slice(index, lt) + ' ';
    const gt = input.indexOf('>', lt);
    if (gt === -1) break;
    index = gt + 1;
  }
  return out.replace(/\s+/g, ' ').trim();
}

const asText = (value) => (typeof value === 'string' ? value.trim() : (typeof value === 'number' ? String(value) : ''));
const asArray = (value) => (Array.isArray(value) ? value : []);
const asRich = (value) => sanitizeHtml(typeof value === 'string' ? value : '');

/**
 * 把 highlights（要点数组）并进 summary。
 *
 * 我们的 item 结构与网站内部结构一致（只有 summary，没有 highlights 字段），
 * 所以模型返回的 highlights 必须合并进来——否则整段要点被静默丢弃，
 * 表现就是「导入后简历信息变少」。
 */
function mergeHighlights(summary, highlights) {
  const base = typeof summary === 'string' ? summary : '';
  const items = asArray(highlights)
    .map((item) => asRich(item).trim())
    .filter((item) => item !== '');
  if (items.length === 0) return base;
  const listItems = items.map((item) => (item.indexOf('<li') === 0 ? item : '<li>' + item + '</li>')).join('');
  return base + '<ul>' + listItems + '</ul>';
}

/** 补齐 item 的 id/visible 与缺失字段（模型常漏字段）。 */
function withId(sectionId, item) {
  const merged = { id: newId(), visible: true };
  for (const field of ITEM_FIELDS[sectionId] || []) {
    const raw = item == null ? undefined : item[field.key];
    if (field.key === 'keywords') merged[field.key] = asArray(raw).map(asText).filter((v) => v !== '');
    else if (field.key === 'level') {
      const num = Number(raw);
      merged[field.key] = Number.isFinite(num) ? Math.max(1, Math.min(5, Math.round(num))) : 3;
    } else if (field.rich) merged[field.key] = asRich(raw);
    else merged[field.key] = asText(raw);
  }
  return merged;
}

/**
 * upcv 的「导入简化结构 → schema」映射（docs/UPCV-RESUME-RE.md §3.3）。
 * 关键点：他们的经历类型比目标 section 多，靠 type 路由，且 section 名会随来源动态变化。
 * 同时兼容 JSON Resume 标准格式（work / projects / volunteer 分开给）。
 */
export function simplifiedToResume(simplified) {
  const resume = blankResume();
  const src = simplified == null || typeof simplified !== 'object' ? {} : simplified;
  const basics = src.basics == null || typeof src.basics !== 'object' ? {} : src.basics;

  resume.basics.name = asText(basics.name);
  resume.basics.headline = asText(basics.headline) || asText(basics.label);
  resume.basics.email = asText(basics.email);
  resume.basics.phone = asText(basics.phone);
  resume.basics.location = asText(basics.location) || asText(basics.city);
  const site = asText(basics.url) || asText(basics.website);
  if (site !== '') resume.basics.url = { label: '个人主页', href: site };

  const summary = asText(src.summary);
  if (summary !== '') resume.sections.summary.content = sanitizeHtml(summary);

  for (const entry of asArray(src.education)) {
    resume.sections.education.items.push(withId('education', {
      institution: asText(entry.institution) || asText(entry.school),
      studyType: asText(entry.studyType) || asText(entry.degree),
      area: asText(entry.area) || asText(entry.major),
      score: asText(entry.score),
      date: formatDate(entry.startDate, entry.endDate) || asText(entry.date),
      summary: mergeHighlights(entry.summary || entry.description, entry.highlights),
    }));
  }

  // 经历：既支持 upcv 的 experiences[]（带 type），也支持 JSON Resume 的分开数组
  const work = [];
  const internship = [];
  const volunteer = [];
  const projects = [];
  for (const entry of asArray(src.experiences)) {
    const type = asText(entry.type);
    if (type === 'project') projects.push(entry);
    else if (type === 'work') work.push(entry);
    else if (type === 'internship') internship.push(entry);
    else volunteer.push(entry);
  }
  for (const entry of asArray(src.work)) work.push(entry);
  for (const entry of asArray(src.projects)) projects.push({ ...entry, type: 'project' });
  for (const entry of asArray(src.volunteer)) volunteer.push(entry);

  for (const entry of work) {
    resume.sections.experience.items.push(withId('experience', {
      company: asText(entry.organization) || asText(entry.name) || asText(entry.company),
      position: asText(entry.title) || asText(entry.position),
      location: asText(entry.location),
      date: formatDate(entry.startDate, entry.endDate) || asText(entry.date),
      summary: mergeHighlights(entry.summary || entry.description, entry.highlights),
    }));
  }
  if (internship.length > 0) {
    // upcv 规则：有正式工作时并入「工作经历」并改名，否则单独叫「实习经历」
    resume.sections.experience.name = work.length > 0 ? '工作&实习经历' : '实习经历';
    for (const entry of internship) {
      resume.sections.experience.items.push(withId('experience', {
        company: asText(entry.organization) || asText(entry.name),
        position: asText(entry.title) || asText(entry.position),
        location: asText(entry.location),
        date: formatDate(entry.startDate, entry.endDate) || asText(entry.date),
        summary: mergeHighlights(entry.summary || entry.description, entry.highlights),
      }));
    }
  }

  if (volunteer.length > 0) {
    const kinds = volunteer.map((entry) => asText(entry.type));
    const hasOrg = kinds.indexOf('organization') !== -1;
    const hasExtra = kinds.indexOf('extracurricular') !== -1;
    const hasOther = kinds.indexOf('other') !== -1;
    resume.sections.volunteer.name = hasOrg && hasExtra
      ? '社团组织与工作以外经历'
      : hasOrg ? '社团和组织经历' : hasExtra ? '工作以外经历' : hasOther ? '其他经历' : '社团和组织经历';
    for (const entry of volunteer) {
      resume.sections.volunteer.items.push(withId('volunteer', {
        organization: asText(entry.organization) || asText(entry.name),
        position: asText(entry.title) || asText(entry.position),
        location: asText(entry.location),
        date: formatDate(entry.startDate, entry.endDate) || asText(entry.date),
        summary: mergeHighlights(entry.summary || entry.description, entry.highlights),
      }));
    }
  }

  for (const entry of projects) {
    resume.sections.projects.items.push(withId('projects', {
      name: asText(entry.name) || asText(entry.title),
      description: asText(entry.description) || asText(entry.role),
      date: formatDate(entry.startDate, entry.endDate) || asText(entry.date),
      summary: mergeHighlights(entry.summary, entry.highlights),
    }));
  }

  for (const entry of asArray(src.skills)) {
    resume.sections.skills.items.push(withId('skills', {
      name: asText(entry.name) || asText(entry.category),
      description: asText(entry.description),
      level: 3,
      keywords: entry.keywords || entry.items,
    }));
  }
  for (const entry of asArray(src.awards)) {
    resume.sections.awards.items.push(withId('awards', {
      title: asText(entry.title) || asText(entry.name),
      awarder: asText(entry.awarder) || asText(entry.issuer),
      date: normalizeMonth(entry.date),
      summary: mergeHighlights(entry.summary || entry.description, entry.highlights),
    }));
  }
  for (const entry of asArray(src.certificates || src.certifications)) {
    resume.sections.certifications.items.push(withId('certifications', {
      name: asText(entry.name) || asText(entry.title),
      issuer: asText(entry.issuer),
      date: normalizeMonth(entry.date),
      summary: mergeHighlights(entry.summary || entry.description, entry.highlights),
    }));
  }
  for (const entry of asArray(src.languages)) {
    resume.sections.languages.items.push(withId('languages', {
      name: asText(entry.name) || asText(entry.language),
      description: asText(entry.description) || asText(entry.fluency),
      level: 3,
    }));
  }
  for (const entry of asArray(src.profiles)) {
    resume.sections.profiles.items.push(withId('profiles', {
      network: asText(entry.network),
      username: asText(entry.username),
      url: asText(entry.url) || asText(entry.href),
    }));
  }
  return resume;
}

/**
 * 归一模型回包：既接受 JSON Resume 简化结构，也接受半成品 schema。
 * 返回 { resume, problems }；problems 用来提示用户哪些地方需要补。
 */
export function normalizeResume(raw) {
  const problems = [];
  const src = raw == null || typeof raw !== 'object' ? {} : raw;
  const looksLikeSchema = src.sections != null && typeof src.sections === 'object' && !Array.isArray(src.sections);
  if (!looksLikeSchema) {
    const resume = simplifiedToResume(src);
    if (resume.basics.name === '') problems.push('没有识别到姓名，请到「基本信息」补齐。');
    return { resume: resume, problems: problems };
  }
  // 半成品 schema：合并进空白模板，逐 section 补 id/visible 与缺失字段
  const resume = blankResume();
  const basics = src.basics == null || typeof src.basics !== 'object' ? {} : src.basics;
  for (const field of BASICS_FIELDS) resume.basics[field.key] = asText(basics[field.key]);
  if (basics.url != null && typeof basics.url === 'object') {
    resume.basics.url = { label: asText(basics.url.label), href: asText(basics.url.href) };
  }
  for (const id of SECTION_ORDER) {
    const incoming = src.sections[id];
    if (incoming == null || typeof incoming !== 'object') continue;
    const name = asText(incoming.name);
    if (name !== '') resume.sections[id].name = name;
    if (incoming.visible === false) resume.sections[id].visible = false;
    if (id === 'summary') {
      resume.sections[id].content = asRich(incoming.content);
      continue;
    }
    resume.sections[id].items = asArray(incoming.items).map((item) => withId(id, item));
  }
  const metadata = src.metadata == null || typeof src.metadata !== 'object' ? {} : src.metadata;
  const theme = metadata.theme == null || typeof metadata.theme !== 'object' ? {} : metadata.theme;
  for (const key of ['background', 'text', 'primary']) {
    const value = asText(theme[key]);
    if (value !== '') resume.metadata.theme[key] = value;
  }
  const page = metadata.page == null || typeof metadata.page !== 'object' ? {} : metadata.page;
  const margin = Number(page.margin);
  if (Number.isFinite(margin) && margin >= 0 && margin <= 80) resume.metadata.page.margin = Math.round(margin);
  const typography = metadata.typography == null || typeof metadata.typography !== 'object' ? {} : metadata.typography;
  const fontSize = Number(typography.font == null ? NaN : typography.font.size);
  if (Number.isFinite(fontSize) && fontSize >= 9 && fontSize <= 20) resume.metadata.typography.font.size = Math.round(fontSize);
  if (resume.basics.name === '') problems.push('没有识别到姓名，请到「基本信息」补齐。');
  return { resume: resume, problems: problems };
}

// ---------------------------------------------------------------------------
// 编辑器操作：全部返回新对象（React 状态不可变），不修改入参
// ---------------------------------------------------------------------------

function cloneResume(resume) {
  return {
    basics: { ...resume.basics, url: { ...resume.basics.url }, customFields: resume.basics.customFields.map((f) => ({ ...f })) },
    sections: resume.sections,
    metadata: resume.metadata,
  };
}

function withSection(resume, sectionId, section) {
  const next = cloneResume(resume);
  next.sections = { ...resume.sections, [sectionId]: section };
  return next;
}

export function addItem(resume, sectionId) {
  const section = resume.sections[sectionId];
  if (section == null || Array.isArray(section.items) !== true) return resume;
  return withSection(resume, sectionId, { ...section, items: section.items.concat([blankItem(sectionId)]) });
}

export function removeItem(resume, sectionId, itemId) {
  const section = resume.sections[sectionId];
  if (section == null || Array.isArray(section.items) !== true) return resume;
  return withSection(resume, sectionId, { ...section, items: section.items.filter((item) => item.id !== itemId) });
}

export function updateItem(resume, sectionId, itemId, key, value) {
  const section = resume.sections[sectionId];
  if (section == null || Array.isArray(section.items) !== true) return resume;
  const items = section.items.map((item) => (item.id === itemId ? { ...item, [key]: value } : item));
  return withSection(resume, sectionId, { ...section, items: items });
}

/** delta 为 -1 上移 / +1 下移；越界不动。 */
export function moveItem(resume, sectionId, itemId, delta) {
  const section = resume.sections[sectionId];
  if (section == null || Array.isArray(section.items) !== true) return resume;
  const index = section.items.findIndex((item) => item.id === itemId);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= section.items.length) return resume;
  const items = section.items.slice();
  const moved = items.splice(index, 1)[0];
  items.splice(target, 0, moved);
  return withSection(resume, sectionId, { ...section, items: items });
}

export function setSection(resume, sectionId, patch) {
  const section = resume.sections[sectionId];
  if (section == null) return resume;
  return withSection(resume, sectionId, { ...section, ...patch });
}

export function updateBasics(resume, key, value) {
  const next = cloneResume(resume);
  next.basics = { ...resume.basics, [key]: value };
  return next;
}

export function addCustomField(resume, label, value) {
  const next = cloneResume(resume);
  next.basics.customFields = resume.basics.customFields.concat([{ id: newId(), label: label || '', value: value || '' }]);
  return next;
}

export function updateCustomField(resume, id, key, value) {
  const next = cloneResume(resume);
  next.basics.customFields = resume.basics.customFields.map((field) => (field.id === id ? { ...field, [key]: value } : field));
  return next;
}

export function removeCustomField(resume, id) {
  const next = cloneResume(resume);
  next.basics.customFields = resume.basics.customFields.filter((field) => field.id !== id);
  return next;
}

export function updateMetadata(resume, path, value) {
  const next = cloneResume(resume);
  const metadata = { ...resume.metadata };
  if (path === 'theme.primary') metadata.theme = { ...metadata.theme, primary: value };
  else if (path === 'typography.font.size') metadata.typography = { ...metadata.typography, font: { ...metadata.typography.font, size: value } };
  else if (path === 'page.margin') metadata.page = { ...metadata.page, margin: value };
  next.metadata = metadata;
  return next;
}

/** 统计非空 section，用于「简历完成度」提示。 */
export function resumeStats(resume) {
  const sections = resume == null ? {} : resume.sections || {};
  let filled = 0;
  let items = 0;
  for (const id of SECTION_ORDER) {
    const section = sections[id];
    if (section == null) continue;
    if (id === 'summary') {
      if (typeof section.content === 'string' && stripTags(section.content) !== '') filled += 1;
      continue;
    }
    const count = asArray(section.items).length;
    if (count > 0) { filled += 1; items += count; }
  }
  return { sectionsFilled: filled, totalSections: SECTION_ORDER.length, items: items, hasName: resume != null && asText(resume.basics && resume.basics.name) !== '' };
}

// ---------------------------------------------------------------------------
// 样式选项（全部照抄 upcv，见 docs/UPCV-RESUME-SPEC.md）
// 存储位置与网站一致：resume.metadata.customStyles
// ---------------------------------------------------------------------------

/** 14 套模板（id → 中文名）：前 8 套重写自 Reactive Resume v4（MIT），
 * 后 6 套按视觉复刻自 Evarlio 免费模板（2026-11，只移植设计观感、代码全部自写），顺序即 UI 顺序。 */
export const TEMPLATES = [
  ['rr-bronzor', '极简黑'],
  ['rr-onyx', '正式墨'],
  ['rr-azurill', '评级经典'],
  ['rr-glalie', '淡青侧栏'],
  ['rr-chikorita', '翠绿侧栏'],
  ['rr-ditto', '横幅粉'],
  ['rr-lapras', '云卡片'],
  ['rr-porygon', '结构蓝'],
  ['rr-docket', '卷宗编号'],
  ['rr-ink', '宣纸衬线'],
  ['rr-glyph', '双列编号'],
  ['rr-meadow', '绿茵图标'],
  ['rr-lake', '湖畔衬线'],
  ['rr-light', '墨幕横幅'],
];

/** 默认模板（新建简历 / 无法归一的旧 id 都落到它）。 */
export const DEFAULT_TEMPLATE_ID = 'rr-onyx';

/**
 * 旧 45 套 id → 新 8 套（就近骨架家族）。
 *
 * 只用于**渲染层归一**：读简历时把旧 id 解释成新模板，绝不回写调用方给的数据——
 * 旧简历文件里的 template 值保持原样，用户打开看到的是「最近似的那一套版式」。
 */
export const TEMPLATE_MIGRATION = {
angledslate: 'rr-lapras', rhyhorn: 'rr-onyx', onyx: 'rr-onyx', elite: 'rr-onyx',
modern: 'rr-ditto', dynamicpreview: 'rr-ditto', glalie: 'rr-glalie', timeline: 'rr-azurill',
chikorita: 'rr-chikorita', elegance: 'rr-onyx', gengar: 'rr-porygon', minimalist: 'rr-bronzor',
pikachu: 'rr-onyx', streamline: 'rr-porygon', azurill: 'rr-azurill', nosepass: 'rr-onyx',
onecolumn: 'rr-onyx', ditto: 'rr-ditto', cascade: 'rr-azurill', bronzor: 'rr-bronzor',
techcard: 'rr-porygon', leafish: 'rr-glalie', harmony: 'rr-lapras', kakuna: 'rr-bronzor',
inkwell: 'rr-onyx', classicbusiness: 'rr-onyx', modernbusiness: 'rr-porygon',
professionallawyer: 'rr-onyx', fashiongradient: 'rr-ditto', neoncapsule: 'rr-ditto',
layeredelegant: 'rr-lapras', layeredcard: 'rr-lapras', layeredcapsule: 'rr-ditto',
modernelegant: 'rr-lapras', modernsplit: 'rr-glalie', layeredcarddual: 'rr-glalie',
wavecenter: 'rr-azurill', cardcapsule: 'rr-lapras', wavecapsule: 'rr-glalie',
carddashed: 'rr-lapras', cardsplit: 'rr-glalie', gridstandard: 'rr-porygon',
gridsplit: 'rr-chikorita', gridelegant: 'rr-azurill', campusrecruit: 'rr-onyx',
};

/** 字体（8）。 */
export const FONT_FAMILIES = [
  ['Noto Sans SC', '黑体'], ['Noto Serif SC', '宋体'], ['Alimama FangYuanTi', '方圆体'],
  ['ChillKai', '楷体'], ['Roboto', 'Roboto'], ['Open Sans', 'Open Sans'],
  ['Lato', 'Lato'], ['Montserrat', 'Montserrat'],
];

/** 字号 / 行高 / 页边距，与网站档位一致。 */
export const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18];
// 中文正文行高 1.5-1.6 是常态，所以 1.45 / 1.55 / 1.65 必须在可选档位里
export const LINE_HEIGHTS = ['1.4','1.45','1.5','1.55','1.6','1.65','1.7','1.8','1.9','2.0','2.2','2.4'];
export const PAGE_MARGINS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48];

/** 三组配色（各 11，网站原始值）。 */
export const PRIMARY_COLORS = [
  ['#2563eb', '经典蓝'], ['#0d9488', '清新绿'], ['#7c3aed', '雅致紫'], ['#d97706', '活力橙'],
  ['#dc2626', '醒目红'], ['#242424', '经典黑'], ['#0891b2', '清透青'], ['#4f46e5', '靛青'],
  ['#db2777', '玫红'], ['#059669', '翡翠绿'], ['#ca8a04', '金黄'],
];
export const BACKGROUND_COLORS = [
  ['#fffefe', '简历白'], ['#f8fafc', '浅灰'], ['#f5f5f4', '浅岩灰'], ['#fffbeb', '暖米'],
  ['#fff7ed', '浅橙'], ['#f0fdf4', '浅绿'], ['#ecfeff', '浅青'], ['#eff6ff', '浅蓝'],
  ['#faf5ff', '浅紫'], ['#fdf2f8', '浅粉'], ['#f0fdfa', '浅薄荷'],
];
export const TEXT_COLORS = [
  ['#242424', '经典黑'], ['#111827', '墨黑'], ['#374151', '深灰'], ['#475569', '蓝灰'],
  ['#57534e', '岩灰'], ['#1e3a8a', '深蓝'], ['#134e4a', '深绿'], ['#581c87', '深紫'],
  ['#78350f', '暖棕'], ['#0c4a6e', '深湖蓝'], ['#7f1d1d', '酒红'],
];

/**
 * 样式选项的读写（存放位置与网站一致：metadata.customStyles）。
 * 缺省时不写入 customStyles 键，渲染端按默认样式走。
 */
export function customStylesOf(resume) {
  const metadata = resume == null ? null : resume.metadata;
  const styles = metadata == null ? null : metadata.customStyles;
  return styles != null && typeof styles === 'object' ? styles : {};
}

export function setCustomStyle(resume, key, value) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, customStyles: { ...customStylesOf(resume), [key]: value } };
  return next;
}

/** 字体族。 */
export function setFontFamily(resume, family) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, typography: { ...resume.metadata.typography, font: { ...resume.metadata.typography.font, family: family } } };
  return next;
}

/** 字号。 */
export function setFontSize(resume, size) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, typography: { ...resume.metadata.typography, font: { ...resume.metadata.typography.font, size: size } } };
  return next;
}

/** 行高（中文正文通常 1.5-1.6）。 */
export function setLineHeight(resume, value) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, typography: { ...resume.metadata.typography, lineHeight: value } };
  return next;
}

/** 页边距。 */
export function setPageMargin(resume, margin) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, page: { ...resume.metadata.page, margin: margin } };
  return next;
}

/** 配色（key: primary | background | text）。纸面固定白底，background 只影响导出兜底。 */
export function setThemeColor(resume, key, value) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, theme: { ...resume.metadata.theme, [key]: value } };
  return next;
}

/** 自定义 CSS（高级功能，实时预览）。 */
export function setCustomCss(resume, value) {
  const text = typeof value === 'string' ? value : '';
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, css: { value: text, visible: text.trim() !== '' } };
  return next;
}


/**
 * 模板结构原型：8 套模板各对应一个（差异在**版面结构**，不在配色）。
 *
 * body  = 分栏骨架：rows（左侧标签行式）/ single（单栏）/ split（左右栏）/
 *         left-rail（浅色侧栏在左）/ right-rail（彩色侧栏在右）/ banner-split（横幅+双栏）/
 *         cards（浅底白卡）/ bands（深色标题条+卡片）
 * header = 页头形态；title = 板块标题体系；rating = 评级样式。
 * 渲染端 client/src/36-rr.js 按这些字段生成 HTML/CSS（预览 / 导出 / 截图共用同一份）。
 */
const TEMPLATE_ARCHETYPES = {
  'label-rows': {
    body: 'rows', header: 'photo-top-center', title: 'label', rating: 'dots',
    headerLane: 'page', ratio: null, railTone: 'none', railIds: [],
    font: 'Noto Sans SC', fontSize: 13, lineHeight: '1.6', margin: 32,
  },
  'formal-single': {
    body: 'single', header: 'photo-left', title: 'rule', rating: 'squares',
    headerLane: 'page', ratio: null, railTone: 'none', railIds: [],
    font: 'Noto Sans SC', fontSize: 13, lineHeight: '1.55', margin: 32,
  },
  'centered-split': {
    body: 'split', header: 'photo-top-center', title: 'rule', rating: 'stars',
    headerLane: 'page', ratio: [42, 58], railTone: 'none',
    railIds: ['skills', 'certifications', 'awards', 'publications'],
    font: 'Noto Sans SC', fontSize: 12, lineHeight: '1.55', margin: 28,
  },
  'left-rail': {
    body: 'left-rail', header: 'rail', title: 'rule', rating: 'dots',
    headerLane: 0, ratio: [34, 66], railTone: 'tint',
    railIds: ['languages', 'certifications', 'awards', 'interests', 'publications', 'references'],
    font: 'Noto Sans SC', fontSize: 13, lineHeight: '1.5', margin: 0,
  },
  'right-rail': {
    body: 'right-rail', header: 'top-left', title: 'rule', rating: 'bars',
    headerLane: 0, ratio: [62, 38], railTone: 'solid',
    railIds: ['languages', 'certifications', 'awards', 'interests', 'publications', 'references'],
    font: 'Noto Sans SC', fontSize: 13, lineHeight: '1.5', margin: 0,
  },
  'banner-split': {
    body: 'banner-split', header: 'banner', title: 'rule', rating: 'progress',
    headerLane: 'page', ratio: [33, 67], railTone: 'none',
    railIds: ['languages', 'certifications', 'awards', 'interests', 'publications'],
    font: 'Noto Sans SC', fontSize: 12, lineHeight: '1.5', margin: 0,
  },
  'card-stack': {
    body: 'cards', header: 'card', title: 'plain', rating: 'squares',
    headerLane: 'page', ratio: null, railTone: 'none', railIds: [],
    font: 'Noto Sans SC', fontSize: 13, lineHeight: '1.6', margin: 22,
  },
  'band-stack': {
    body: 'bands', header: 'card-table', title: 'band', rating: 'stars',
    headerLane: 'page', ratio: null, railTone: 'none', railIds: [],
    font: 'Noto Sans SC', fontSize: 13, lineHeight: '1.55', margin: 26,
  },

  // —— Evarlio 复刻组的原型变体：全部复用现有 body 骨架（分页/量测零改动），
  //    只换页头形态 / 评级样式 / 栏宽 / 字体预设。编号节标题与图标节标题由
  //    title 字段语义化（'rule' + CSS counter / 'icon' + rrSectionHtml 分支）。
  'serif-single': {
    body: 'single', header: 'photo-top-center', title: 'rule', rating: 'dots',
    headerLane: 'page', ratio: null, railTone: 'none', railIds: [],
    font: 'Noto Serif SC', fontSize: 13, lineHeight: '1.55', margin: 36,
  },
  'numbered-split': {
    body: 'split', header: 'photo-top-center', title: 'rule', rating: 'dots',
    headerLane: 'page', ratio: [50, 50], railTone: 'none',
    railIds: ['education', 'certifications', 'awards', 'publications', 'references', 'interests'],
    font: 'Noto Sans SC', fontSize: 13, lineHeight: '1.5', margin: 36,
  },
  'left-rail-flow': {
    body: 'left-rail', header: 'rail', title: 'rule', rating: 'progress',
    headerLane: 0, ratio: [34, 66], railTone: 'tint',
    railIds: ['languages', 'certifications', 'awards', 'interests', 'publications', 'references'],
    font: 'Noto Serif SC', fontSize: 13, lineHeight: '1.5', margin: 0,
  },
  'left-rail-icon': {
    body: 'left-rail', header: 'rail', title: 'icon', rating: 'dots',
    headerLane: 0, ratio: [34, 66], railTone: 'tint',
    railIds: ['languages', 'certifications', 'awards', 'interests', 'publications', 'references'],
    font: 'Noto Sans SC', fontSize: 13, lineHeight: '1.5', margin: 0,
  },
};

/** 每套模板：结构原型 + 默认主色 + 预设色板（6-8 个，第一个即默认色）。 */
const TEMPLATE_BY_ID = {
  'rr-bronzor': { archetype: 'label-rows', color: '#2f2f2f', palette: [
    ['#2f2f2f', '墨黑'], ['#1f3a5f', '深蓝'], ['#0f766e', '松绿'],
    ['#7c2d12', '赭石'], ['#4c1d95', '深紫'], ['#334155', '石板'], ['#7f1d1d', '酒红'],
  ] },
  'rr-onyx': { archetype: 'formal-single', color: '#312e81', palette: [
    ['#312e81', '靛紫'], ['#1f2937', '石墨'], ['#1e3a8a', '藏蓝'], ['#166534', '松绿'],
    ['#7c2d12', '栗棕'], ['#831843', '莓红'], ['#3b0764', '深紫'],
  ] },
  'rr-azurill': { archetype: 'centered-split', color: '#2563eb', palette: [
    ['#2563eb', '经典蓝'], ['#0d9488', '清透青'], ['#4f46e5', '靛青'],
    ['#b45309', '琥珀'], ['#be123c', '正红'], ['#166534', '森林绿'], ['#4338ca', '深靛'],
  ] },
  'rr-glalie': { archetype: 'left-rail', color: '#0f766e', palette: [
    ['#0f766e', '松青'], ['#0e7490', '湖蓝'], ['#4d7c0f', '苔绿'],
    ['#6d28d9', '雅紫'], ['#b45309', '琥珀'], ['#155e75', '深青'],
  ] },
  'rr-chikorita': { archetype: 'right-rail', color: '#166534', palette: [
    ['#166534', '翠绿'], ['#0f766e', '青绿'], ['#1e3a8a', '深蓝'],
    ['#7c2d12', '栗棕'], ['#4d7c0f', '橄榄'], ['#0c4a6e', '湖蓝'],
  ] },
  'rr-ditto': { archetype: 'banner-split', color: '#db2777', palette: [
    ['#db2777', '玫红'], ['#be123c', '正红'], ['#7c3aed', '雅紫'],
    ['#ea580c', '活力橙'], ['#0f766e', '松青'], ['#1e3a8a', '藏蓝'],
  ] },
  'rr-lapras': { archetype: 'card-stack', color: '#0e7490', palette: [
    ['#0e7490', '青蓝'], ['#2563eb', '经典蓝'], ['#0f766e', '松青'],
    ['#7c3aed', '雅紫'], ['#db2777', '玫红'], ['#b45309', '琥珀'],
  ] },
  'rr-porygon': { archetype: 'band-stack', color: '#1e3a8a', palette: [
    ['#1e3a8a', '藏蓝'], ['#1f2937', '石墨'], ['#134e4a', '深青'],
    ['#7f1d1d', '酒红'], ['#4c1d95', '深紫'], ['#334155', '石板'],
  ] },

  // —— Evarlio 复刻组：默认色取自原设计的实测色值（预览 DOM computed style）。
  'rr-docket': { archetype: 'serif-single', color: '#49373c', palette: [
    ['#49373c', '深棕'], ['#5c3a21', '咖棕'], ['#7c2d12', '赭石'],
    ['#1f3a2e', '松绿'], ['#243b57', '暮蓝'], ['#4a2c4d', '桑紫'],
  ] },
  'rr-ink': { archetype: 'serif-single', color: '#2f7a78', palette: [
    ['#2f7a78', '青瓷'], ['#0f766e', '松青'], ['#0e7490', '湖蓝'],
    ['#49373c', '深棕'], ['#334155', '石板'], ['#57534e', '岩灰'],
  ] },
  'rr-glyph': { archetype: 'numbered-split', color: '#2c2825', palette: [
    ['#2c2825', '炭黑'], ['#1f3a5f', '深蓝'], ['#0f766e', '松青'],
    ['#7c2d12', '铁锈'], ['#4c1d95', '深紫'], ['#334155', '石板'],
  ] },
  'rr-meadow': { archetype: 'left-rail-icon', color: '#384934', palette: [
    ['#384934', '森绿'], ['#166534', '草绿'], ['#0f766e', '松青'],
    ['#3f6212', '橄榄'], ['#134e4a', '深青'], ['#4d7c0f', '叶绿'],
  ] },
  'rr-lake': { archetype: 'left-rail-flow', color: '#29463d', palette: [
    ['#29463d', '深湖绿'], ['#0f766e', '松青'], ['#155e75', '深青'],
    ['#1f3a5f', '深蓝'], ['#4d7c0f', '苔绿'], ['#3f6212', '草绿'],
  ] },
  'rr-light': { archetype: 'banner-split', color: '#22262b', palette: [
    ['#22262b', '炭黑'], ['#1f2937', '石墨'], ['#0f172a', '深夜'],
    ['#312e81', '靛紫'], ['#134e4a', '深青'], ['#7c2d12', '栗棕'],
  ] },
};

/** 旧 id → 新 id；新 id 原样返回；无法识别（含空值）落到默认模板。 */
export function normalizeTemplateId(templateId) {
  if (typeof templateId !== 'string' || templateId === '') return DEFAULT_TEMPLATE_ID;
  if (TEMPLATE_BY_ID[templateId] !== undefined) return templateId;
  const migrated = TEMPLATE_MIGRATION[templateId];
  return migrated === undefined ? DEFAULT_TEMPLATE_ID : migrated;
}

/** 结构原型 key（未知 id 返回 null；旧 id 归一到映射目标）。 */
export function templateArchetype(templateId) {
  if (typeof templateId !== 'string' || templateId === '') return null;
  if (TEMPLATE_BY_ID[templateId] === undefined && TEMPLATE_MIGRATION[templateId] === undefined) return null;
  const entry = TEMPLATE_BY_ID[normalizeTemplateId(templateId)];
  return entry === undefined ? null : entry.archetype;
}

/** 模板完整描述（渲染端与 UI 都用它，不各自硬编码）。 */
export function templateSpec(templateId) {
  const id = normalizeTemplateId(templateId);
  const entry = TEMPLATE_BY_ID[id];
  const pair = TEMPLATES.find((item) => item[0] === id);
  const archetype = TEMPLATE_ARCHETYPES[entry.archetype];
  return {
    id: id,
    name: pair === undefined ? id : pair[1],
    archetype: entry.archetype,
    color: entry.color,
    palette: entry.palette,
    body: archetype.body,
    header: archetype.header,
    title: archetype.title,
    rating: archetype.rating,
    headerLane: archetype.headerLane,
    ratio: archetype.ratio,
    railTone: archetype.railTone,
    railIds: archetype.railIds,
    font: archetype.font,
    fontSize: archetype.fontSize,
    lineHeight: archetype.lineHeight,
    margin: archetype.margin,
  };
}

/** 某套模板的预设色板（[[hex, 中文名], ...]，第一个是默认主色）。 */
export function templatePalette(templateId) {
  const entry = TEMPLATE_BY_ID[normalizeTemplateId(templateId)];
  return entry.palette.slice();
}

/**
 * 某套模板下的栏目分工：单栏模板返回 [[全部 id]]，分栏模板按模板自己的板块归属切开。
 * 顺序来自用户当前的模块顺序（orderedSectionIds），模板只决定「谁在哪一栏」。
 */
export function templateLayout(resume, templateId) {
  const spec = templateSpec(templateId);
  const ids = orderedSectionIds(resume);
  if (spec.ratio === null) return [[ids]];
  const inRail = (id) => spec.railIds.indexOf(id) !== -1;
  const rail = ids.filter(inRail);
  const main = ids.filter((id) => !inRail(id));
  return spec.body === 'right-rail' ? [[main, rail]] : [[rail, main]];
}

/**
 * 应用一套模板：一次写整套版式（模板 id / 页边距 / 字体 / 字号 / 行高 / 主色 / 栏目分工）。
 *
 * 传旧 id 也能用（先归一到新套）——但**读取**旧简历不应该调用它：
 * 旧简历的 template 值必须原样保留，只由渲染层归一。
 * options.keepColor = true 时保留用户当前主色（切模板不覆盖已选配色）。
 */
export function applyTemplate(resume, templateId, options) {
  const id = normalizeTemplateId(templateId);
  const spec = templateSpec(id);
  const keepColor = options !== undefined && options !== null && options.keepColor === true;
  const next = cloneResume(resume);
  next.metadata = {
    ...resume.metadata,
    template: id,
    page: { ...resume.metadata.page, margin: spec.margin },
    theme: { ...resume.metadata.theme, primary: keepColor ? resume.metadata.theme.primary : spec.color },
    typography: {
      ...resume.metadata.typography,
      font: { ...resume.metadata.typography.font, family: spec.font, size: spec.fontSize },
      lineHeight: spec.lineHeight,
    },
  };
  next.metadata.layout = templateLayout(next, id);
  return next;
}
export function moveSectionOrder(resume, sectionId, delta) {
  // 栏目分工由模板决定，用户只控制「全局顺序」：上移/下移一格。
  const ids = orderedSectionIds(resume);
  const at = ids.indexOf(sectionId);
  const to = at + delta;
  if (at === -1 || !Number.isInteger(delta) || delta === 0 || to < 0 || to >= ids.length) return resume;
  const next = ids.slice();
  next.splice(at, 1);
  next.splice(to, 0, sectionId);
  const result = cloneResume(resume);
  result.metadata = { ...resume.metadata, layout: [[next]] };
  return result;
}
