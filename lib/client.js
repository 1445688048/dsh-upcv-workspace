/**
 * dsh-upcv-workspace — client half (generated).
 *
 * Hand-written bundle for the DSH client module loader; no bundler, no JSX.
 * Source of truth: client/src/*.js — edit those, then run build.
 */
/* ---- client/src/00-shell.js ---- */
/* ===========================================================================
 * dsh-upcv-workspace — client half, part 0: shell 与 API 客户端.
 *
 * 手写 __ModuleLoader__ 包（无打包器、无 JSX）：client/src/*.js 按文件名顺序
 * 由 scripts/build-client.mjs 拼成 lib/client.js。只使用平台种子 `react`。
 * ======================================================================== */
window.__ModuleLoader__.load({
  id: 'dsh-upcv-workspace',
  factory: (require) => {
    const React = require('react');
    const h = React.createElement;
    
    const NS = 'upcv.workspace';

    // ========== 服务端 API（exact /api 路由，见 server/api.js）==========
    const CLIENT_VERSION = '0.25.5';
    const API_BASE = '/api/dsh-upcv-workspace';
    const ACTION_HEADER = 'x-dsh-upcv-action';

    async function apiGet(path) {
      const res = await fetch(API_BASE + path, { headers: { accept: 'application/json' } });
      const data = await res.json().catch(() => null);
      if (data === null) throw new Error('服务返回了无法解析的内容');
      return data;
    }

    async function apiPost(path, body) {
      const res = await fetch(API_BASE + path, {
        method: 'POST',
        headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => null);
      if (data === null) throw new Error('服务返回了无法解析的内容');
      if (res.ok !== true) {
        const error = new Error((data && (data.message || data.error)) || '请求失败');
        error.data = data;
        throw error;
      }
      return data;
    }

    // ========== 本地持久化（服务端落盘到 config.root）==========
    const storeList = (collection) => apiGet('/store?collection=' + encodeURIComponent(collection));
    const storeSave = (collection, item) => apiPost('/store/save', { collection: collection, item: item });
    const storeDelete = (collection, id) => apiPost('/store/delete', { collection: collection, id: id });

    /** 把一份简历记录压成纯文本，供 JD 对齐/优化复用。 */
    function resumeToText(record) {
      if (record === null || record === undefined) return '';
      const parts = [];
      if (record.name || record.targetJob) parts.push([record.name, record.targetJob].filter(Boolean).join(' · '));
      if (record.summary) parts.push(record.summary);
      for (const section of record.sections || []) {
        parts.push('【' + (section.type || '其他') + '】' + (section.content || ''));
      }
      if (parts.length === 0 && record.experience) parts.push(String(record.experience));
      return parts.join('\n');
    }

    /** 记录列表的通用加载。 */
    function useHistory(collection) {
      const [items, setItems] = React.useState([]);
      const [note, setNote] = React.useState('');
      const reload = React.useCallback(() => {
        storeList(collection)
          .then((data) => { setItems(data.items || []); setNote(data.note || ''); })
          .catch(() => { setItems([]); setNote('unavailable'); });
      }, [collection]);
      React.useEffect(() => { reload(); }, [reload]);
      return { items: items, note: note, reload: reload };
    }

    /** 统一的时间显示。 */
    function formatTime(iso) {
      if (typeof iso !== 'string' || iso === '') return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
    }

    /** 探测宿主模型是否可用；不可用时界面明确提示并走本地题库。 */
    function useAiStatus() {
      const [status, setStatus] = React.useState({ loading: true, available: false, providers: [], models: [], version: '' });
      React.useEffect(() => {
        let alive = true;
        apiGet('/meta')
          .then((data) => {
            if (!alive) return;
            setStatus({
              loading: false,
              available: data && data.ai && data.ai.available === true,
              providers: (data && data.ai && data.ai.providers) || [],
              models: (data && data.ai && data.ai.models) || [],
              version: (data && data.version) || '',
            });
          })
          .catch(() => { if (alive) setStatus({ loading: false, available: false, providers: [], models: [], version: '' }); });
        return () => { alive = false; };
      }, []);
      return status;
    }

    /** 无模型时的本地启发式评分，保证面试流程仍然可用。 */
    function localReport(transcript) {
      const answers = transcript.map((item) => String(item.answer || ''));
      const total = answers.reduce((sum, text) => sum + text.length, 0);
      const avgLen = answers.length === 0 ? 0 : total / answers.length;
      const lengthScore = Math.max(45, Math.min(92, Math.round(45 + avgLen / 3)));
      const structured = answers.filter((text) => /我|项目|结果|数据|提升|降低|用户|负责/.test(text)).length;
      const structure = Math.round((structured / Math.max(1, answers.length)) * 20 + 62);
      const overall = Math.round((lengthScore + structure) / 2);
      return {
        overall: overall,
        communication: structure,
        professionalism: overall,
        logic: structure,
        strengths: [avgLen >= 60 ? '回答有足够细节，能展开说明背景与做法' : '能完整作答，态度认真'],
        suggestions: [
          avgLen < 60 ? '回答偏短，建议每题至少覆盖「背景—做法—结果」三层信息' : '回答长度合适，可以进一步突出个人贡献',
          '用具体数据说明结果，例如提升了多少百分比、覆盖多少用户',
          '开头先给结论再展开细节，方便面试官快速抓住重点',
        ],
        perQuestion: transcript.map((item, index) => ({
          index: index + 1,
          comment: String(item.answer || '').length < 40 ? '回答较短，可补充细节与结果。' : '回答较完整，可再强调量化成果。',
        })),
      };
    }

    
    // ========== 图标（内联 SVG，1.7 描边，currentColor）==========
    // 用矢量图标替换 emoji：emoji 的字形、基线与配色由系统字体决定，
    // 跨平台尺寸不可控，也无法跟随主题色，属于 generic AI 观感。
    const ICON_PATHS = {
      'file-text': 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M9 13h6M9 17h4',
      'mic': 'M12 3a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V6a3 3 0 0 1 3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
      'briefcase': 'M4 8h16a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1zM9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18',
      'target': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
      'upload': 'M12 16V4M7 9l5-5 5 5M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2',
      'download': 'M12 4v12M7 11l5 5 5-5M4 19v1a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1',
      'sparkles': 'M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6zM18 15l.7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7z',
      'file-plus': 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zM14 3v5h5M12 12v6M9 15h6',
      'arrow-left': 'M19 12H5M11 18l-6-6 6-6',
      'arrow-right': 'M5 12h14M13 6l6 6-6 6',
      'trash': 'M4 7h16M10 11v6M14 11v6M6 7l1 12a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2',
      'check': 'M4 12l5 5L20 6',
      'x': 'M6 6l12 12M18 6L6 18',
      'check-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM8.5 12.5l2.5 2.5 4.5-5',
      'lightbulb': 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8V16h7.2v-2.2A6 6 0 0 0 12 3z',
      'alert': 'M12 4l9 16H3zM12 10v4M12 17.5h.01',
      'folder': 'M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
      'zoom': 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
      'search': 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4M8 11h6M11 8v6',
      'chevron-right': 'M9 6l6 6-6 6',
      'chevron-down': 'M6 9l6 6 6-6',
      'copy': 'M9 9h12v12H9zM16 9V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h4',
      'inbox': 'M4 13h4l2 3h4l2-3h4M4 13l2-7h12l2 7v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z',
      'external-link': 'M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5',
      'file-search': 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h3M14 3v5h5M19 8v3M9 14a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5zM11.2 19.2L14 22',
    };

    /**
     * 渲染一个内联 SVG 图标。
     *
     * 只接受白名单里的名字，未知名字返回 null —— 避免拼错图标名时静默渲染空白占位。
     * 用可变参数传子元素：h('button', props, Icon('x'), '文字') 不需要 key。
     */
    function Icon(name, size) {
      const d = ICON_PATHS[name];
      if (d === undefined) return null;
      const px = size === 'lg' ? 20 : 16;
      return h('svg', {
        className: 'upcv-icon',
        viewBox: '0 0 24 24',
        width: px,
        height: px,
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 1.7,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        'aria-hidden': 'true',
        focusable: 'false',
      }, h('path', { d: d }));
    }

    // ========== 多语言 ==========
    const zh = {
      title: '求职工作台',
      loginWelcome: 'UPCV 求职工作台',
      loginDesc: 'AI 简历 · 模拟面试 · 岗位推荐',
      loginBtn: '开始使用',
      logout: '退出',
      
      // 首页
      hero_title: 'AI 时代的',
      hero_subtitle: '求职基础建设',
      hero_desc: '从简历到 Offer，全流程 AI 陪伴',
      hero_cta: '开始求职',
      
      // 三大功能
      feature_resume: 'AI 简历',
      feature_resume_desc: '3分钟制作专业简历，对准岗位逐句定制',
      feature_interview: '模拟面试',
      feature_interview_desc: 'AI 语音面试官，真题题库逐题点评',
      feature_jobs: '岗位推荐',
      feature_jobs_desc: '智能匹配最适合你的职位',
      
      // 简历
      resume_title: 'AI 简历构建',
      resume_step1: '填写基本信息',
      resume_step2: '输入工作经历',
      resume_step3: 'AI 优化简历',
      resume_preview: '简历预览',
      resume_generate: '✨ AI 生成简历',
      resume_optimize: '🔄 AI 优化中...',
      
      // 面试
      interview_title: '模拟面试',
      interview_select: '选择题库',
      interview_start: '开始面试',
      interview_question: '问题',
      interview_answer: '你的回答',
      interview_submit: '提交回答',
      interview_next: '下一题',
      interview_report: '面试报告',
      interview_score: '综合评分',
      interview_feedback: '改进建议',
      
      // 岗位
      jobs_title: '岗位推荐',
      jobs_search: '搜索岗位...',
      jobs_filter: '筛选',
      jobs_match: '匹配度',
      jobs_apply: '查看详情',
    };
    
    const en = {
      title: 'Career Workbench',
      loginWelcome: 'UPCV Career Workbench',
      loginDesc: 'AI Resume · Mock Interview · Job Recommendations',
      loginBtn: 'Get Started',
      logout: 'Sign Out',
      hero_title: 'AI-Powered',
      hero_subtitle: 'Career Infrastructure',
      hero_desc: 'From resume to offer, AI accompanies you every step',
      hero_cta: 'Start Now',
      feature_resume: 'AI Resume',
      feature_resume_desc: 'Build professional resume in 3 minutes',
      feature_interview: 'Mock Interview',
      feature_interview_desc: 'AI voice interviewer with real questions',
      feature_jobs: 'Job Matches',
      feature_jobs_desc: 'Smart matching for your ideal position',
      resume_title: 'AI Resume Builder',
      interview_title: 'Mock Interview',
      jobs_title: 'Job Recommendations',
    };

/* ---- client/src/05-schema.js ---- */
/**
 * dsh-upcv-workspace — client half, part 0.5: 简历数据模型（构建生成，不要手改）。
 *
 * 源文件：server/resume-schema.js。改那边，然后重新构建。
 */
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
const SECTION_ORDER = [
  'profiles', 'summary', 'education', 'experience', 'projects', 'volunteer',
  'languages', 'skills', 'interests', 'certifications', 'awards', 'publications', 'references',
];

/** section 中文名（与 upcv 完全一致）。 */
const SECTION_LABELS = {
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
const BASICS_FIELDS = [
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
const ITEM_FIELDS = {
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
function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * HTML 白名单清洗（描述字段允许富文本，模型可能带 script/onclick）。
 * 逐字符扫描而不是正则替换：属性**全部**剥掉，因此不存在事件属性漏网。
 */
function sanitizeHtml(input) {
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
function normalizeMonth(value) {
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
function formatDate(start, end) {
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
function blankItem(sectionId) {
  const item = { id: newId(), visible: true };
  for (const field of ITEM_FIELDS[sectionId] || []) {
    item[field.key] = field.key === 'level' ? 3 : (field.key === 'keywords' ? [] : '');
  }
  return item;
}

/** 空白简历（等价于 upcv 新建空白简历时服务端初始化出来的 data）。 */
function blankResume() {
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
function layoutSectionIds(resume) {
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
function orderedSectionIds(resume) {
  const ids = layoutSectionIds(resume);
  return ids.concat(SECTION_ORDER.filter((id) => ids.indexOf(id) === -1));
}

/** 文本化：把简历压成纯文本（用于复用为 JD 对齐输入）。 */
function resumeToPlainText(resume) {
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
function stripTags(input) {
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
function simplifiedToResume(simplified) {
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
function normalizeResume(raw) {
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

function addItem(resume, sectionId) {
  const section = resume.sections[sectionId];
  if (section == null || Array.isArray(section.items) !== true) return resume;
  return withSection(resume, sectionId, { ...section, items: section.items.concat([blankItem(sectionId)]) });
}

function removeItem(resume, sectionId, itemId) {
  const section = resume.sections[sectionId];
  if (section == null || Array.isArray(section.items) !== true) return resume;
  return withSection(resume, sectionId, { ...section, items: section.items.filter((item) => item.id !== itemId) });
}

function updateItem(resume, sectionId, itemId, key, value) {
  const section = resume.sections[sectionId];
  if (section == null || Array.isArray(section.items) !== true) return resume;
  const items = section.items.map((item) => (item.id === itemId ? { ...item, [key]: value } : item));
  return withSection(resume, sectionId, { ...section, items: items });
}

/** delta 为 -1 上移 / +1 下移；越界不动。 */
function moveItem(resume, sectionId, itemId, delta) {
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

function setSection(resume, sectionId, patch) {
  const section = resume.sections[sectionId];
  if (section == null) return resume;
  return withSection(resume, sectionId, { ...section, ...patch });
}

function updateBasics(resume, key, value) {
  const next = cloneResume(resume);
  next.basics = { ...resume.basics, [key]: value };
  return next;
}

function addCustomField(resume, label, value) {
  const next = cloneResume(resume);
  next.basics.customFields = resume.basics.customFields.concat([{ id: newId(), label: label || '', value: value || '' }]);
  return next;
}

function updateCustomField(resume, id, key, value) {
  const next = cloneResume(resume);
  next.basics.customFields = resume.basics.customFields.map((field) => (field.id === id ? { ...field, [key]: value } : field));
  return next;
}

function removeCustomField(resume, id) {
  const next = cloneResume(resume);
  next.basics.customFields = resume.basics.customFields.filter((field) => field.id !== id);
  return next;
}

function updateMetadata(resume, path, value) {
  const next = cloneResume(resume);
  const metadata = { ...resume.metadata };
  if (path === 'theme.primary') metadata.theme = { ...metadata.theme, primary: value };
  else if (path === 'typography.font.size') metadata.typography = { ...metadata.typography, font: { ...metadata.typography.font, size: value } };
  else if (path === 'page.margin') metadata.page = { ...metadata.page, margin: value };
  next.metadata = metadata;
  return next;
}

/** 统计非空 section，用于「简历完成度」提示。 */
function resumeStats(resume) {
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
const TEMPLATES = [
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
const DEFAULT_TEMPLATE_ID = 'rr-onyx';

/**
 * 旧 45 套 id → 新 8 套（就近骨架家族）。
 *
 * 只用于**渲染层归一**：读简历时把旧 id 解释成新模板，绝不回写调用方给的数据——
 * 旧简历文件里的 template 值保持原样，用户打开看到的是「最近似的那一套版式」。
 */
const TEMPLATE_MIGRATION = {
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
const FONT_FAMILIES = [
  ['Noto Sans SC', '黑体'], ['Noto Serif SC', '宋体'], ['Alimama FangYuanTi', '方圆体'],
  ['ChillKai', '楷体'], ['Roboto', 'Roboto'], ['Open Sans', 'Open Sans'],
  ['Lato', 'Lato'], ['Montserrat', 'Montserrat'],
];

/** 字号 / 行高 / 页边距，与网站档位一致。 */
const FONT_SIZES = [12, 13, 14, 15, 16, 17, 18];
// 中文正文行高 1.5-1.6 是常态，所以 1.45 / 1.55 / 1.65 必须在可选档位里
const LINE_HEIGHTS = ['1.4','1.45','1.5','1.55','1.6','1.65','1.7','1.8','1.9','2.0','2.2','2.4'];
const PAGE_MARGINS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 44, 48];

/** 三组配色（各 11，网站原始值）。 */
const PRIMARY_COLORS = [
  ['#2563eb', '经典蓝'], ['#0d9488', '清新绿'], ['#7c3aed', '雅致紫'], ['#d97706', '活力橙'],
  ['#dc2626', '醒目红'], ['#242424', '经典黑'], ['#0891b2', '清透青'], ['#4f46e5', '靛青'],
  ['#db2777', '玫红'], ['#059669', '翡翠绿'], ['#ca8a04', '金黄'],
];
const BACKGROUND_COLORS = [
  ['#fffefe', '简历白'], ['#f8fafc', '浅灰'], ['#f5f5f4', '浅岩灰'], ['#fffbeb', '暖米'],
  ['#fff7ed', '浅橙'], ['#f0fdf4', '浅绿'], ['#ecfeff', '浅青'], ['#eff6ff', '浅蓝'],
  ['#faf5ff', '浅紫'], ['#fdf2f8', '浅粉'], ['#f0fdfa', '浅薄荷'],
];
const TEXT_COLORS = [
  ['#242424', '经典黑'], ['#111827', '墨黑'], ['#374151', '深灰'], ['#475569', '蓝灰'],
  ['#57534e', '岩灰'], ['#1e3a8a', '深蓝'], ['#134e4a', '深绿'], ['#581c87', '深紫'],
  ['#78350f', '暖棕'], ['#0c4a6e', '深湖蓝'], ['#7f1d1d', '酒红'],
];

/**
 * 样式选项的读写（存放位置与网站一致：metadata.customStyles）。
 * 缺省时不写入 customStyles 键，渲染端按默认样式走。
 */
function customStylesOf(resume) {
  const metadata = resume == null ? null : resume.metadata;
  const styles = metadata == null ? null : metadata.customStyles;
  return styles != null && typeof styles === 'object' ? styles : {};
}

function setCustomStyle(resume, key, value) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, customStyles: { ...customStylesOf(resume), [key]: value } };
  return next;
}

/** 字体族。 */
function setFontFamily(resume, family) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, typography: { ...resume.metadata.typography, font: { ...resume.metadata.typography.font, family: family } } };
  return next;
}

/** 字号。 */
function setFontSize(resume, size) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, typography: { ...resume.metadata.typography, font: { ...resume.metadata.typography.font, size: size } } };
  return next;
}

/** 行高（中文正文通常 1.5-1.6）。 */
function setLineHeight(resume, value) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, typography: { ...resume.metadata.typography, lineHeight: value } };
  return next;
}

/** 页边距。 */
function setPageMargin(resume, margin) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, page: { ...resume.metadata.page, margin: margin } };
  return next;
}

/** 配色（key: primary | background | text）。纸面固定白底，background 只影响导出兜底。 */
function setThemeColor(resume, key, value) {
  const next = cloneResume(resume);
  next.metadata = { ...resume.metadata, theme: { ...resume.metadata.theme, [key]: value } };
  return next;
}

/** 自定义 CSS（高级功能，实时预览）。 */
function setCustomCss(resume, value) {
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
function normalizeTemplateId(templateId) {
  if (typeof templateId !== 'string' || templateId === '') return DEFAULT_TEMPLATE_ID;
  if (TEMPLATE_BY_ID[templateId] !== undefined) return templateId;
  const migrated = TEMPLATE_MIGRATION[templateId];
  return migrated === undefined ? DEFAULT_TEMPLATE_ID : migrated;
}

/** 结构原型 key（未知 id 返回 null；旧 id 归一到映射目标）。 */
function templateArchetype(templateId) {
  if (typeof templateId !== 'string' || templateId === '') return null;
  if (TEMPLATE_BY_ID[templateId] === undefined && TEMPLATE_MIGRATION[templateId] === undefined) return null;
  const entry = TEMPLATE_BY_ID[normalizeTemplateId(templateId)];
  return entry === undefined ? null : entry.archetype;
}

/** 模板完整描述（渲染端与 UI 都用它，不各自硬编码）。 */
function templateSpec(templateId) {
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
function templatePalette(templateId) {
  const entry = TEMPLATE_BY_ID[normalizeTemplateId(templateId)];
  return entry.palette.slice();
}

/**
 * 某套模板下的栏目分工：单栏模板返回 [[全部 id]]，分栏模板按模板自己的板块归属切开。
 * 顺序来自用户当前的模块顺序（orderedSectionIds），模板只决定「谁在哪一栏」。
 */
function templateLayout(resume, templateId) {
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
function applyTemplate(resume, templateId, options) {
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
function moveSectionOrder(resume, sectionId, delta) {
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

/* ---- client/src/10-styles.js ---- */
/* ===========================================================================
 * dsh-upcv-workspace — client half, part 1: 样式.
 *
 * 手写 __ModuleLoader__ 包（无打包器、无 JSX）：client/src/*.js 按文件名顺序
 * 由 scripts/build-client.mjs 拼成 lib/client.js。只使用平台种子 `react`。
 * ======================================================================== */
    // ========== CSS ==========
    const css = `
      .upcv-app { display:flex; flex-direction:column; height:100%; overflow-y:auto; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-primary); font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; }
      /* 头部必须是语义 header，且为 customFrame 根的第一个子元素：
         宿主据此自动加 padding-inline-start: var(--dsh-frame-leading-clearance)，
         避免收起侧栏时被 macOS 红绿灯压住。这里不要再加同款边距（会双份）。 */
      .upcv-header { display:flex; align-items:center; justify-content:space-between; padding:12px 20px; border-bottom:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-2); position:sticky; top:0; z-index:10; }
      /* 编辑器工具栏嵌得更深，宿主规则匹配不到，手动镜像同一条（含 160px 兜底值） */
      html[data-platform=darwin] [data-sidebar-collapsed] .upcv-editor-bar { padding-inline-start:var(--dsh-frame-leading-clearance,160px); }
      .upcv-header-brand { display:flex; align-items:center; gap:8px; font-weight:700; font-size:15px; }
      .upcv-header-logo { width:28px; height:28px; background:linear-gradient(135deg,#1e4aff,#5c82ff); border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:12px; color:white; font-weight:800; }
      .upcv-hero { text-align:center; padding:60px 20px 40px; }
      .upcv-hero h1 { font-size:36px; font-weight:900; line-height:1.15; letter-spacing:-0.02em; margin-bottom:16px; }
      .upcv-hero h1 span { color:var(--dsw-alias-brand-primary); }
      .upcv-hero p { font-size:16px; color:var(--dsw-alias-label-secondary); max-width:480px; margin:0 auto 28px; line-height:1.6; }
      .upcv-features { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; padding:0 20px 40px; max-width:900px; margin:0 auto; }
      @media(max-width:700px){.upcv-features{grid-template-columns:1fr;}}
      .upcv-feature { background:var(--dsw-alias-bg-layer-3); border:1px solid var(--dsw-alias-border-l4); border-radius:14px; padding:24px; text-align:left; cursor:pointer; transition:border-color .15s,transform .15s; }
      .upcv-feature:hover { border-color:var(--dsw-alias-brand-primary); transform:translateY(-2px); }
      .upcv-feature-icon { width:44px; height:44px; background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); border-radius:12px; display:flex; align-items:center; justify-content:center; font-size:20px; margin-bottom:14px; }
      .upcv-feature h3 { font-size:16px; font-weight:700; margin-bottom:6px; }
      .upcv-feature p { font-size:13px; color:var(--dsw-alias-label-tertiary); line-height:1.5; }
      .upcv-page { padding:20px; max-width:800px; margin:0 auto; }
      .upcv-back { display:inline-flex; align-items:center; gap:4px; color:var(--dsw-alias-label-secondary); font-size:13px; cursor:pointer; margin-bottom:16px; }
      .upcv-back:hover { color:var(--dsw-alias-brand-primary); }
      .upcv-input { width:100%; padding:10px 12px; border:1px solid var(--dsw-alias-border-l4); border-radius:8px; background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); font-size:14px; box-sizing:border-box; }
      .upcv-input:focus { outline:none; border-color:var(--dsw-alias-brand-primary); }
      .upcv-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:10px 20px; border-radius:8px; font-size:14px; font-weight:600; cursor:pointer; border:none; transition:opacity .15s; }
      .upcv-btn:disabled { opacity:0.45; cursor:not-allowed; }
      .upcv-mini:disabled { opacity:0.45; cursor:not-allowed; }
      /* 主按钮必须用宿主的按钮 token：brand-primary 在深色主题下是 #f9fafb（近白），
         文字要用 label-primary-inverted（深色下 #353638）。写死 white 会变成白底白字。 */
      .upcv-btn-primary { background:var(--dsw-alias-button-primary-fill); color:var(--dsw-alias-label-primary-inverted); }
      .upcv-btn-primary:hover { background:var(--dsw-alias-button-primary-hover); }
      .upcv-btn-primary:hover { opacity:0.9; }
      .upcv-btn-secondary { background:var(--dsw-alias-button-elevated-fill); color:var(--dsw-alias-label-primary); border:1px solid var(--dsw-alias-border-l4); }
      @keyframes upcv-wave{0%,100%{transform:scaleY(0.5);opacity:0.5}50%{transform:scaleY(1);opacity:1}}
      .upcv-card { background:var(--dsw-alias-bg-layer-3); border:1px solid var(--dsw-alias-border-l4); border-radius:12px; padding:16px; margin-bottom:12px; }
      .upcv-tag { display:inline-block; padding:3px 10px; border-radius:999px; font-size:12px; background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color:var(--dsw-alias-brand-primary); }
      .upcv-notice { display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border-radius:8px; font-size:13px; line-height:1.5; background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color:var(--dsw-alias-brand-primary); margin-bottom:12px; }
      .upcv-error { display:flex; align-items:flex-start; gap:8px; padding:10px 12px; border-radius:8px; font-size:13px; line-height:1.5; background:color-mix(in srgb, var(--dsw-alias-state-error-primary, #dc2626) 10%, transparent); color:var(--upcv-danger-ink); margin-bottom:12px; }
      .upcv-ai-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:999px; font-size:11px; font-weight:600; border:1px solid var(--dsw-alias-border-l4); color:var(--dsw-alias-label-tertiary); }
      .upcv-ai-dot { width:6px; height:6px; border-radius:50%; background:var(--dsw-alias-label-tertiary, #9ca3af); }
      .upcv-ai-dot.on { background:var(--dsw-alias-state-success-primary, #16a34a); }
      .upcv-ai-dot.off { background:var(--dsw-alias-state-warn-label, #f59e0b); }
      @keyframes upcv-pulse { 0%,100% { opacity:1 } 50% { opacity:0.55 } }
      .upcv-score-row { display:flex; align-items:center; gap:10px; margin-bottom:8px; font-size:13px; }
      .upcv-score-label { width:64px; color:var(--dsw-alias-label-secondary); flex:none; }
      .upcv-score-bar { flex:1; height:6px; border-radius:999px; background:var(--dsw-alias-bg-layer-1); overflow:hidden; }
      .upcv-score-bar span { display:block; height:100%; background:var(--dsw-alias-brand-primary); }
      .upcv-score-num { width:32px; text-align:right; font-weight:700; flex:none; }
      .upcv-list { font-size:13px; color:var(--dsw-alias-label-secondary); padding-left:18px; margin:0; line-height:1.7; }
      .upcv-jobs-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(260px,1fr)); gap:12px; }
      .upcv-chip { display:inline-block; padding:2px 8px; border-radius:6px; font-size:11px; background:var(--dsw-alias-bg-layer-1); color:var(--dsw-alias-label-tertiary); margin:0 6px 6px 0; }
      .upcv-input-sm { padding:6px 9px; font-size:13px; }
      .upcv-drop { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:6px; min-height:150px; padding:20px; border:1px dashed var(--dsw-alias-border-l4); border-radius:10px; cursor:pointer; text-align:center; background:var(--dsw-alias-bg-layer-3); }
      .upcv-drop:hover, .upcv-drop.on { border-color:var(--dsw-alias-brand-primary); background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); }
      .upcv-panel { border:1px solid var(--dsw-alias-border-l4); border-radius:10px; margin-bottom:10px; overflow:hidden; background:var(--dsw-alias-bg-layer-3); }
      .upcv-panel-head { display:flex; align-items:center; gap:8px; padding:10px 12px; cursor:pointer; background:var(--dsw-alias-bg-layer-2); }
      .upcv-panel-head:hover { background:var(--dsw-alias-bg-layer-1); }
      .upcv-panel-title { font-size:13px; font-weight:700; flex:1; }
      .upcv-panel-body { padding:12px; display:flex; flex-direction:column; gap:8px; }
      .upcv-item { border:1px solid var(--dsw-alias-border-l4); border-radius:8px; padding:10px; margin-bottom:8px; background:var(--dsw-alias-bg-layer-2); }
      .upcv-item-head { display:flex; align-items:center; gap:6px; margin-bottom:8px; }
      .upcv-item-title { flex:1; font-size:12px; font-weight:600; color:var(--dsw-alias-label-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
      .upcv-tpl-grid { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:8px; }
      .upcv-tplcard { display:flex; flex-direction:column; align-items:center; gap:6px; padding:6px; background:var(--dsw-alias-bg-layer-3); border:1px solid var(--dsw-alias-border-l4); border-radius:var(--upcv-r-md); cursor:pointer; }
      .upcv-tplcard:hover { border-color:var(--dsw-alias-brand-primary); }
      .upcv-tplcard.on { border-color:var(--dsw-alias-brand-primary); box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 30%, transparent); }
      .upcv-tplthumb { width:148px; height:210px; overflow:hidden; border-radius:6px; background:#fff; position:relative; }
      .upcv-tplthumb > .rr-sheet { zoom:0.186; transform-origin:top left; box-shadow:none; min-height:297mm; }
      .upcv-tplname { font-size:12px; color:var(--dsw-alias-label-primary); }
      .upcv-order-side { font-size:11px; color:var(--dsw-alias-label-tertiary); margin:6px 0 4px; }
      .upcv-order-row { display:flex; align-items:center; gap:6px; padding:3px 0; }
      .upcv-order-name { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; }
      .upcv-order-detail { flex:none; font-size:11px; color:var(--dsw-alias-label-tertiary); }
      .upcv-opt-row { display:flex; gap:10px; align-items:flex-start; margin-bottom:10px; }
      .upcv-opt-label { flex:none; width:76px; font-size:12px; color:var(--dsw-alias-label-tertiary); padding-top:5px; }
      .upcv-opt-items { flex:1; min-width:0; display:flex; flex-wrap:wrap; gap:4px; align-items:center; }
      .upcv-opt-items .upcv-input-sm { flex:1; min-width:80px; }
      .upcv-swatch { width:22px; height:22px; border-radius:50%; border:2px solid transparent; cursor:pointer; padding:0; box-shadow:inset 0 0 0 1px var(--dsw-alias-border-l4); }
      .upcv-swatch.on { border-color:var(--dsw-alias-brand-primary); box-shadow:0 0 0 2px color-mix(in srgb, var(--dsw-alias-brand-primary) 35%, transparent); }
      .upcv-field { display:flex; flex-direction:column; gap:3px; margin-bottom:6px; }
      .upcv-field-label { font-size:11px; color:var(--dsw-alias-label-tertiary); }
      .upcv-editor { display:flex; flex-direction:column; height:100%; min-height:0; }
      .upcv-editor-bar { display:flex; align-items:center; gap:10px; padding:10px 16px; border-bottom:1px solid var(--dsw-alias-border-l2); background:var(--dsw-alias-bg-layer-2); flex-wrap:wrap; }
      .upcv-editor-body { display:flex; flex:1; min-height:0; overflow:hidden; }
      .upcv-editor-form { flex:1 1 46%; min-width:0; overflow-y:auto; padding:14px 16px; border-right:1px solid var(--dsw-alias-border-l2); }
      .upcv-editor-preview { flex:1 1 54%; min-width:0; overflow:auto; padding:18px; background:var(--dsw-alias-bg-layer-1); display:block; }
      .upcv-page-wrap { margin:0 auto; width:210mm; }
      .upcv-pages { position:relative; display:flex; flex-direction:column; align-items:center; gap:16px; }
      /* 量测层：绝对定位、不可见、不参与交互，也不撑出滚动条 */
      .upcv-measure { position:absolute; top:0; left:0; visibility:hidden; pointer-events:none; z-index:-1; }
      .upcv-measure .rr-sheet { min-height:0; }
      .upcv-page { display:block; }
      .upcv-page > .rr-sheet { box-shadow:0 4px 24px rgba(0,0,0,0.14); }
      .rr-sheet[data-overflow='1'] { outline:2px dashed #dc2626; outline-offset:-2px; }
      @media (max-width: 1100px) { .upcv-editor-body { flex-direction:column; } .upcv-editor-form { flex:none; border-right:none; border-bottom:1px solid var(--dsw-alias-border-l2); max-height:50%; } .upcv-editor-preview { flex:none; } }
      .upcv-panel-error { padding:20px; font-size:13px; line-height:1.7; color:var(--dsw-alias-label-primary); overflow:auto; }
      .upcv-panel-error pre { white-space:pre-wrap; word-break:break-word; font-size:11px; background:var(--dsw-alias-bg-layer-1); padding:12px; border-radius:8px; }
      /* 宿主的 label-tertiary 在浅色下只有 3.71:1，不足 AA；正文级灰字统一提到 label-secondary */
      .upcv-muted { color:var(--dsw-alias-label-secondary); }
      .upcv-chip.on { background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); color:var(--dsw-alias-brand-primary); font-weight:600; }
      .upcv-chip.miss { background:color-mix(in srgb, var(--upcv-warn) 16%, transparent); color:var(--upcv-warn); font-weight:600; }
      .upcv-card-title { font-size:14px; font-weight:700; margin:0 0 10px; }
      .upcv-req { padding:10px 0; border-top:1px solid var(--dsw-alias-border-l4); }
      .upcv-req:first-of-type { border-top:none; }
      .upcv-req-head { display:flex; align-items:flex-start; gap:8px; }
      .upcv-req-mark { flex:none; width:16px; font-weight:800; }
      .upcv-req-mark.ok { color:var(--dsw-alias-state-success-primary, #16a34a); }
      .upcv-req-mark.miss { color:var(--upcv-danger-ink); }
      .upcv-req-text { flex:1; font-size:13px; line-height:1.6; min-width:0; }
      .upcv-req-note { font-size:12px; line-height:1.6; margin:6px 0 0; color:var(--dsw-alias-label-tertiary); }
      .upcv-req-note.miss { color:var(--dsw-alias-state-warn-label, #b45309); }
      .upcv-hist { display:flex; align-items:center; gap:8px; padding:8px 0; border-top:1px solid var(--dsw-alias-border-l4); }
      .upcv-hist:first-of-type { border-top:none; }
      .upcv-hist-title { font-size:13px; font-weight:600; }
      .upcv-mini { flex:none; border:1px solid var(--dsw-alias-border-l4); background:var(--dsw-alias-bg-layer-3); color:var(--dsw-alias-label-primary); border-radius:6px; padding:4px 10px; font-size:12px; cursor:pointer; }
      .upcv-mini:hover { color:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); }
      .upcv-mini.on { color:var(--dsw-alias-brand-primary); border-color:var(--dsw-alias-brand-primary); background:color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent); font-weight:600; }

      /* =========================================================================
       * 第 3 层：插件令牌 + 共享组件 + 无障碍（追加式覆盖，可整层回滚）
       *
       * 纪律：
       *  - 令牌值全部【派生自】宿主 --dsw-alias-*，绝不覆盖宿主语义色；
       *  - 先建立灰度层级（表面/描边/间距/字号），颜色只作强化；
       *  - .upcv-header 只改 padding-block / padding-inline-end，
       *    绝不用 padding 简写——宿主靠 padding-inline-start 注入红绿灯净空。
       * ====================================================================== */
      .upcv-app {
        --upcv-1:4px; --upcv-2:8px; --upcv-3:12px; --upcv-4:16px; --upcv-5:24px; --upcv-6:32px; --upcv-7:48px;
        --upcv-t-xs:11px; --upcv-t-sm:12px; --upcv-t-md:13px; --upcv-t-base:14px; --upcv-t-lg:16px; --upcv-t-xl:20px; --upcv-t-2xl:28px; --upcv-t-3xl:38px;
        --upcv-r-sm:6px; --upcv-r-md:10px; --upcv-r-lg:14px; --upcv-r-pill:999px;
        --upcv-elev-1:0 1px 2px rgba(15,23,42,.05);
        --upcv-elev-2:0 2px 4px rgba(15,23,42,.05), 0 12px 28px -12px rgba(15,23,42,.20);
        --upcv-ring:0 0 0 3px color-mix(in srgb, var(--dsw-alias-brand-primary) 32%, transparent);
        --upcv-surface:var(--dsw-alias-bg-layer-3);
        --upcv-sunken:var(--dsw-alias-bg-layer-1);
        --upcv-line:var(--dsw-alias-border-l4);
        --upcv-line-soft:var(--dsw-alias-border-l2);
        --upcv-ink:var(--dsw-alias-label-primary);
        --upcv-ink-2:var(--dsw-alias-label-secondary);
        /* 宿主的 label-tertiary 在浅色下只有 3.71:1，达不到 AA（正文需 4.5:1）。
           所以 "第三级文字" 直接映射到达标的 label-secondary；
           真正只作装饰的图标/分隔符用 --upcv-ink-faint。 */
        --upcv-ink-3:var(--dsw-alias-label-secondary);
        --upcv-ink-faint:var(--dsw-alias-label-tertiary);
        --upcv-accent:var(--dsw-alias-brand-primary);
        --upcv-danger:var(--dsw-alias-state-error-primary, #dc2626);
        --upcv-danger-ink:color-mix(in srgb, var(--upcv-danger) 78%, var(--upcv-ink));
        --upcv-warn:var(--dsw-alias-state-warn-label, #b45309);
        --upcv-ok:var(--dsw-alias-state-success-primary, #16a34a);
        --upcv-control-h:34px;
        --upcv-container:960px;
        /* 数据密集页（岗位）独立容器：跟随内容区全宽，保留令牌便于日后统一调整 */
        --upcv-container-data:none;
      }

      /* ---- 图标 ---- */
      .upcv-icon { flex:none; width:16px; height:16px; display:block; }
      .upcv-icon * { vector-effect:non-scaling-stroke; }

      /* ---- 焦点与动效偏好（全站统一）---- */
      .upcv-app :focus-visible { outline:2px solid var(--upcv-accent); outline-offset:2px; }
      .upcv-input:focus, .upcv-input:focus-visible { outline:none; border-color:var(--upcv-accent); box-shadow:var(--upcv-ring); }
      @media (prefers-reduced-motion: reduce) {
        .upcv-app *, .upcv-app *::before, .upcv-app *::after {
          animation-duration:.001ms !important; animation-iteration-count:1 !important;
          transition-duration:.001ms !important; scroll-behavior:auto !important;
        }
      }

      /* ---- 页面骨架与容器 ---- */
      .upcv-page { max-width:var(--upcv-container); padding:var(--upcv-5) var(--upcv-5) var(--upcv-7); }
      .upcv-page-head { display:flex; flex-direction:column; gap:var(--upcv-1); margin-bottom:var(--upcv-4); }
      .upcv-page-title { font-size:var(--upcv-t-xl); font-weight:700; letter-spacing:-.01em; line-height:1.3; margin:0; color:var(--upcv-ink); }
      .upcv-page-desc { font-size:var(--upcv-t-md); line-height:1.7; color:var(--upcv-ink-2); margin:0; max-width:62ch; }
      .upcv-back { display:inline-flex; align-items:center; gap:6px; padding:4px 10px 4px 6px; margin:0 0 var(--upcv-3); border:0; border-radius:var(--upcv-r-sm); background:transparent; color:var(--upcv-ink-2); font-size:var(--upcv-t-md); font-weight:500; cursor:pointer; transition:background .15s, color .15s; }
      .upcv-back:hover { background:var(--upcv-sunken); color:var(--upcv-ink); }
      .upcv-actions { display:flex; flex-wrap:wrap; align-items:center; gap:var(--upcv-2); }
      .upcv-actions-block { margin-bottom:var(--upcv-4); }

      /* ---- 按钮三档 ---- */
      .upcv-btn { min-height:var(--upcv-control-h); padding:0 var(--upcv-4); border-radius:var(--upcv-r-sm); font-size:var(--upcv-t-base); gap:6px; transition:background .15s, border-color .15s, color .15s, box-shadow .15s, opacity .15s; }
      .upcv-btn-sm { min-height:30px; padding:0 var(--upcv-3); font-size:var(--upcv-t-md); }
      .upcv-btn-lg { min-height:42px; padding:0 var(--upcv-5); font-weight:600; }
      .upcv-btn-primary { box-shadow:var(--upcv-elev-1); }
      .upcv-btn-secondary { background:var(--upcv-surface); }
      .upcv-btn-secondary:hover { border-color:var(--upcv-accent); color:var(--upcv-accent); }
      .upcv-btn-ghost { background:transparent; border:1px solid transparent; color:var(--upcv-ink-2); }
      .upcv-btn-ghost:hover { background:var(--upcv-sunken); color:var(--upcv-ink); }

      /* ---- 小按钮：修 P0 后补齐可点面积与层级 ---- */
      .upcv-mini { display:inline-flex; align-items:center; justify-content:center; gap:4px; min-height:28px; padding:0 10px; border-radius:var(--upcv-r-sm); font-size:var(--upcv-t-sm); font-weight:500; transition:color .15s, border-color .15s, background .15s; }
      .upcv-mini.danger { color:var(--upcv-danger-ink); }
      .upcv-mini.danger:hover { color:var(--upcv-danger-ink); border-color:var(--upcv-danger-ink); background:transparent; }

      /* ---- 胶囊：补齐 on / miss 变体，替掉 6 处内联补丁 ---- */
      .upcv-chip { display:inline-flex; align-items:center; gap:4px; height:24px; padding:0 10px; margin:0 6px 6px 0; border:1px solid transparent; border-radius:var(--upcv-r-pill); font-size:var(--upcv-t-xs); font-weight:500; background:var(--upcv-sunken); color:var(--upcv-ink-3); transition:background .15s, color .15s, border-color .15s; }
      button.upcv-chip { cursor:pointer; }
      .upcv-chip:hover { border-color:var(--upcv-line); color:var(--upcv-ink-2); }
      .upcv-chip.on { background:color-mix(in srgb, var(--upcv-accent) 14%, transparent); color:var(--upcv-accent); font-weight:600; }
      .upcv-chip.miss { background:color-mix(in srgb, var(--upcv-warn) 16%, transparent); color:var(--upcv-warn); font-weight:600; }

      /* ---- 状态胶囊（来源 / 标记）---- */
      .upcv-pill { display:inline-flex; align-items:center; gap:4px; flex:none; height:22px; padding:0 9px; border-radius:var(--upcv-r-pill); font-size:var(--upcv-t-xs); font-weight:600; background:var(--upcv-sunken); color:var(--upcv-ink-3); }
      .upcv-pill.accent { background:color-mix(in srgb, var(--upcv-accent) 14%, transparent); color:var(--upcv-accent); }

      /* ---- 卡片与区块 ---- */
      .upcv-card { border-radius:var(--upcv-r-lg); padding:var(--upcv-4); margin-bottom:var(--upcv-3); border:1px solid var(--upcv-line-soft); box-shadow:var(--upcv-elev-1); transition:border-color .15s, box-shadow .15s; }
      .upcv-card-title { display:flex; align-items:center; gap:6px; font-size:var(--upcv-t-base); font-weight:700; margin:0 0 var(--upcv-3); }

      /* ---- 提示条：图标 + 文案，颜色不单独承载语义 ---- */
      .upcv-notice, .upcv-error { align-items:flex-start; gap:var(--upcv-2); padding:10px 12px; border:1px solid transparent; border-radius:var(--upcv-r-md); font-size:var(--upcv-t-md); line-height:1.65; }
      .upcv-notice { border-color:color-mix(in srgb, var(--upcv-accent) 22%, transparent); }
      .upcv-error { border-color:color-mix(in srgb, var(--upcv-danger) 26%, transparent); }

      /* ---- 空状态 ---- */
      .upcv-empty { display:flex; flex-direction:column; align-items:center; text-align:center; gap:var(--upcv-2); padding:var(--upcv-6) var(--upcv-5); border:1px dashed var(--upcv-line); border-radius:var(--upcv-r-lg); background:var(--upcv-sunken); }
      .upcv-empty-icon { display:flex; align-items:center; justify-content:center; width:48px; height:48px; margin-bottom:var(--upcv-1); border-radius:var(--upcv-r-md); background:color-mix(in srgb, var(--upcv-accent) 12%, transparent); color:var(--upcv-accent); }
      .upcv-empty-title { font-size:var(--upcv-t-lg); font-weight:700; letter-spacing:-.01em; }
      .upcv-empty-desc { max-width:48ch; margin:0; font-size:var(--upcv-t-md); line-height:1.75; color:var(--upcv-ink-3); }
      .upcv-empty-actions { display:flex; flex-wrap:wrap; justify-content:center; gap:var(--upcv-2); margin-top:var(--upcv-2); }

      /* ---- 加载骨架 ---- */
      .upcv-skeleton { position:relative; overflow:hidden; border-radius:var(--upcv-r-sm); background:var(--upcv-sunken); }
      .upcv-skeleton::after { content:''; position:absolute; inset:0; background:linear-gradient(90deg, transparent, color-mix(in srgb, var(--upcv-ink-3) 14%, transparent), transparent); animation:upcv-shimmer 1.4s ease-in-out infinite; }
      @keyframes upcv-shimmer { from { transform:translateX(-100%); } to { transform:translateX(100%); } }

      /* ---- 顶栏：只改 block / inline-end，保留宿主的 inline-start 净空 ---- */
      .upcv-header { padding-block:var(--upcv-3); padding-inline-end:var(--upcv-5); gap:var(--upcv-3); }
      .upcv-header-brand { font-size:var(--upcv-t-base); }
      .upcv-header-meta { display:flex; align-items:center; gap:var(--upcv-2); font-size:var(--upcv-t-sm); color:var(--upcv-ink-3); }
      .upcv-header-logo { width:26px; height:26px; border-radius:var(--upcv-r-sm); }

      /* ---- 首页 ---- */
      .upcv-home { max-width:var(--upcv-container); margin:0 auto; padding:0 var(--upcv-5) var(--upcv-7); }
      .upcv-hero { padding:var(--upcv-7) 0 var(--upcv-6); text-align:center; }
      .upcv-eyebrow { display:inline-flex; align-items:center; gap:6px; height:24px; padding:0 10px; margin-bottom:var(--upcv-4); border-radius:var(--upcv-r-pill); background:color-mix(in srgb, var(--upcv-accent) 12%, transparent); color:var(--upcv-accent); font-size:var(--upcv-t-xs); font-weight:600; letter-spacing:.02em; }
      .upcv-hero h1 { font-size:var(--upcv-t-3xl); font-weight:800; line-height:1.15; letter-spacing:-.025em; margin:0 0 var(--upcv-3); }
      .upcv-hero p { max-width:44ch; margin:0 auto var(--upcv-5); font-size:var(--upcv-t-lg); line-height:1.6; color:var(--upcv-ink-2); }
      .upcv-features { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:var(--upcv-3); }
      @media (max-width:720px) { .upcv-features { grid-template-columns:minmax(0, 1fr); } }
      .upcv-feature { display:flex; align-items:flex-start; gap:var(--upcv-3); padding:var(--upcv-4); text-align:left; font:inherit; color:inherit; cursor:pointer; border:1px solid var(--upcv-line-soft); border-radius:var(--upcv-r-lg); background:var(--upcv-surface); transition:border-color .15s, box-shadow .15s, transform .15s; }
      .upcv-feature:hover { border-color:color-mix(in srgb, var(--upcv-accent) 45%, var(--upcv-line)); box-shadow:var(--upcv-elev-2); transform:translateY(-2px); }
      .upcv-feature-icon { display:flex; align-items:center; justify-content:center; flex:none; width:40px; height:40px; border-radius:var(--upcv-r-md); background:color-mix(in srgb, var(--upcv-accent) 12%, transparent); color:var(--upcv-accent); }
      .upcv-feature-icon .upcv-icon { width:20px; height:20px; }
      .upcv-feature-body { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
      .upcv-feature h3 { font-size:var(--upcv-t-base); font-weight:700; margin:0; }
      .upcv-feature p { margin:0; font-size:var(--upcv-t-md); line-height:1.6; color:var(--upcv-ink-3); }
      .upcv-feature-arrow { flex:none; align-self:center; color:var(--upcv-ink-3); opacity:0; transform:translateX(-4px); transition:opacity .15s, transform .15s; }
      .upcv-feature:hover .upcv-feature-arrow { opacity:1; transform:translateX(0); }

      /* ---- 简历列表 ---- */
      .upcv-resume-card { display:flex; flex-direction:column; gap:var(--upcv-3); }
      .upcv-resume-head { display:flex; align-items:flex-start; gap:var(--upcv-3); }
      .upcv-resume-main { flex:1; min-width:0; display:flex; flex-direction:column; gap:4px; }
      .upcv-resume-name { margin:0; font-size:var(--upcv-t-lg); font-weight:700; letter-spacing:-.01em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .upcv-resume-meta { display:flex; flex-wrap:wrap; align-items:center; gap:var(--upcv-2); font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); }
      .upcv-resume-actions { display:flex; flex-wrap:wrap; align-items:center; gap:var(--upcv-2); padding-top:var(--upcv-3); border-top:1px solid var(--upcv-line-soft); }
      .upcv-resume-actions .upcv-mini.danger { margin-left:auto; }

      /* ---- 岗位真实检索（0.12.0：检索指令 → 收件箱 → 本地筛选 → 直链投递）---- */
      .upcv-cmd { display:flex; flex-direction:column; gap:var(--upcv-2); padding:var(--upcv-3); border:1px dashed var(--upcv-line); border-radius:var(--upcv-r-md); background:var(--upcv-sunken); margin-bottom:var(--upcv-3); }
      .upcv-cmd-fields { display:flex; flex-wrap:wrap; gap:var(--upcv-2); }
      .upcv-cmd-fields .upcv-input-sm { width:150px; }
      .upcv-cmd-line { display:flex; align-items:center; gap:var(--upcv-2); min-width:0; }
      .upcv-cmd-line code { flex:1; min-width:0; overflow-x:auto; white-space:nowrap; padding:7px 10px; border:1px solid var(--upcv-line-soft); border-radius:var(--upcv-r-sm); background:var(--upcv-surface); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:var(--upcv-t-md); color:var(--upcv-ink); }
      .upcv-hint { font-size:var(--upcv-t-sm); line-height:1.65; color:var(--upcv-ink-3); margin:0; }
      .upcv-filter-bar { display:flex; flex-wrap:wrap; align-items:center; gap:var(--upcv-2); margin-bottom:var(--upcv-3); }
      .upcv-filter-bar .upcv-input-sm { width:auto; min-width:110px; }
      .upcv-filter-count { flex:none; margin-left:auto; font-size:var(--upcv-t-sm); color:var(--upcv-ink-3); }
      .upcv-job-card { display:flex; flex-direction:column; gap:var(--upcv-3); }
      .upcv-job-head { display:flex; align-items:flex-start; gap:var(--upcv-3); }
      .upcv-job-main { flex:1; min-width:0; }
      .upcv-job-title { margin:0; font-size:var(--upcv-t-lg); font-weight:700; letter-spacing:-.01em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .upcv-job-title a { color:inherit; text-decoration:none; }
      .upcv-job-title a:hover { color:var(--upcv-accent); text-decoration:underline; }
      .upcv-job-meta { display:flex; flex-wrap:wrap; align-items:center; gap:var(--upcv-2); margin-top:4px; font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); }
      .upcv-job-salary { font-weight:600; color:var(--upcv-ink); }
      .upcv-job-actions { display:flex; flex-wrap:wrap; gap:var(--upcv-2); padding-top:var(--upcv-3); border-top:1px solid var(--upcv-line-soft); }
      .upcv-fold { display:flex; align-items:center; gap:var(--upcv-2); width:100%; margin:var(--upcv-6) 0 var(--upcv-3); padding:var(--upcv-3); border:1px solid var(--upcv-line-soft); border-radius:var(--upcv-r-md); background:var(--upcv-surface); color:var(--upcv-ink-2); font:inherit; font-size:var(--upcv-t-base); font-weight:600; cursor:pointer; transition:border-color .15s, color .15s; }
      .upcv-fold:hover { color:var(--upcv-ink); border-color:var(--upcv-line); }
      .upcv-fold-title { flex:1; min-width:0; text-align:left; }
      .upcv-fold-hint { flex:none; font-size:var(--upcv-t-xs); font-weight:500; color:var(--upcv-ink-3); }

      /* =========================================================================
       * 模拟面试 v2（0.13.0）：题源三选一 / 逐题判定 / 错题本 / 薄弱点聚合
       * 追加式第 3 层，全部派生自上方令牌。
       * ====================================================================== */
      /* ---- 首页第 5 张功能卡占满整行（避免 2×2 网格出现孤儿卡）---- */

      /* ---- 题源三选一卡片 ---- */
      .upcv-src-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:var(--upcv-2); margin-bottom:var(--upcv-3); }
      @media (max-width:720px) { .upcv-src-grid { grid-template-columns:minmax(0, 1fr); } }
      .upcv-src { display:flex; flex-direction:column; gap:4px; padding:var(--upcv-3); text-align:left; font:inherit; color:inherit; border:1px solid var(--upcv-line-soft); border-radius:var(--upcv-r-md); background:var(--upcv-surface); cursor:pointer; transition:border-color .15s, box-shadow .15s; }
      .upcv-src:hover:not(:disabled) { border-color:color-mix(in srgb, var(--upcv-accent) 45%, var(--upcv-line)); }
      .upcv-src.on { border-color:var(--upcv-accent); box-shadow:0 0 0 1px var(--upcv-accent); }
      .upcv-src:disabled { opacity:.55; cursor:not-allowed; }
      .upcv-src-title { display:inline-flex; align-items:center; gap:6px; font-size:var(--upcv-t-base); font-weight:700; }
      .upcv-src-desc { font-size:var(--upcv-t-sm); line-height:1.6; color:var(--upcv-ink-3); }

      /* ---- 判定面板（自判 / AI 判定 / 改判）---- */
      .upcv-verdict { border:1px solid var(--upcv-line-soft); border-left:3px solid var(--upcv-accent); border-radius:var(--upcv-r-md); padding:var(--upcv-3); margin:var(--upcv-3) 0; background:var(--upcv-sunken); }
      .upcv-verdict-head { display:flex; align-items:baseline; gap:var(--upcv-2); margin-bottom:var(--upcv-2); flex-wrap:wrap; }
      .upcv-verdict-mark { font-size:var(--upcv-t-xl); font-weight:800; line-height:1; }
      .upcv-verdict-mark.pass { color:var(--upcv-ok); }
      .upcv-verdict-mark.partial { color:var(--upcv-warn); }
      .upcv-verdict-mark.fail { color:var(--upcv-danger-ink); }
      .upcv-verdict-points { margin:0; padding-left:18px; font-size:var(--upcv-t-md); line-height:1.7; color:var(--upcv-ink-2); }

      /* ---- 错题本列表 ---- */
      .upcv-mistake-item { border:1px solid var(--upcv-line-soft); border-radius:var(--upcv-r-md); background:var(--upcv-surface); margin-bottom:var(--upcv-2); overflow:hidden; }
      .upcv-mistake-head { display:flex; align-items:center; gap:var(--upcv-2); width:100%; padding:var(--upcv-3); text-align:left; font:inherit; color:inherit; background:transparent; border:0; cursor:pointer; transition:background .15s; }
      .upcv-mistake-head:hover { background:var(--upcv-sunken); }
      .upcv-mistake-q { flex:1; min-width:0; font-size:var(--upcv-t-base); font-weight:600; line-height:1.6; }
      .upcv-mistake-body { padding:0 var(--upcv-3) var(--upcv-3); border-top:1px solid var(--upcv-line-soft); }
      .upcv-kv { font-size:var(--upcv-t-md); line-height:1.7; margin:var(--upcv-2) 0 0; }
      .upcv-kv b { font-weight:600; color:var(--upcv-ink-3); }
      .upcv-hist-line { font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); padding:2px 0; }

      /* ---- 报告：薄弱知识点条 ---- */
      .upcv-weak-row { display:flex; align-items:center; gap:var(--upcv-2); font-size:var(--upcv-t-md); margin-bottom:var(--upcv-2); }
      .upcv-weak-tag { flex:none; width:9em; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
      .upcv-weak-bar { flex:1; height:6px; border-radius:var(--upcv-r-pill); background:var(--upcv-sunken); overflow:hidden; }
      .upcv-weak-bar span { display:block; height:100%; background:var(--upcv-warn); }

      /* ==========================================================================
       * 岗位 Phase 2.5（0.14.0）：容器拉满 / 检索条单行 / 吸顶筛选 / 紧凑行列表
       * 布局依据 .ui-review/jobs-layout-proposal.html；颜色全部派生自宿主 --dsw-alias-*。
       * ======================================================================== */
      /* ---- 页头：标题 + 数据截至 + 整理（次）/ 查询（主）---- */
      /* flex column 里 margin:auto 会让子项收缩成内容宽（宽屏不拉满），所以显式 width:100%；
         box-sizing:border-box 保证左右 padding 不再撑出横向溢出。*/
      .upcv-page-jobs { max-width:var(--upcv-container-data); width:100%; box-sizing:border-box; padding:var(--upcv-4) var(--upcv-5) var(--upcv-6); }
      .upcv-jobs-head { display:flex; align-items:center; gap:var(--upcv-3); flex-wrap:wrap; }
      .upcv-jobs-head-main { display:flex; align-items:center; gap:var(--upcv-3); min-width:0; }
      .upcv-jobs-head .upcv-page-title { font-size:var(--upcv-t-xl); }
      .upcv-jobs-head-actions { display:flex; align-items:center; gap:var(--upcv-2); margin-left:auto; }

      /* ---- 检索条：始终单行；城市不在界面输入 ---- */
      .upcv-jobs-search { display:flex; align-items:center; gap:var(--upcv-2); margin-top:var(--upcv-4); padding:10px 12px; border:1px solid var(--upcv-line-soft); border-radius:var(--upcv-r-md); background:var(--upcv-surface); box-shadow:var(--upcv-elev-1); }
      .upcv-jobs-field { display:inline-flex; align-items:center; gap:var(--upcv-2); flex:none; font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); white-space:nowrap; }
      .upcv-jobs-kw { width:180px; flex:none; }
      .upcv-jobs-cmd { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; padding:7px 10px; border:1px dashed var(--upcv-line); border-radius:var(--upcv-r-sm); background:var(--upcv-sunken); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); }
      .upcv-jobs-copy { flex:none; padding:0 10px; }
      .upcv-jobs-copied { flex:none; font-size:var(--upcv-t-xs); color:var(--upcv-ok); font-weight:600; }
      /* 一行小字：上次查询 / 检索中 / 失败 / 未安装 / 城市来源 */
      .upcv-jobs-lastline { display:flex; flex-wrap:wrap; align-items:center; gap:var(--upcv-2); margin:var(--upcv-2) 2px var(--upcv-3); font-size:var(--upcv-t-sm); line-height:1.6; color:var(--upcv-ink-2); }
      .upcv-jobs-lastline .upcv-jobs-ok { color:var(--upcv-ok); font-weight:600; }
      .upcv-jobs-lastline .upcv-jobs-err { color:var(--upcv-danger-ink); font-weight:600; }
      .upcv-jobs-lastline code { padding:1px 5px; border-radius:4px; background:var(--upcv-sunken); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:var(--upcv-t-xs); }
      .upcv-jobs-stats { margin-bottom:var(--upcv-2); }
      .upcv-jobs-cmdblock { display:inline-block; margin-top:var(--upcv-2); padding:7px 12px; border:1px solid var(--upcv-line); border-radius:var(--upcv-r-sm); background:var(--upcv-sunken); font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:var(--upcv-t-sm); color:var(--upcv-ink); }

      /* ---- 吸顶筛选栏（宿主 header 51px，滚过它再吸顶）---- */
      .upcv-jobs-filterbar { position:sticky; top:calc(var(--upcv-3) * 2 + 26px + 1px); z-index:2; display:flex; align-items:center; gap:var(--upcv-2); flex-wrap:wrap; padding:var(--upcv-2) 0; margin-bottom:var(--upcv-2); background:var(--upcv-sunken); border-bottom:1px solid var(--upcv-line-soft); }
      .upcv-jobs-fgroup { display:flex; align-items:center; gap:var(--upcv-2); flex-wrap:wrap; min-width:0; }
      .upcv-jobs-flabel { flex:none; font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); }
      .upcv-jobs-filterkw { width:200px; }
      .upcv-jobs-floor { width:auto; min-width:86px; flex:none; }
      .upcv-jobs-filterbar .upcv-chip { margin:0; height:26px; }
      .upcv-jobs-count { margin-left:auto; flex:none; font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); }

      /* ---- 紧凑行：职位/公司 · 薪资 · 城市 · 来源 · 收录时间 · 状态三按钮 · 定制 · 直链 ---- */
      .upcv-jobrow { display:grid; grid-template-columns:minmax(220px, 1fr) 150px 56px 80px 96px 168px auto auto; gap:var(--upcv-3); align-items:center; padding:10px 12px; border-bottom:1px solid var(--upcv-line-soft); transition:background .15s; }
      .upcv-jobrow:hover { background:var(--upcv-surface); border-radius:var(--upcv-r-sm); }
      .upcv-jobrow.is-dim { opacity:.5; }
      .upcv-jobrow-main { min-width:0; display:flex; flex-direction:column; gap:2px; }
      .upcv-jobrow-title { font-size:var(--upcv-t-md); font-weight:600; color:var(--upcv-ink); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .upcv-jobrow-company { font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .upcv-jobrow-salary { font-size:var(--upcv-t-md); font-weight:600; color:var(--upcv-ink); }
      .upcv-jobrow-salary small { display:block; font-size:var(--upcv-t-xs); font-weight:400; color:var(--upcv-ink-2); }
      .upcv-jobrow-city, .upcv-jobrow-time { font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); white-space:nowrap; }
      .upcv-jobrow-src { display:inline-flex; align-items:center; justify-content:center; gap:5px; height:22px; padding:0 9px; border-radius:var(--upcv-r-pill); font-size:var(--upcv-t-xs); font-weight:600; white-space:nowrap; background:var(--upcv-sunken); color:var(--upcv-ink-2); }
      .upcv-jobrow-src::before { content:''; width:5px; height:5px; border-radius:50%; background:currentColor; }
      .upcv-jobrow-src.is-shixiseng { background:color-mix(in srgb, var(--upcv-accent) 13%, transparent); color:var(--upcv-accent); }
      .upcv-jobrow-src.is-liepin { background:color-mix(in srgb, var(--upcv-warn) 14%, transparent); color:var(--upcv-warn); }
      .upcv-jobrow-seg { display:inline-flex; width:168px; border:1px solid var(--upcv-line); border-radius:var(--upcv-r-sm); overflow:hidden; }
      .upcv-jobrow-seg button { flex:1; min-height:28px; padding:0 4px; border:0; border-right:1px solid var(--upcv-line-soft); background:var(--upcv-surface); color:var(--upcv-ink-2); font:inherit; font-size:var(--upcv-t-xs); white-space:nowrap; cursor:pointer; transition:background .15s, color .15s; }
      .upcv-jobrow-seg button:last-child { border-right:0; }
      .upcv-jobrow-seg button:hover { color:var(--upcv-ink); }
      .upcv-jobrow-seg button:focus-visible { outline-offset:-2px; }
      .upcv-jobrow-seg .is-new[aria-pressed='true'] { background:color-mix(in srgb, var(--upcv-accent) 14%, transparent); color:var(--upcv-accent); font-weight:600; }
      .upcv-jobrow-seg .is-applied[aria-pressed='true'] { background:color-mix(in srgb, var(--upcv-ok) 16%, transparent); color:var(--upcv-ok); font-weight:600; }
      .upcv-jobrow-seg .is-dismissed[aria-pressed='true'] { background:var(--upcv-sunken); color:var(--upcv-ink-2); font-weight:600; }
      .upcv-jobrow-custom { display:inline-flex; align-items:center; justify-content:center; gap:5px; min-height:28px; padding:0 10px; border:1px solid var(--upcv-line); border-radius:var(--upcv-r-sm); background:var(--upcv-surface); color:var(--upcv-ink-2); font:inherit; font-size:var(--upcv-t-sm); white-space:nowrap; cursor:pointer; transition:color .15s, border-color .15s; }
      .upcv-jobrow-custom .upcv-icon { width:14px; height:14px; }
      .upcv-jobrow-custom:hover { color:var(--upcv-accent); border-color:color-mix(in srgb, var(--upcv-accent) 45%, var(--upcv-line)); }
      .upcv-jobrow-link { display:inline-flex; align-items:center; justify-content:center; width:30px; height:28px; border:1px solid var(--upcv-line); border-radius:var(--upcv-r-sm); background:var(--upcv-surface); color:var(--upcv-ink-2); }
      .upcv-jobrow-link.is-disabled { opacity:.45; cursor:not-allowed; }
      .upcv-jobrow-link:hover { color:var(--upcv-accent); border-color:color-mix(in srgb, var(--upcv-accent) 45%, var(--upcv-line)); }
      .upcv-jobs-list { margin-top:var(--upcv-1); }

      /* ---- 检索源弹窗：登录状态 + 检查/登录 ---- */
      .upcv-modal-mask { position:fixed; inset:0; z-index:60; display:flex; align-items:center; justify-content:center; padding:var(--upcv-4); background:color-mix(in srgb, #000 42%, transparent); }
      .upcv-modal { width:min(720px, 100%); max-height:82vh; overflow:auto; background:var(--upcv-surface); border:1px solid var(--upcv-line); border-radius:var(--upcv-r-lg); box-shadow:var(--upcv-elev-2); padding:var(--upcv-4); }
      .upcv-modal-head { display:flex; align-items:center; gap:var(--upcv-2); margin-bottom:var(--upcv-2); }
      .upcv-modal-head h3 { margin:0; font-size:var(--upcv-t-lg); }
      .upcv-modal-close { margin-left:auto; display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border:1px solid var(--upcv-line); border-radius:var(--upcv-r-sm); background:var(--upcv-surface); color:var(--upcv-ink-2); cursor:pointer; }
      .upcv-modal-close:hover { color:var(--upcv-ink); }
      .upcv-sources { display:flex; flex-direction:column; gap:var(--upcv-2); margin-top:var(--upcv-3); }
      .upcv-source-row { display:flex; align-items:center; gap:var(--upcv-3); padding:10px 12px; border:1px solid var(--upcv-line-soft); border-radius:var(--upcv-r-md); background:var(--upcv-sunken); }
      .upcv-source-main { display:flex; flex-direction:column; gap:2px; min-width:0; flex:1; }
      .upcv-source-entry { font-size:var(--upcv-t-xs); color:var(--upcv-ink-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
      .upcv-source-note { font-size:var(--upcv-t-xs); color:var(--upcv-ink-3); }
      .upcv-source-state { flex:none; font-size:var(--upcv-t-xs); font-weight:600; padding:3px 9px; border-radius:var(--upcv-r-pill); background:var(--upcv-surface); border:1px solid var(--upcv-line); color:var(--upcv-ink-2); }
      .upcv-source-state.is-ok { color:var(--upcv-ok); border-color:color-mix(in srgb, var(--upcv-ok) 40%, var(--upcv-line)); }
      .upcv-source-state.is-expired { color:var(--upcv-danger-ink); border-color:color-mix(in srgb, var(--upcv-danger) 40%, var(--upcv-line)); }
      .upcv-source-state.is-unknown { color:var(--upcv-warn); border-color:color-mix(in srgb, var(--upcv-warn) 40%, var(--upcv-line)); }
      .upcv-source-actions { flex:none; display:flex; align-items:center; gap:var(--upcv-2); }
      .upcv-modal-foot { display:flex; align-items:center; gap:var(--upcv-2); margin-top:var(--upcv-3); padding-top:var(--upcv-3); border-top:1px solid var(--upcv-line-soft); }

      /* ---- 窄容器回落：先隐藏次要列，再让行折成两排，绝不横向溢出 ---- */
      @media (max-width:1080px) {
        .upcv-jobrow { grid-template-columns:minmax(0, 1fr) 120px 88px 168px auto auto; }
        .upcv-jobrow-city, .upcv-jobrow-time { display:none; }
        .upcv-jobs-kw { width:140px; }
        .upcv-jobs-filterkw { width:160px; }
      }
      @media (max-width:720px) {
        .upcv-jobs-search { flex-wrap:wrap; }
        .upcv-jobs-cmd { order:3; flex-basis:100%; }
        .upcv-jobs-kw { width:100%; min-width:0; }
        .upcv-jobs-field { flex:1 1 auto; min-width:0; }
        .upcv-jobs-filterkw { width:100%; }
        .upcv-jobs-filterbar .upcv-jobs-count { margin-left:0; }
        .upcv-jobrow { display:flex; flex-wrap:wrap; row-gap:var(--upcv-2); }
        .upcv-jobrow-main { flex:1 1 100%; }
        .upcv-jobrow-salary { flex:1 1 auto; }
        .upcv-jobrow-seg { width:auto; flex:0 0 auto; margin-left:auto; }
        .upcv-jobrow-src, .upcv-jobrow-city, .upcv-jobrow-time { display:none; }
        .upcv-jobrow-custom, .upcv-jobrow-link { flex:none; }
      }

      /* ---- JD 对齐页：岗位库直通的预填条（目标岗位 + 公司 + 直链 + 手贴提示）---- */
      .upcv-jdsrc { display:flex; flex-wrap:wrap; align-items:center; gap:var(--upcv-2); margin-bottom:var(--upcv-2); padding:var(--upcv-3); border:1px solid var(--upcv-line-soft); border-left:3px solid var(--upcv-accent); border-radius:var(--upcv-r-md); background:var(--upcv-sunken); }
      .upcv-jdsrc-title { font-size:var(--upcv-t-base); font-weight:700; color:var(--upcv-ink); }
      .upcv-jdsrc-company { font-size:var(--upcv-t-sm); color:var(--upcv-ink-2); }
      .upcv-jdsrc-link { display:inline-flex; align-items:center; gap:4px; margin-left:auto; font-size:var(--upcv-t-sm); color:var(--upcv-accent); text-decoration:none; }
      .upcv-jdsrc-link:hover { text-decoration:underline; }
      .upcv-jdsrc .upcv-hint { flex-basis:100%; margin:0; }

      /* ---- V0.24.5 面试页配置面板分区（练习/面试共用骨架）---- */
      .upcv-config { display:flex; flex-direction:column; gap:var(--upcv-3); }
      .upcv-config-card { border:1px solid var(--dsw-alias-border-l2); border-radius:var(--upcv-r-md); background:var(--upcv-surface); padding:var(--upcv-3); }
      .upcv-config-label { margin:0 0 var(--upcv-2); font-size:var(--upcv-t-sm); font-weight:700; color:var(--dsw-alias-label-primary); }
      .upcv-config-status { display:flex; align-items:center; justify-content:space-between; gap:var(--upcv-2); margin-top:var(--upcv-2); flex-wrap:wrap; }
      .upcv-config-inner { margin-top:var(--upcv-2); padding:var(--upcv-2); border:1px solid var(--dsw-alias-border-l2); border-radius:var(--upcv-r-md); background:var(--upcv-sunken); }
      .upcv-cta-row { display:flex; align-items:center; gap:var(--upcv-3); margin-top:var(--upcv-2); flex-wrap:wrap; }
      @media (prefers-reduced-motion: reduce) { .upcv-config-card, .upcv-config-inner { transition:none; } }

    `;

/* ---- client/src/20-app.js ---- */
/* ===========================================================================
 * dsh-upcv-workspace — client half, part 2: 组件.
 *
 * 手写 __ModuleLoader__ 包（无打包器、无 JSX）：client/src/*.js 按文件名顺序
 * 由 scripts/build-client.mjs 拼成 lib/client.js。只使用平台种子 `react`。
 * ======================================================================== */
    // ========== 组件 ==========
    /**
     * 统一的提示条：图标 + 文案。
     * tone 同时决定图标与配色——语义不靠颜色单独承载。
     */
    function Notice({ tone, icon, children }) {
      const isError = tone === 'error';
      const name = icon !== undefined ? icon : (isError ? 'alert' : 'lightbulb');
      return h('div', { className: isError ? 'upcv-error' : 'upcv-notice' }, Icon(name), children);
    }

    /** 标签下拉多选：触发框（已选 chips）+ 弹出勾选面板（题量计数，标签多时可过滤）。
     *  数据来自 /bank/topics 聚合的题库实际词表，不写死。 */
    function TagMultiSelect({ value, onChange, options, ariaLabel }) {
      const [open, setOpen] = React.useState(false);
      const [filter, setFilter] = React.useState('');
      const opts = (Array.isArray(options) ? options : []).filter((o) => o !== null && typeof o === 'object' && typeof o.tag === 'string' && o.tag !== '');
      const selected = Array.isArray(value) ? value : [];
      const toggle = (tag) => onChange(selected.indexOf(tag) === -1 ? selected.concat([tag]) : selected.filter((x) => x !== tag));
      const kw = filter.trim().toLowerCase();
      const shown = kw === '' ? opts : opts.filter((o) => o.tag.toLowerCase().includes(kw));
      return h('div', { style: { position: 'relative' } }, [
        open && h('div', { onClick: () => setOpen(false), 'aria-hidden': 'true', style: { position: 'fixed', left: '0', top: '0', right: '0', bottom: '0', zIndex: '15' } }),
        h('div', {
          role: 'button', tabIndex: 0, 'aria-label': ariaLabel, 'aria-expanded': open ? 'true' : 'false',
          onClick: () => { setOpen(!open); setFilter(''); },
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(!open); } },
          style: { minHeight: '42px', padding: '7px 12px', border: '1px solid var(--dsw-alias-border-l4)', borderRadius: '8px', background: 'var(--dsw-alias-bg-layer-3)', display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '6px', cursor: 'pointer', boxSizing: 'border-box', fontSize: '14px' },
        }, [
          selected.length === 0
            ? h('span', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, '点开选择知识点（可多选，来自题库实际标签）')
            : selected.map((tag) => h('span', { key: tag, className: 'upcv-tag', style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } }, [
                h('span', null, tag),
                h('span', {
                  role: 'button', tabIndex: -1, 'aria-label': '移除 ' + tag,
                  onClick: (e) => { e.stopPropagation(); toggle(tag); },
                  style: { cursor: 'pointer', opacity: '0.7' },
                }, '×'),
              ])),
          h('span', { 'aria-hidden': 'true', style: { marginLeft: 'auto', color: 'var(--dsw-alias-label-tertiary)', fontSize: '12px' } }, open ? '▴' : '▾'),
        ]),
        open && h('div', {
          role: 'listbox', 'aria-label': '可选知识点',
          style: { position: 'absolute', zIndex: '16', left: '0', right: '0', top: 'calc(100% + 6px)', background: 'var(--dsw-alias-bg-layer-2)', border: '1px solid var(--dsw-alias-border-l4)', borderRadius: '10px', padding: '8px', maxHeight: '280px', overflowY: 'auto', boxShadow: '0 10px 28px rgba(0,0,0,0.35)' },
        }, [
          opts.length > 12 && h('input', {
            className: 'upcv-input', value: filter, placeholder: '过滤标签…', 'aria-label': '过滤知识点标签',
            onChange: (e) => setFilter(e.target.value),
            style: { marginBottom: '6px', padding: '6px 10px' },
          }),
          opts.length === 0
            ? h('p', { className: 'upcv-hint', style: { margin: '4px 0' } }, '题库里还没有标签：选简历生成题库后，这里会出现可选项。')
            : shown.map((o) => h('label', { key: o.tag, style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 8px', borderRadius: '6px', cursor: 'pointer' } }, [
                h('input', { type: 'checkbox', checked: selected.indexOf(o.tag) !== -1, onChange: () => toggle(o.tag) }),
                h('span', { style: { flex: '1', minWidth: '0' } }, o.tag),
                h('span', { className: 'upcv-hint' }, String(o.count) + ' 题'),
              ])),
          opts.length > 0 && shown.length === 0 && h('p', { className: 'upcv-hint', style: { margin: '4px 0' } }, '没有匹配的标签。'),
        ]),
      ]);
    }
    
    function HomePage({ onNavigate, t }) {
      const features = [
        { icon: 'file-text', title: t('feature_resume'), desc: t('feature_resume_desc'), page: 'resume' },
        { icon: 'mic', title: t('feature_interview'), desc: t('feature_interview_desc'), page: 'interview' },
        { icon: 'briefcase', title: t('feature_jobs'), desc: t('feature_jobs_desc'), page: 'jobs' },
        { icon: 'target', title: 'JD 对齐', desc: '贴岗位 JD，逐条核对简历覆盖，找出关键词缺口', page: 'jd' },
      ];

      return h('div', { className: 'upcv-home' }, [
        h('section', { className: 'upcv-hero', key: 'hero' },
          h('span', { className: 'upcv-eyebrow' }, Icon('sparkles'), 'AI 求职助手'),
          h('h1', null, t('hero_title'), h('span', null, t('hero_subtitle'))),
          h('p', null, t('hero_desc')),
        ),
        h('div', { className: 'upcv-features', key: 'features' },
          features.map((f, i) => h('button', {
            type: 'button',
            className: 'upcv-feature',
            key: i,
            onClick: () => onNavigate(f.page),
          },
            h('span', { className: 'upcv-feature-icon' }, Icon(f.icon, 'lg')),
            h('span', { className: 'upcv-feature-body' },
              h('h3', null, f.title),
              h('p', null, f.desc)
            ),
            h('span', { className: 'upcv-feature-arrow' }, Icon('arrow-right'))
          )),
        ),
      ]);
    }
    
    // ========== 简历：列表 / 导入 / 空白 / AI 生成 ==========
    function ResumePage({ t, onBack, aiStatus, onOpenEditor }) {
      const history = useHistory('resumes');
      const [mode, setMode] = React.useState('list');
      const [error, setError] = React.useState('');
      const [generating, setGenerating] = React.useState(false);
      const [name, setName] = React.useState('');
      const [targetJob, setTargetJob] = React.useState('');
      const [experience, setExperience] = React.useState('');
      const [project, setProject] = React.useState('');
      const [skills, setSkills] = React.useState('');

      const openBlank = async () => {
        setError('');
        try {
          const saved = await storeSave('resumes', { title: '新建简历', source: 'blank', data: blankResume() });
          onOpenEditor(saved.item.id);
        } catch (e) { setError((e && e.message) || '创建失败。'); }
      };

      const generate = async () => {
        if (targetJob.trim() === '') { setError('请先填写目标岗位。'); return; }
        setError('');
        setGenerating(true);
        try {
          const data = await apiPost('/resume/optimize', { name: name, targetJob: targetJob, experience: experience, project: project, skills: skills });
          const saved = await storeSave('resumes', {
            title: (data.resume.basics.name || name || '我的') + '的简历',
            targetJob: targetJob,
            source: 'ai',
            data: data.resume,
            provider: data.provider,
            model: data.model,
          });
          onOpenEditor(saved.item.id);
        } catch (e) {
          setError((e && e.message) || '生成失败，请重试。');
        } finally {
          setGenerating(false);
        }
      };

      const SOURCE_LABEL = { import: '导入', blank: '空白', ai: 'AI 生成' };

      if (mode === 'import') {
    return h('div', { className: 'upcv-page' }, [
          h('button', { className: 'upcv-back', type: 'button', key: 'back', onClick: () => setMode('list') }, Icon('arrow-left'), '返回简历列表'),
          h('div', { className: 'upcv-page-head', key: 'head' },
            h('h2', { className: 'upcv-page-title' }, '导入现有简历'),
            h('p', { className: 'upcv-page-desc' }, '支持 PDF / Word / 文本，AI 会把它拆成可逐项编辑的结构。')
          ),
          h(ResumeImportPanel, {
            key: 'panel',
            aiStatus: aiStatus,
            onCancel: () => setMode('list'),
            onDone: (item) => { history.reload(); onOpenEditor(item.id); },
          }),
        ]);
      }

      if (mode === 'ai') {
        return h('div', { className: 'upcv-page' }, [
          h('button', { className: 'upcv-back', type: 'button', key: 'back', onClick: () => setMode('list') }, Icon('arrow-left'), '返回简历列表'),
          h('div', { className: 'upcv-page-head', key: 'head' },
            h('h2', { className: 'upcv-page-title' }, 'AI 生成简历'),
            h('p', { className: 'upcv-page-desc' }, '提供原始素材，AI 按目标岗位重写并直接生成可编辑的简历。')
          ),
          !(aiStatus && aiStatus.available === true) && h(Notice, { key: 'noai' }, '本机没有可调用的模型，AI 生成不可用。'),
          error !== '' && h(Notice, { key: 'err', tone: 'error' }, error),
          h('input', { className: 'upcv-input', placeholder: '姓名', value: name, onChange: (e) => setName(e.target.value), style: { marginBottom: '10px' } }),
          h('input', { className: 'upcv-input', placeholder: '目标岗位（必填，如：产品经理）', value: targetJob, onChange: (e) => setTargetJob(e.target.value), style: { marginBottom: '10px' } }),
          h('textarea', { className: 'upcv-input', placeholder: '工作/实习经历', value: experience, onChange: (e) => setExperience(e.target.value), style: { minHeight: '90px', marginBottom: '10px', resize: 'vertical' } }),
          h('textarea', { className: 'upcv-input', placeholder: '项目经历', value: project, onChange: (e) => setProject(e.target.value), style: { minHeight: '80px', marginBottom: '10px', resize: 'vertical' } }),
          h('input', { className: 'upcv-input', placeholder: '技能（顿号分隔）', value: skills, onChange: (e) => setSkills(e.target.value), style: { marginBottom: '14px' } }),
          h('button', { className: 'upcv-btn upcv-btn-primary', onClick: generate, disabled: generating || !(aiStatus && aiStatus.available === true) }, generating ? '生成中...' : '生成并打开编辑器'),
        ]);
      }

      const hasItems = history.items.length > 0;

      return h('div', { className: 'upcv-page' }, [
        h('button', { className: 'upcv-back', type: 'button', key: 'back', onClick: onBack }, Icon('arrow-left'), '返回'),
        h('div', { className: 'upcv-page-head', key: 'head' },
          h('h2', { className: 'upcv-page-title' }, '我的简历'),
          h('p', { className: 'upcv-page-desc' }, hasItems
            ? '打开编辑器逐项修改，或导出 PDF；每份简历都可以对准一个目标岗位单独调整。'
            : '导入一份已有的 PDF / Word / 文本，AI 会把它拆成可逐项编辑的结构。')
        ),
        error !== '' && h(Notice, { key: 'err', tone: 'error' }, error),

        !hasItems && h('div', { className: 'upcv-empty', key: 'empty' },
          h('div', { className: 'upcv-empty-icon' }, Icon('file-text', 'lg')),
          h('div', { className: 'upcv-empty-title' }, '从第一份简历开始'),
          h('p', { className: 'upcv-empty-desc' }, '把零散经历整理成结构化简历，或导入已有文件自动拆分；之后可以在编辑器里逐项修改并导出 PDF。'),
          h('div', { className: 'upcv-empty-actions' },
            h('button', { type: 'button', className: 'upcv-btn upcv-btn-primary', onClick: () => setMode('import') }, Icon('upload'), '导入现有简历'),
            h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary', onClick: () => setMode('ai') }, Icon('sparkles'), 'AI 生成'),
            h('button', { type: 'button', className: 'upcv-btn upcv-btn-ghost', onClick: openBlank }, Icon('file-plus'), '新建空白简历')
          )
        ),

        hasItems && h('div', { className: 'upcv-actions upcv-actions-block', key: 'actions' },
          h('button', { type: 'button', className: 'upcv-btn upcv-btn-primary', onClick: () => setMode('import') }, Icon('upload'), '导入现有简历'),
          h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary', onClick: openBlank }, Icon('file-plus'), '新建空白简历'),
          h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary', onClick: () => setMode('ai') }, Icon('sparkles'), 'AI 生成')
        ),

        hasItems && h('div', { key: 'list' }, history.items.map((record) => {
          const stats = record.data ? resumeStats(record.data) : { sectionsFilled: 0, totalSections: 13, items: 0 };
          const sourceKey = record.source || 'blank';
          const ownerName = (record.data && record.data.basics && record.data.basics.name) || '未填写姓名';
          return h('article', { className: 'upcv-card upcv-resume-card', key: record.id },
            h('div', { className: 'upcv-resume-head' },
              h('div', { className: 'upcv-resume-main' },
                h('h3', { className: 'upcv-resume-name' }, record.title || '未命名简历'),
                h('div', { className: 'upcv-resume-meta' },
                  h('span', { className: 'upcv-pill' + (sourceKey === 'ai' ? ' accent' : '') }, SOURCE_LABEL[sourceKey] || '简历'),
                  h('span', null, '填充 ' + stats.sectionsFilled + ' 个板块'),
                  h('span', null, formatTime(record.updatedAt))
                )
              ),
              h('span', { className: 'upcv-pill' }, ownerName)
            ),
            h('div', { className: 'upcv-resume-actions' },
              h('button', { type: 'button', className: 'upcv-btn upcv-btn-primary upcv-btn-sm', onClick: () => onOpenEditor(record.id) }, '打开编辑器'),
              h('button', {
                type: 'button',
                className: 'upcv-btn upcv-btn-secondary upcv-btn-sm',
                onClick: () => {
                  setError('');
                  exportResumeHtml(
                    resumeToPrintHtml(record.data, null),
                    ((record.data && record.data.basics && record.data.basics.name) || 'resume') + '.html',
                    setError,
                  );
                },
              }, Icon('download'), '导出 PDF'),
              h('button', {
                type: 'button',
                className: 'upcv-mini danger',
                onClick: () => storeDelete('resumes', record.id).then(history.reload).catch(() => {}),
              }, Icon('trash'), '删除')
            )
          );
        })),
      ]);
    }

    /** 判定结论的展示文案与配色语义（颜色不单独表意，都带文字）。 */
    const VERDICT_LABEL = { pass: '对', partial: '部分', fail: '错' };

    /** 每道主线题最多追问两层（v2 升级：原来一层）。 */
    const MAX_FOLLOWUPS = 2;

    function InterviewPage({ t, onBack, aiStatus, onNavigate }) {
      const [stage, setStage] = React.useState('select');
      // 会话状态（V0.23 起两种模式都是客户端驱动，不落服务端会话）
      const [session, setSession] = React.useState(null);
      // 面试模式：知识点覆盖 + 深度自适应的循环状态
      const [iv, setIv] = React.useState(null); // { topics[], index, stats[{topic,asked,pass,partial,fail,missed[],better[]}], askedIds[] }
      const [current, setCurrent] = React.useState(null);
      const [answer, setAnswer] = React.useState('');
      const [report, setReport] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState('');
      const [notice, setNotice] = React.useState('');
      const [serverSource, setServerSource] = React.useState('');
      const [awaitUserJudge, setAwaitUserJudge] = React.useState(false);
      // 判定卡是否属于"当前屏幕上这道题"：提交判定落地时亮起，出新题时熄灭。
      // 不直接用 transcript 末条 verdict 判断——transcript 是整场流水（报告要用），换题后仍非空。
      const [showJudge, setShowJudge] = React.useState(false);

      // ── 模式与题源 ──
      const [mode, setMode] = React.useState(null); // null=未选 | 'practice'=自由练习 | 'interview'=模拟面试
      const [srcType, setSrcType] = React.useState(null); // jd | resume | null（面试模式题源）
      const [jobId, setJobId] = React.useState('');
      const [jdText, setJdText] = React.useState('');
      const [resumeId, setResumeId] = React.useState('');
      const [tagSel, setTagSel] = React.useState([]);
      // ── 练习模式（V3 Phase B）──
      const [practiceLevel, setPracticeLevel] = React.useState('junior'); // 起点难度：junior/mid/senior，''=不限级别（全档随机不爬升）
      const [practiceTagsSel, setPracticeTagsSel] = React.useState([]); // 不选简历时的手动标签（下拉多选）
      const [tagVocab, setTagVocab] = React.useState([]); // 题库实际标签词表 {tag, count}（/bank/topics 聚合）
      const [practicePool, setPracticePool] = React.useState(null);
      const [kg, setKg] = React.useState(null); // 知识点确认清单 { summary, hasProfile, unchanged, points:[{tag,note,checked}] }
      const [genProgress, setGenProgress] = React.useState(null); // { index, total, topic, added }

      const [jobs, setJobs] = React.useState(null); // null = 还在加载岗位库
      const resumes = useHistory('resumes');
      const interviews = useHistory('interviews');
      const askedRef = React.useRef([]);

      const aiReady = aiStatus !== null && aiStatus !== undefined && aiStatus.available === true;
      // 面试进行中：退出需二次确认（权重已实时落盘，丢的只是本轮覆盖进度）
      const interviewInProgress = mode === 'interview' && stage === 'question'
        && session !== null && session.status === 'adaptive-interview'
        && Array.isArray(session.transcript) && session.transcript.length > 0;
      const confirmExit = () => window.confirm('面试进行中：退出将放弃本轮覆盖进度（已答题目的权重已保存）。确定退出？') === true;
      const guardedNavigate = (page) => { if (interviewInProgress && confirmExit() !== true) return; onNavigate(page); };
      const guardedBack = () => { if (interviewInProgress && confirmExit() !== true) return; onBack(); };
      // 刷新/关窗的原生拦截（确认文案由浏览器给出）
      React.useEffect(() => {
        if (interviewInProgress !== true) return undefined;
        const handler = (e) => { e.preventDefault(); e.returnValue = ''; };
        window.addEventListener('beforeunload', handler);
        return () => window.removeEventListener('beforeunload', handler);
      }, [interviewInProgress]);

      // ── 数据加载 ──
      React.useEffect(() => {
        let alive = true;
        apiGet('/jobs/feed')
          .then((data) => { if (alive) setJobs(Array.isArray(data.items) ? data.items : []); })
          .catch(() => { if (alive) setJobs([]); });
        return () => { alive = false; };
      }, []);


      const jobList = jobs === null ? [] : jobs;
      const selectedJob = jobList.find((job) => job !== null && typeof job === 'object' && job.id === jobId) ?? null;
      const selectedResume = resumes.items.find((item) => item !== null && typeof item === 'object' && item.id === resumeId) ?? null;

      // 标签筛选项从对应题源的数据聚合，不读死词表
      const tagOptions = React.useMemo(() => {
        const collect = (lists) => {
          const seen = new Set();
          for (const list of lists) {
            for (const tag of Array.isArray(list) ? list : []) {
              const text = String(tag ?? '').trim();
              if (text !== '') seen.add(text);
            }
          }
          return [...seen].slice(0, 24);
        };
        if (srcType === 'jd') {
          const source = selectedJob !== null ? [selectedJob] : jobList;
          return collect(source.map((job) => (job !== null && typeof job === 'object' ? job.tags : null)));
        }
        if (srcType === 'resume') {
          const source = selectedResume !== null ? [selectedResume] : resumes.items;
          return collect(source.map((record) => {
            const data = record !== null && typeof record === 'object' ? record.data : null;
            const skills = data !== null && data !== undefined && data.sections !== null && data.sections !== undefined ? data.sections.skills : null;
            const items = skills !== null && skills !== undefined && Array.isArray(skills.items) ? skills.items : [];
            return items.flatMap((item) => (Array.isArray(item?.keywords) ? item.keywords : [item?.name]));
          }));
        }
        return [];
      }, [srcType, selectedJob, jobList, selectedResume, resumes.items]);

      React.useEffect(() => {
        // 切换题源后清掉不再成立的标签选择；没有变化时返回原引用，避免多余的渲染
        setTagSel((current) => {
          const next = current.filter((tag) => tagOptions.includes(tag));
          return next.length === current.length ? current : next;
        });
      }, [tagOptions]);

      /** V0.23 起两种模式都是客户端驱动：会话不落 interviews（历史列表只剩 legacy 只读记录）。 */
      const saveSession = (next) => {
        setSession(next);
        // lastEntryRef 跟随 transcript 末条（面试推进/知识点统计读它）；整场重置时归 null
        const nt = next !== null && next !== undefined && Array.isArray(next.transcript) ? next.transcript : null;
        lastEntryRef.current = nt !== null && nt.length > 0 ? nt[nt.length - 1] : null;
        return next;
      };


      const practiceResume = selectedResume;
      const profilePoints = Array.isArray(practiceResume?.knowledgeProfile?.points) ? practiceResume.knowledgeProfile.points : [];

      const practiceTopicList = () => (resumeId !== '' ? profilePoints.map((p) => String(p.tag ?? '')).filter((s) => s !== '') : practiceTagsSel.slice());

      /** 标签词表：进面板拉一次，生成题库后刷新。失败静默（下拉显示空态提示）。 */
      const reloadTagVocab = () => {
        apiGet('/bank/topics')
          .then((data) => { if (data && data.ok) setTagVocab(Array.isArray(data.topics) ? data.topics : []); })
          .catch(() => {});
      };
      React.useEffect(() => { reloadTagVocab(); }, []);

      const applyPracticeQuestion = (data, jobTitle, opts = {}) => {
        setPracticePool(data.pool ?? null);
        const pool = data.pool ?? {};
        if (pool.depleted === true && pool.reason) {
          setNotice(pool.reason + (pool.replenishQueued === true ? '；已在后台自动补充新题。' : ''));
        } else if (pool.relaxed === 'cooldown' || pool.relaxed === 'level' || pool.relaxed === 'topic') {
          setNotice('当前范围题量不足，已放宽筛选出这题。');
        } else {
          setNotice('');
        }
        const q = data.question;
        askedRef.current = askedRef.current.concat([String(q.question ?? '')]);
        lastEntryRef.current = null; // 新会话边界，防上一场的末条串场
        setSession((prev) => (prev !== null && prev.status === 'practice'
          ? prev
          : { status: 'practice', mode: 'practice', jobTitle: jobTitle, source: 'practice', questions: [], transcript: [], startedAt: new Date().toISOString(), lvlStart: opts.lvlStart ?? '', lvlIdx: 0, passStreak: 0 }));
        setCurrent(q);
        setAnswer('');
        setReport(null);
        setAwaitUserJudge(false);
        setShowJudge(false);
        setStage('question');
      };

      const startPractice = async () => {
        const topics = practiceTopicList();
        if (resumeId !== '' && practiceResume === null) { setError('请先选择一份已保存的简历。'); return; }
        if (resumeId !== '' && topics.length === 0) { setError('这份简历还没有初始化题库：先点「提取知识点并生成题库」。'); return; }
        if (resumeId === '' && topics.length === 0) { setError('选一份简历（推荐，可出个性化题），或手动输入几个知识点标签。'); return; }
        setError('');
        setLoading(true);
        try {
          // 首题只有起点档（不限=全档）；爬升从答题后的推进开始
          const startBand = practiceLevel === '' ? undefined : [practiceLevel];
          const data = await apiPost('/bank/practice/next', {
            topics: topics,
            ...(startBand !== undefined ? { levels: startBand } : { level: '' }),
            resumeId: resumeId,
          });
          askedRef.current = [];
          applyPracticeQuestion(data, resumeId !== '' ? String(practiceResume.title ?? '简历练习') : '自由练习', { lvlStart: practiceLevel });
        } catch (e) {
          setError((e && e.message) || '出题失败，请重试。');
        } finally {
          setLoading(false);
        }
      };

      const practiceNext = async (sessionOverride) => {
        setLoading(true);
        setError('');
        try {
          const band = levelBandOf(sessionOverride ?? session);
          const data = await apiPost('/bank/practice/next', {
            topics: practiceTopicList(),
            ...(band !== undefined ? { levels: band } : { level: '' }),
            resumeId: resumeId,
          });
          applyPracticeQuestion(data, session?.jobTitle ?? '自由练习');
        } catch (e) {
          if (e && e.data && e.data.error === 'bank-empty') {
            setNotice('这个范围的题都练完了（或都在冷却中）：' + ((e.data.message && e.data.message) || ''));
            endPractice();
          } else {
            setError((e && e.message) || '出题失败，请重试。');
          }
        } finally {
          setLoading(false);
        }
      };

      /** 结束练习：轻量小结（判定分布 + 待复盘清单），不生成完整报告、不落历史。 */
      const endPractice = () => {
        const entries = Array.isArray(session?.transcript) ? session.transcript : [];
        const dist = { pass: 0, partial: 0, fail: 0, unjudged: 0 };
        const weakItems = [];
        for (const item of entries) {
          const v = item?.verdict;
          const ok = v !== null && v !== undefined && typeof v === 'object' && ['pass', 'partial', 'fail'].includes(v.verdict);
          const key = ok ? v.verdict : 'unjudged';
          dist[key] += 1;
          if (ok && key !== 'pass') {
            weakItems.push({
              question: String(item?.question ?? ''),
              verdict: v.verdict,
              missedPoints: Array.isArray(v.missedPoints) ? v.missedPoints : [],
              betterApproach: String(v.betterApproach ?? ''),
            });
          }
        }
        setReport({ practice: true, total: entries.length, judgedCount: dist.pass + dist.partial + dist.fail, dist: dist, weakItems: weakItems });
        setCurrent(null);
        setStage('report');
      };

      /** 提取简历知识点（/bank/kg）：返回待确认清单，不生成题。 */
      const runKg = async () => {
        if (resumeId === '') { setError('请先选择一份简历。'); return; }
        setError('');
        setLoading(true);
        try {
          const data = await apiPost('/bank/kg', { resumeId: resumeId });
          setKg({
            summary: String(data.summary ?? ''),
            hasProfile: data.hasProfile === true,
            unchanged: Number(data.unchanged) || 0,
            points: (Array.isArray(data.points) ? data.points : []).map((p) => ({
              tag: String(p.tag ?? ''),
              note: String(p.note ?? ''),
              source: p.source === 'related' ? 'related' : 'direct',
              checked: data.hasProfile === true
                ? (Array.isArray(data.added) && data.added.some((a) => String(a.tag) === String(p.tag)))
                : true,
            })),
          });
        } catch (e) {
          setError((e && e.message) || '知识点提取失败，请重试。');
        } finally {
          setLoading(false);
        }
      };

      /** 逐个知识点分批生成（同步，进度条），完成后把清单写回简历。 */
      const generateBank = async () => {
        if (kg === null) return;
        const chosen = kg.points.filter((p) => p.checked);
        if (chosen.length === 0) { setError('至少勾选一个知识点。'); return; }
        setError('');
        setLoading(true);
        try {
          for (let i = 0; i < chosen.length; i += 1) {
            setGenProgress({ index: i, total: chosen.length, topic: chosen[i].tag, added: 0 });
            const data = await apiPost('/bank/generate', {
              mode: kg.hasProfile === true ? 'resume-diff' : 'resume-first',
              resumeId: resumeId,
              points: chosen.map((p) => ({ tag: p.tag, note: p.note })),
              index: i,
              count: 8,
            });
            setGenProgress({ index: i + 1, total: chosen.length, topic: chosen[i].tag, added: Number(data.added) || 0 });
          }
          await apiPost('/bank/generate', { mode: 'resume-finish', resumeId: resumeId, points: chosen.map((p) => ({ tag: p.tag, note: p.note })) });
          setKg(null);
          setNotice('题库就绪：' + chosen.length + ' 个知识点已生成（概念/原理/实践/场景全覆盖）。点「开始练习」直接开练。');
          resumes.reload();
          reloadTagVocab();
        } catch (e) {
          setError((e && e.message) || '题库生成失败，请重试。');
        } finally {
          setGenProgress(null);
          setLoading(false);
        }
      };


      const KIND_ORDER = ['concept', 'mechanism', 'practice', 'scenario'];
      const IV_POINT_CAP = 8; // 每个知识点最多问 8 题（答对可一路问深）
      const LEVELS_ALL = ['junior', 'mid', 'senior']; // 练习起点难度爬升的档位（低→高）
      const LEVEL_ZH = { junior: '初级', mid: '中级', senior: '高级' };
      const lastEntryRef = React.useRef(null);

      /** 面试模式的知识点集合：简历 knowledgeProfile > 勾选标签 > 手动多选 > 题源标签全集。 */
      const ivCollectTopics = () => {
        if (srcType === 'resume' && resumeId !== '') {
          const profile = Array.isArray(selectedResume?.knowledgeProfile?.points) ? selectedResume.knowledgeProfile.points : [];
          const tags = profile.map((p) => String(p.tag ?? '')).filter((s) => s !== '');
          if (tags.length > 0) return tags;
        }
        if (tagSel.length > 0) return tagSel.slice();
        if (practiceTagsSel.length > 0) return practiceTagsSel.slice();
        if (tagOptions.length > 0) return tagOptions.slice();
        return [];
      };

      const applyInterviewQuestion = (data) => {
        const q = data.question;
        askedRef.current = askedRef.current.concat([String(q.question ?? '')]);
        setCurrent(q);
        setAnswer('');
        setReport(null);
        setAwaitUserJudge(false);
        setShowJudge(false);
        setStage('question');
        if (data.pool && data.pool.depleted === true && data.pool.reason) {
          setNotice(data.pool.reason + (data.pool.replenishQueued === true ? '；已在后台自动补充新题。' : ''));
        } else {
          setNotice('');
        }
      };

      /** 纯函数：把最近一次判定（可能未判定=跳过）记入知识点统计并排除该题。 */
      const ivApplyLast = (state, entry) => {
        const v = entry !== null && entry !== undefined && entry.verdict !== null && entry.verdict !== undefined && typeof entry.verdict === 'object' ? entry.verdict : null;
        const stats = state.stats.slice();
        const slot = { ...stats[state.index] };
        slot.asked += 1;
        if (v !== null) {
          if (v.verdict === 'pass') slot.pass += 1;
          else if (v.verdict === 'partial') slot.partial += 1;
          else slot.fail += 1;
          for (const m of Array.isArray(v.missedPoints) ? v.missedPoints : []) {
            if (!slot.missed.includes(m)) slot.missed = slot.missed.concat([m]);
          }
          const better = String(v.betterApproach ?? '').trim();
          if (better !== '' && !slot.better.includes(better)) slot.better = slot.better.concat([better]);
        }
        stats[state.index] = slot;
        const id = String((entry && entry.questionId) ?? '');
        return { ...state, stats: stats, askedIds: state.askedIds.includes(id) || id === '' ? state.askedIds : state.askedIds.concat([id]) };
      };

      /** 面试模式开始：逐知识点覆盖 + 深度自适应，最后给逐点总结。 */
      const startAdaptiveInterview = async () => {
        const topics = ivCollectTopics();
        if (topics.length === 0) { setError('没有可覆盖的知识点：选题源后勾选标签，选简历（已初始化题库），或手动输入标签。'); return; }
        setError('');
        setNotice('');
        setLoading(true);
        const state = {
          topics: topics,
          index: 0,
          stats: topics.map((topic) => ({ topic: topic, asked: 0, pass: 0, partial: 0, fail: 0, missed: [], better: [] })),
          askedIds: [],
        };
        setIv(state);
        setSession({
          status: 'adaptive-interview',
          mode: 'interview',
          jobTitle: srcType === 'jd' && selectedJob !== null ? String(selectedJob.title ?? 'JD 面试') : srcType === 'resume' && selectedResume !== null ? String(selectedResume.title ?? '简历面试') : '知识点面试',
          source: 'adaptive',
          questions: [],
          transcript: [],
          startedAt: new Date().toISOString(),
        });
        askedRef.current = [];
        lastEntryRef.current = null; // 新会话边界，防上一场的末条串场
        try {
          const data = await apiPost('/bank/practice/next', { topics: [topics[0]], level: '', kinds: [], excludeIds: [] });
          applyInterviewQuestion(data);
        } catch (e) {
          setError((e && e.message) || '出题失败，请重试。');
        } finally {
          setLoading(false);
        }
      };

      /** 向指定状态下的当前知识点要题（kinds=深度带；空数组=不限定）。 */
      const ivAskNextWith = (state, kinds) => {
        const point = state.topics[state.index];
        setLoading(true);
        setError('');
        apiPost('/bank/practice/next', { topics: [point], level: '', kinds: kinds, excludeIds: state.askedIds })
          .then((data) => applyInterviewQuestion(data))
          .catch((e) => {
            if (e && e.data && e.data.error === 'bank-empty') {
              ivGotoPointWith(state, state.index + 1);
            } else {
              setError((e && e.message) || '出题失败，请重试。');
              setLoading(false);
            }
          });
      };

      /** 切换知识点；越界即出总结。state 传调用方的最新状态（setIv 异步，不读旧闭包）。 */
      const ivGotoPointWith = (state, index) => {
        if (index >= state.topics.length) { endInterviewSummaryWith(state); return; }
        setIv({ ...state, index: index });
        ivAskNextWith({ ...state, index: index }, []);
      };

      /** 面试总结：逐知识点结论（结构化、无模型可用）。 */
      const endInterviewSummaryWith = (state) => {
        const dist = { pass: 0, partial: 0, fail: 0, unjudged: 0 };
        const points = state.stats.map((slot) => {
          dist.pass += slot.pass;
          dist.partial += slot.partial;
          dist.fail += slot.fail;
          const judged = slot.pass + slot.partial + slot.fail;
          const conclusion = judged === 0 ? 'skipped' : slot.fail === 0 && slot.partial <= 1 ? 'mastered' : slot.fail >= 2 || slot.pass === 0 ? 'weak' : 'ok';
          return { ...slot, conclusion: conclusion };
        });
        setReport({
          interviewSummary: true,
          jobTitle: session && session.jobTitle ? session.jobTitle : '模拟面试',
          total: points.reduce((sum, p) => sum + p.asked, 0),
          dist: dist,
          points: points,
        });
        setCurrent(null);
        setStage('report');
      };

      /** 总结页按需触发的 AI 综合评分（可选，复用旧报告端点）。 */
      const generateAiReport = async () => {
        setLoading(true);
        setError('');
        const transcript = Array.isArray(session && session.transcript) ? session.transcript : [];
        try {
          const data = await apiPost('/interview/report', { jobTitle: (session && session.jobTitle) || '', transcript: transcript });
          setReport(data.report);
        } catch (e) {
          setReport(localReport(transcript));
          setNotice('AI 评估不可用，已改用本地规则给出参考评分。');
        } finally {
          setLoading(false);
        }
      };

      /** 面试模式推进：记录本题判定 → 按对错调深度 → 同点继续 / 换点 / 总结。 */
      const ivAdvance = () => {
        if (iv === null || current === null) return;
        const entry = lastEntryRef.current;
        const nextState = ivApplyLast(iv, entry);
        setIv(nextState);
        const slot = nextState.stats[iv.index];
        if (slot.asked >= IV_POINT_CAP) { ivGotoPointWith(nextState, iv.index + 1); return; }
        const verdict = entry !== null && entry !== undefined && entry.verdict !== null && entry.verdict !== undefined && typeof entry.verdict === 'object' ? String(entry.verdict.verdict ?? '') : '';
        const kindIdx = KIND_ORDER.indexOf(String(current.kind ?? ''));
        let kinds = [];
        if (verdict === 'pass' && kindIdx >= 0 && kindIdx < KIND_ORDER.length - 1) kinds = [KIND_ORDER[kindIdx + 1]];
        else if (verdict === 'fail' && kindIdx > 0) kinds = [KIND_ORDER[kindIdx - 1]];
        else if (verdict === 'partial' && kindIdx >= 0) kinds = [KIND_ORDER[kindIdx]];
        ivAskNextWith(nextState, kinds);
      };

      /** 跳到下一个知识点（当前题未判定的按未判计）。 */
      const ivSkipPoint = () => {
        if (iv === null) return;
        const nextState = ivApplyLast(iv, lastEntryRef.current);
        ivGotoPointWith(nextState, iv.index + 1);
      };

      /** 起点难度的会话内级别带：[起点..已解锁上限]；''=不限 → undefined（采样不设限）。 */
      const levelBandOf = (s) => {
        if (s === null || s === undefined || s.status !== 'practice' || !s.lvlStart) return undefined;
        const startIdx = Math.max(0, LEVELS_ALL.indexOf(String(s.lvlStart)));
        const idx = Math.max(startIdx, Math.min(LEVELS_ALL.length - 1, Number.isInteger(s.lvlIdx) ? s.lvlIdx : startIdx));
        return LEVELS_ALL.slice(startIdx, idx + 1);
      };

      /** 答题页实时展示的解锁带：如「难度 初级→中级 · 已爬升」。 */
      const practiceBandLabel = () => {
        const s = session;
        if (s === null || s === undefined || s.status !== 'practice' || !s.lvlStart) return '难度 不限级别';
        const startIdx = Math.max(0, LEVELS_ALL.indexOf(String(s.lvlStart)));
        const idx = Math.max(startIdx, Math.min(LEVELS_ALL.length - 1, Number.isInteger(s.lvlIdx) ? s.lvlIdx : startIdx));
        return '难度 ' + LEVELS_ALL.slice(startIdx, idx + 1).map((l) => LEVEL_ZH[l]).join('→') + (idx > startIdx ? ' · 已爬升' : ' · 连对2题爬升');
      };

      /** 会话内难度爬升：连对 2 题解锁上一档；答错清连对；部分不动。返回更新后的 session 供本次采样直接用。 */
      const practiceClimb = () => {
        const s = session;
        if (s === null || s === undefined || s.status !== 'practice' || !s.lvlStart) return s;
        const nt = Array.isArray(s.transcript) ? s.transcript : [];
        const last = nt.length > 0 ? nt[nt.length - 1] : null;
        const v = last !== null && last !== undefined && last.verdict !== null && last.verdict !== undefined && typeof last.verdict === 'object' ? String(last.verdict.verdict ?? '') : '';
        const startIdx = Math.max(0, LEVELS_ALL.indexOf(String(s.lvlStart)));
        let idx = Math.max(startIdx, Math.min(LEVELS_ALL.length - 1, Number.isInteger(s.lvlIdx) ? s.lvlIdx : startIdx));
        let streak = Number(s.passStreak ?? 0);
        if (v === 'pass') {
          streak += 1;
          if (streak >= 2 && idx < LEVELS_ALL.length - 1) { idx += 1; streak = 0; }
        } else if (v === 'fail') {
          streak = 0;
        }
        const updated = { ...s, lvlIdx: idx, passStreak: streak };
        setSession(updated);
        return updated;
      };

      /** 判定后的推进：练习 → 爬升 + 采样下一题；面试 → 记统计并按对错调深度。 */
      const advance = () => {
        if (mode === 'practice') { void practiceNext(practiceClimb()); return; }
        ivAdvance();
      };

      /** 用户判定 / 改判（judgedBy:user 是终局）。verdict: pass | partial | fail */
      const judgeAsUser = async (verdict) => {
        const currentSession = session;
        if (currentSession === null) return;
        const transcript = Array.isArray(currentSession.transcript) ? currentSession.transcript.slice() : [];
        const last = transcript[transcript.length - 1];
        if (last === undefined) return;
        setLoading(true);
        setError('');
        try {
          // 改判只改判定与权重：AI 已给出的解析（命中/缺失/更优做法）原样带上，
          // 服务端 makeJudgment 会透传这三个字段，避免改判后解析区清空。
          const prev = last.verdict !== null && typeof last.verdict === 'object' ? last.verdict : null;
          const res = await apiPost('/interview/verdict', {
            verdict: verdict,
            ...(prev !== null ? {
              missedPoints: Array.isArray(prev.missedPoints) ? prev.missedPoints : [],
              hitPoints: Array.isArray(prev.hitPoints) ? prev.hitPoints : [],
              betterApproach: typeof prev.betterApproach === 'string' ? prev.betterApproach : '',
            } : {}),
            question: {
              questionId: last.questionId,
              question: last.question,
              tags: last.tags,
              points: last.points,
              bestPractice: last.bestPractice,
              source: last.source,
              sourceRef: last.sourceRef,
            },
            answer: last.answer,
          });
          const nextTranscript = transcript.slice(0, -1).concat([{ ...last, verdict: res.judgment }]);
          setAwaitUserJudge(false);
          setShowJudge(true);
          saveSession({ ...currentSession, transcript: nextTranscript });
        } catch (e) {
          setError((e && e.message) || '判定失败，请重试。');
        } finally {
          setLoading(false);
        }
      };

      const submitAnswer = async () => {
        if (current === null || session === null) return;
        if (answer.trim() === '') { setError('请先作答再提交。'); return; }
        setError('');
        const submitted = answer.trim();
        setAnswer('');

        const transcript = Array.isArray(session.transcript) ? session.transcript.slice() : [];
        if (current.isFollowUp === true) {
          // 追问的作答并进主线题条目，不单独占判定位
          const last = transcript[transcript.length - 1];
          if (last === undefined) return;
          const followUps = Array.isArray(last.followUps) ? last.followUps.concat([{ question: current.question, answer: submitted }]) : [{ question: current.question, answer: submitted }];
          transcript[transcript.length - 1] = { ...last, followUps: followUps };
        } else {
          transcript.push({
            questionId: current.questionId,
            question: current.question,
            tags: Array.isArray(current.tags) ? current.tags : [],
            points: Array.isArray(current.points) ? current.points : [],
            source: current.source,
            sourceRef: current.sourceRef === undefined ? null : current.sourceRef,
            isReplay: current.isReplay === true,
            answer: submitted,
            followUps: [],
          });
        }
        const nextSession = saveSession({ ...session, transcript: transcript });
        const lastEntry = transcript[transcript.length - 1];
        const followupsUsed = Array.isArray(lastEntry.followUps) ? lastEntry.followUps.length : 0;

        if (!aiReady) {
          // 无模型：不追问不判定，降级为用户自判（对 / 错 两态）
          setAwaitUserJudge(true);
          return;
        }

        setLoading(true);
        try {
          const data = await apiPost('/interview/next', {
            jobTitle: session.jobTitle,
            asked: askedRef.current,
            transcript: [{ ...lastEntry, followUps: undefined, question: current.question, point: current.point ?? '', answer: submitted }],
            remaining: 1,
            followupsUsed: followupsUsed,
            question: current,
          });
          const step = data.step;
          if (data.source === 'ai' && step && step.type === 'followup' && step.question && followupsUsed < MAX_FOLLOWUPS) {
            setCurrent({
              questionId: current.questionId,
              question: step.question,
              tags: current.tags,
              points: current.points,
              source: current.source,
              sourceRef: current.sourceRef,
              isReplay: current.isReplay === true,
              isFollowUp: true,
              reason: step.reason,
              hint: step.hint,
            });
            askedRef.current = askedRef.current.concat([step.question]);
            setLoading(false);
            return;
          }
          if (data.verdict !== null && data.verdict !== undefined) {
            // AI 判定即刻落库（题库 mastery 已在服务端更新），改判仍可用
            const nextTranscript = transcript.slice(0, -1).concat([{
              ...lastEntry,
              verdict: data.verdict,
            }]);
            saveSession({ ...session, transcript: nextTranscript });
            setShowJudge(true);
            setLoading(false);
            return; // 停在判定面板，由用户确认或改判后手动推进
          }
          // 模型没给出可用判定：降级为用户自判（此时可三态）
          setAwaitUserJudge(true);
        } catch (e) {
          // 追问/判定失败不影响主线：降级为用户自判
          setAwaitUserJudge(true);
        } finally {
          setLoading(false);
        }
      };

      const scoreRow = (label, value) => h('div', { className: 'upcv-score-row' }, [
        h('span', { className: 'upcv-score-label' }, label),
        h('div', { className: 'upcv-score-bar' }, h('span', { style: { width: Math.max(0, Math.min(100, Number(value) || 0)) + '%' } })),
        h('span', { className: 'upcv-score-num' }, String(Math.round(Number(value) || 0))),
      ]);

      const reset = () => {
        setStage('select');
        setSession(null);
        setCurrent(null);
        setIv(null);
        setAnswer('');
        setReport(null);
        setNotice('');
        setAwaitUserJudge(false);
        setShowJudge(false);
        setPracticeTagsSel([]);
        lastEntryRef.current = null;
        setServerSource('');
        interviews.reload();
      };

      const transcript = session === null ? [] : (Array.isArray(session.transcript) ? session.transcript : []);
      const lastEntry = transcript.length > 0 ? transcript[transcript.length - 1] : null;
      const viewed = transcript.length + (stage === 'question' && current !== null && current.isFollowUp !== true && !awaitUserJudge ? 1 : 0);
      const total = session === null ? 0 : (Array.isArray(session.questions) ? session.questions.length : 0);
      const judgeOptions = aiReady ? ['pass', 'partial', 'fail'] : ['pass', 'fail'];

      // ── 题源卡片 ──
      const sourceCards = [
        {
          key: 'jd',
          icon: 'briefcase',
          title: '岗位 JD',
          desc: jobs === null ? '读取岗位库中...'
            : jobList.length === 0 ? '岗位库为空：先去岗位页整理收件箱，或直接粘贴 JD'
            : selectedJob !== null ? '已选：' + String(selectedJob.title ?? '') + '（' + String(selectedJob.company ?? '') + '）'
            : '从岗位库选一条，或粘贴 JD 原文',
          disabled: false,
        },
        {
          key: 'resume',
          icon: 'file-text',
          title: '我的简历',
          desc: resumes.items.length === 0 ? '还没有已保存的简历'
            : selectedResume !== null ? '已选：' + String(selectedResume.title ?? '')
            : '选一份已存简历，AI 顺着你写的经历追问',
          disabled: resumes.items.length === 0,
        },
      ];

      // select 配置页放开宽度（铺满内容区）；答题/报告页保持 800 阅读宽度
      return h('div', { className: 'upcv-page', style: stage === 'select' ? { maxWidth: 'none', marginLeft: 0, marginRight: 0 } : undefined }, [
        h('button', { className: 'upcv-back', type: 'button', onClick: guardedBack }, Icon('arrow-left'), '返回'),

        stage === 'select' && h('div', { key: 'select' }, [
          h('div', { className: 'upcv-page-head' },
            h('h2', { className: 'upcv-page-title' }, t('interview_title')),
            h('p', { className: 'upcv-page-desc' }, mode === 'practice'
              ? '自由练习：按权重从题库出题，不限题数。答错的题权重升高会多练，连续答对后自然淡出。'
              : mode === 'interview'
                ? '面试模式：逐个知识点出题，答对问深、答错问浅（每点最多 8 题），最后给逐点总结。'
                : '选择练法：自由练习 / 模拟面试；也可以进题库复盘答过的题。')
          ),
          !aiReady && h(Notice, { key: 'noai' }, '本机没有可调用的模型：题库出题、用户自判仍然全部可用；生题按标签回退内置题库（初始化题库与 JD 生成需要模型）。'),
          error !== '' && h(Notice, { key: 'err', tone: 'error' }, error),
          notice !== '' && mode !== 'practice' && h(Notice, { key: 'notice-top' }, notice),

          mode === null && h('div', { className: 'upcv-src-grid', key: 'modes' }, [
            h('button', { key: 'p', type: 'button', className: 'upcv-src', 'aria-pressed': 'false', onClick: () => { setMode('practice'); setError(''); setNotice(''); } }, [
              h('span', { className: 'upcv-src-title' }, Icon('target'), '练习模式'),
              h('span', { className: 'upcv-src-desc' }, '选简历或标签直接开练，不限题数。答错的题权重升高会多练，掌握后自然淡出。'),
            ]),
            h('button', { key: 'i', type: 'button', className: 'upcv-src', 'aria-pressed': 'false', onClick: () => { setMode('interview'); setError(''); setNotice(''); } }, [
              h('span', { className: 'upcv-src-title' }, Icon('mic'), '面试模式'),
              h('span', { className: 'upcv-src-desc' }, '逐个知识点深挖：答对问得更深、答错自动转浅，每个点最多 8 题，最后给逐点总结。'),
            ]),
            h('button', { key: 'b', type: 'button', className: 'upcv-src', 'aria-pressed': 'false', onClick: () => guardedNavigate('bank') }, [
              h('span', { className: 'upcv-src-title' }, Icon('folder'), '题库与复盘'),
              h('span', { className: 'upcv-src-desc' }, '按标签/级别/题型浏览练过的所有题，看判定要点与历史，改判或移出。'),
            ]),
          ]),

          mode !== null && h('div', { key: 'mode-back', style: { marginBottom: '10px' } },
            h('button', { type: 'button', className: 'upcv-mini', onClick: () => { setMode(null); setSrcType(null); setKg(null); setGenProgress(null); setNotice(''); setError(''); } }, Icon('arrow-left'), '重选模式')),

          mode === 'practice' && h('div', { key: 'practice-panel', className: 'upcv-config' }, [
            // ── 主配置卡：简历路径（元素顺序固定，不随状态跳动）──
            h('div', { className: 'upcv-config-card', key: 'main' }, [
              h('p', { className: 'upcv-config-label' }, '按简历出题（推荐）'),
              h('select', {
                className: 'upcv-input', value: resumeId,
                onChange: (e2) => { setResumeId(e2.target.value); setKg(null); },
                'aria-label': '选择简历（练习入料）',
              },
                h('option', { value: '' }, '选择一份简历（推荐：按简历知识点出个性化题）'),
                resumes.items.map((record) => h('option', { key: record.id, value: record.id },
                  String(record.title ?? '未命名简历') + (record.data && record.data.basics ? ' · ' + String(record.data.basics.name ?? '') : '')))),
              resumeId !== '' && (() => {
                const cnt = profilePoints.length;
                const version = Number(practiceResume?.knowledgeProfile?.version) || 0;
                if (kg !== null) return null;
                return h('div', { className: 'upcv-config-status' }, [
                  h('span', { className: 'upcv-hint' }, cnt > 0
                    ? '题库已初始化：' + cnt + ' 个知识点' + (version > 0 ? '（v' + version + '）' : '') + '，可直接开练；简历更新后可增量补题。'
                    : '还没初始化题库：提取知识点后按「由浅入深 + 实战」批量生成。'),
                  h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', onClick: runKg, disabled: loading || !aiReady },
                    cnt > 0 ? (aiReady ? '重新提取（增量补题）' : '提取需要模型') : (aiReady ? '提取知识点并生成题库' : '提取需要模型')),
                ]);
              })(),
              kg !== null && h('div', { className: 'upcv-config-inner', key: 'kg' }, [
                kg.summary !== '' && h('p', { className: 'upcv-hint', style: { marginTop: '0' } }, kg.summary),
                kg.hasProfile && h('p', { className: 'upcv-hint', style: { marginTop: '0' } }, '增量模式：已勾选的是新提取到的知识点（' + kg.unchanged + ' 个原有知识点默认不重复生成）。'),
                kg.points.map((p, i) => h('label', { key: i, style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '4px 0', cursor: 'pointer' } }, [
                  h('input', { type: 'checkbox', checked: p.checked === true, onChange: () => setKg({ ...kg, points: kg.points.map((x, j) => (j === i ? { ...x, checked: !x.checked } : x)) }), style: { marginTop: '3px' } }),
                  h('span', null, [
                    h('span', { key: 's', className: 'upcv-pill' + (p.source === 'related' ? '' : ' accent'), style: { marginRight: '6px', fontSize: '11px' } }, p.source === 'related' ? '关联基础' : '简历明面'),
                    h('b', { key: 't' }, p.tag),
                    p.note !== '' && h('span', { key: 'n', className: 'upcv-hint' }, ' — ' + p.note),
                  ]),
                ])),
                genProgress !== null
                  ? h('div', null, [
                      h('p', { className: 'upcv-hint' }, '正在生成：' + genProgress.topic + '（' + genProgress.index + ' / ' + genProgress.total + '）'),
                      h('div', { className: 'upcv-score-bar' }, h('span', { style: { width: Math.round((genProgress.index / Math.max(1, genProgress.total)) * 100) + '%' } })),
                    ])
                  : h('div', { style: { display: 'flex', gap: '8px', marginTop: '10px' } }, [
                      h('button', { type: 'button', className: 'upcv-btn upcv-btn-primary upcv-btn-sm', onClick: generateBank, disabled: loading || !aiReady || kg.points.every((p) => p.checked !== true) },
                        loading ? '生成中...' : (kg.hasProfile ? '为勾选的知识点补题' : '生成题库（每点约 8 题）')),
                      h('button', { type: 'button', className: 'upcv-mini', onClick: () => setKg(null) }, '取消'),
                    ]),
                !aiReady && h('p', { className: 'upcv-hint' }, '知识点提取与生成需要可用模型。'),
              ]),
            ]),
            // ── 次路径：手动指定知识点（固定分区，不随上方状态移动）──
            h('div', { className: 'upcv-config-card', key: 'manual' }, [
              h('p', { className: 'upcv-config-label' }, '或者，直接指定知识点'),
              h(TagMultiSelect, {
                value: practiceTagsSel, onChange: setPracticeTagsSel,
                options: tagVocab, ariaLabel: '练习知识点标签',
              }),
            ]),
            // ── 起点难度：简历/手动两条题源路径共用（题都带级别）；连对爬升 ──
            h('div', { className: 'upcv-config-card', key: 'level' }, [
              h('div', { className: 'upcv-config-status' }, [
                h('span', { className: 'upcv-config-label', style: { margin: '0' } }, '起点难度'),
                h('select', {
                  className: 'upcv-input', value: practiceLevel,
                  onChange: (e2) => setPracticeLevel(e2.target.value), 'aria-label': '起点难度',
                  style: { flex: '1', minWidth: '0', width: 'auto', padding: '6px 10px' },
                }, [
                  h('option', { value: 'junior' }, '初级（默认，答对爬升）'),
                  h('option', { value: 'mid' }, '中级'),
                  h('option', { value: 'senior' }, '高级'),
                  h('option', { value: '' }, '不限级别'),
                ]),
              ]),
              h('p', { className: 'upcv-hint', style: { margin: '0' } }, '从起点难度开始，连续答对 2 题自动解锁更难一档；选「不限级别」则全档随机不爬升。'),
            ]),
            // ── 主 CTA ──
            h('div', { className: 'upcv-cta-row', key: 'cta' }, [
              h('button', {
                className: 'upcv-btn upcv-btn-primary',
                onClick: startPractice,
                disabled: loading,
              }, loading ? '出题中...' : '开始练习（不限题数）'),
              h('span', { className: 'upcv-hint' }, '随时可结束出轻量小结；答错权重升高、答对衰减。'),
            ]),
          ]),

          mode === 'interview' && h('div', { key: 'interview-panel', className: 'upcv-config' }, [
          h('div', { className: 'upcv-src-grid', key: 'sources' }, sourceCards.map((card) => h('button', {
            key: card.key,
            type: 'button',
            className: 'upcv-src' + (srcType === card.key ? ' on' : ''),
            disabled: card.disabled,
            'aria-pressed': srcType === card.key ? 'true' : 'false',
            onClick: () => { setSrcType(card.key); setError(''); },
          }, [
            h('span', { className: 'upcv-src-title' }, Icon(card.icon), card.title),
            h('span', { className: 'upcv-src-desc' }, card.desc),
          ]))),

          srcType === 'jd' && h('div', { key: 'jd-form', className: 'upcv-config-card' }, [
            jobs === null && h('div', { className: 'upcv-skeleton', style: { height: '34px', marginBottom: '10px' } }),
            jobs !== null && h('select', {
              className: 'upcv-input upcv-input-sm', value: jobId,
              onChange: (e) => setJobId(e.target.value), 'aria-label': '选择岗位库里的岗位',
              style: { marginBottom: '10px' },
            },
              h('option', { value: '' }, jobList.length === 0 ? '岗位库为空——先去岗位页整理收件箱' : '从岗位库选择（可选）'),
              jobList.map((job) => h('option', { key: job.id, value: job.id },
                String(job.title ?? '') + ' · ' + String(job.company ?? '')))),
            jobs !== null && jobList.length === 0 && h('div', { style: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' } }, [
              h('span', { className: 'upcv-hint' }, '岗位库当前为空：真实检索还没跑过。可以先整理收件箱，或直接粘贴 JD 出题。'),
              h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', onClick: () => guardedNavigate('jobs') }, '去岗位页'),
            ]),
            h('textarea', {
              className: 'upcv-input',
              placeholder: '或粘贴岗位 JD 原文（与库内岗位二选一即可）...',
              value: jdText,
              onChange: (e) => setJdText(e.target.value),
              style: { minHeight: '90px', marginBottom: '10px', resize: 'vertical', lineHeight: '1.7' },
            }),
          ]),

          srcType === 'resume' && h('div', { key: 'resume-form', className: 'upcv-config-card' }, [
            h('select', {
              className: 'upcv-input upcv-input-sm', value: resumeId,
              onChange: (e) => setResumeId(e.target.value), 'aria-label': '选择简历',
              style: { marginBottom: '10px' },
            },
              h('option', { value: '' }, '选择一份已保存的简历'),
              resumes.items.map((record) => h('option', { key: record.id, value: record.id },
                String(record.title ?? '未命名简历') + (record.data && record.data.basics ? ' · ' + String(record.data.basics.name ?? '') : '')))),
          ]),

          tagOptions.length > 0 && h('div', { key: 'tags' }, [
            h('p', { className: 'upcv-hint', style: { marginBottom: '6px' } }, '可选：按知识点标签过滤（选项来自所选题源的数据）'),
            h('div', null, tagOptions.map((tag) => h('button', {
              key: tag, type: 'button',
              className: 'upcv-chip' + (tagSel.includes(tag) ? ' on' : ''),
              'aria-pressed': tagSel.includes(tag) ? 'true' : 'false',
              onClick: () => setTagSel((current) => (current.includes(tag) ? current.filter((item) => item !== tag) : current.concat([tag]))),
            }, tag))),
          ]),

          h('div', { className: 'upcv-cta-row' }, [
            h('button', {
              className: 'upcv-btn upcv-btn-primary',
              onClick: startAdaptiveInterview,
              disabled: loading,
            }, loading ? '出题中...' : '开始面试（逐知识点 · 自适应深度）'),
            h('span', { className: 'upcv-hint' }, '答对加深、答错转浅；随时可跳知识点或结束。'),
          ]),
          ]),

          interviews.items.length > 0 && h('div', { className: 'upcv-card', key: 'history' }, [
            h('h4', { className: 'upcv-card-title' }, '历史面试记录（' + interviews.items.length + '）'),
            interviews.items.map((record) => {
              const legacy = record === null || typeof record !== 'object' || record.status === undefined;
              const wip = record !== null && record !== undefined && record.status === 'in-progress';
              return h('div', { key: record.id, className: 'upcv-hist' }, [
                h('div', { style: { flex: '1', minWidth: '0' } }, [
                  h('div', { className: 'upcv-hist-title' },
                    (record.jobTitle || '未命名')
                    + (legacy ? '' : ' · ' + (record.status === 'done' ? '已完成' : record.status === 'abandoned' ? '已放弃' : '进行中'))
                    + ' · 综合 ' + ((record.report && record.report.overall) || '—')),
                  h('div', { className: 'upcv-muted', style: { fontSize: '11px' } },
                    formatTime(record.updatedAt) + ' · ' + ((record.transcript || []).length) + ' 题'
                    + (legacy ? '（旧版记录）' : '')),
                ]),
                !wip && record.report && h('button', { type: 'button', className: 'upcv-mini', onClick: () => { setReport(record.report || null); setSession(record); setStage('report'); } }, '查看'),
                h('button', { type: 'button', className: 'upcv-mini danger', onClick: () => storeDelete('interviews', record.id).then(() => interviews.reload()).catch(() => {}) }, '删除'),
              ]);
            }),
          ]),
        ]),

        stage === 'question' && current && h('div', { key: 'question' }, [
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' } }, [
            h('span', { className: 'upcv-tag' }, current.isFollowUp ? '追问' : mode === 'practice' ? '第 ' + viewed + ' 题 · 自由练习' : '面试 · ' + ivPointLabel()),
            mode === 'practice' && h('span', { className: 'upcv-pill', style: { fontSize: '12px' } }, practiceBandLabel()),
            h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap' } }, [
              current.isReplay === true && h('span', { className: 'upcv-pill accent' }, current.source === 'bank' ? '重练' : '错题回流'),
              current.variantOf && h('span', { className: 'upcv-pill' }, '变体题 · 同考点换问法'),
              h('span', { className: 'upcv-pill' }, '真题风格模拟，非真实题库'),
            ]),
          ]),
          serverSource === 'local-bank' && h(Notice, null, '题目来自内置题库（按标签就近匹配）' + (notice ? '：' + notice : '')),
          current.isFollowUp && current.reason ? h(Notice, null, '面试官想深挖：' + current.reason) : null,
          error !== '' && h(Notice, { tone: 'error' }, error),
          (Array.isArray(current.tags) && current.tags.length > 0) && h('div', { style: { marginBottom: '10px' } },
            current.tags.map((tag, i) => h('span', { className: 'upcv-chip', key: i }, tag))),
          h('h3', { style: { fontSize: '17px', fontWeight: '600', marginBottom: '12px', lineHeight: '1.6' } }, current.question),
          h('textarea', {
            className: 'upcv-input',
            placeholder: '直接输入回答...',
            value: answer,
            onChange: (e) => setAnswer(e.target.value),
            style: { minHeight: '130px', marginBottom: '12px', resize: 'vertical', lineHeight: '1.7' },
          }),
          h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' } }, [
            h('span', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-secondary)' } },
              mode === 'practice' ? '已答 ' + transcript.length + ' 题 · 随时可结束' : '已答 ' + transcript.length + ' 题 · 随时可结束出总结'),
            h('div', { style: { display: 'flex', gap: '8px' } }, [
              mode === 'practice' && h('button', { className: 'upcv-btn upcv-btn-secondary', onClick: endPractice, disabled: loading }, '结束练习'),
              mode === 'interview' && h('button', { className: 'upcv-btn upcv-btn-secondary', onClick: endInterviewSummaryWith(iv === null ? { topics: [], index: 0, stats: [], askedIds: [] } : iv), disabled: loading }, '结束面试'),
              h('button', { className: 'upcv-btn upcv-btn-primary', onClick: submitAnswer, disabled: loading }, loading ? '面试官思考中...' : '提交回答'),
            ]),
          ]),

          // ── 用户自判（无模型，或模型没给出可用判定）──
          awaitUserJudge && h('div', { className: 'upcv-verdict', key: 'selfjudge' }, [
            h('div', { className: 'upcv-verdict-head' },
              h('span', { style: { fontWeight: '700' } }, '这题你认为自己答得如何？'),
              h('span', { className: 'upcv-hint' }, aiReady ? 'AI 没能给出判定，由你自判（可与要点对照）' : '无模型模式：由你对照参考要点自判')),
            h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, judgeOptions.map((v) => h('button', {
              key: v, type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm',
              disabled: loading, onClick: () => judgeAsUser(v),
            }, VERDICT_LABEL[v]))),
          ]),

          // ── 判定结果 + 改判（对/部分/错，judgedBy:user 为终局）──
          !awaitUserJudge && showJudge && lastEntry !== null && lastEntry.verdict !== null && lastEntry.verdict !== undefined && h('div', { className: 'upcv-verdict', key: 'verdict' }, [
            h('div', { className: 'upcv-verdict-head' }, [
              h('span', { className: 'upcv-verdict-mark ' + lastEntry.verdict.verdict }, VERDICT_LABEL[lastEntry.verdict.verdict] ?? lastEntry.verdict.verdict),
              h('span', { style: { fontWeight: '700' } }, lastEntry.verdict.verdict === 'pass' ? '要点基本覆盖' : '未完全覆盖'),
              h('span', { className: 'upcv-hint' }, lastEntry.verdict.judgedBy === 'ai' ? 'AI 对照要点判定' : '你的判定（终局）'),
            ]),
            (Array.isArray(lastEntry.verdict.hitPoints) && lastEntry.verdict.hitPoints.length > 0) && h('div', null, [
              h('p', { className: 'upcv-hint', style: { margin: '0 0 4px', fontWeight: '600' } }, '命中要点：'),
              h('ul', { className: 'upcv-verdict-points pass' }, lastEntry.verdict.hitPoints.map((point, i) => h('li', { key: i }, point))),
            ]),
            (Array.isArray(lastEntry.verdict.missedPoints) && lastEntry.verdict.missedPoints.length > 0) && h('div', null, [
              h('p', { className: 'upcv-hint', style: { margin: '0 0 4px', fontWeight: '600' } }, '缺失要点：'),
              h('ul', { className: 'upcv-verdict-points' }, lastEntry.verdict.missedPoints.map((point, i) => h('li', { key: i }, point))),
            ]),
            (typeof lastEntry.verdict.betterApproach === 'string' && lastEntry.verdict.betterApproach.trim() !== '') && h('div', { className: 'upcv-notice', style: { marginTop: '8px' } }, [
              h('span', { style: { fontWeight: '700', marginRight: '6px' } }, Icon('lightbulb'), '更优做法：'),
              lastEntry.verdict.betterApproach,
            ]),
            lastEntry.verdict.verdict !== 'pass' && h('p', { className: 'upcv-hint' }, '本题已计入题库（权重更高，之后会多练）；答对几次后会自动淡出。'),
            h('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' } }, [
              h('span', { className: 'upcv-hint' }, '改判：'),
              judgeOptions.map((v) => h('button', {
                key: v, type: 'button',
                className: 'upcv-mini' + (lastEntry.verdict.verdict === v ? ' on' : ''),
                disabled: loading, onClick: () => judgeAsUser(v),
              }, VERDICT_LABEL[v])),
              mode === 'practice' && h('button', {
                type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', style: { marginLeft: 'auto' },
                disabled: loading, onClick: endPractice,
              }, '结束练习'),
              mode === 'interview' && h('button', {
                type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', style: { marginLeft: 'auto' },
                disabled: loading, onClick: ivSkipPoint,
              }, '下一个知识点'),
              mode === 'interview' && h('button', {
                type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm',
                disabled: loading, onClick: endInterviewSummaryWith(iv === null ? { topics: [], index: 0, stats: [], askedIds: [] } : iv),
              }, '结束面试'),
              h('button', {
                type: 'button', className: 'upcv-btn upcv-btn-primary upcv-btn-sm',
                style: mode === 'interview' ? {} : { marginLeft: 'auto' },
                disabled: loading, onClick: () => advance(),
              }, '下一题'),
            ]),
          ]),
        ]),

        stage === 'report' && report !== null && report.interviewSummary === true && h('div', { key: 'iv-report' }, [
          h('div', { className: 'upcv-page-head' },
            h('h2', { className: 'upcv-page-title' }, '面试总结'),
            h('p', { className: 'upcv-page-desc' }, (report.jobTitle || '模拟面试') + ' · 覆盖 ' + report.points.length + ' 个知识点 · 共答 ' + report.total + ' 题')),
          h('div', { className: 'upcv-card' }, [
            h('h4', { className: 'upcv-card-title' }, '知识点结论'),
            report.points.map((slot, i) => h('div', { key: i, style: { padding: '10px 0', borderBottom: '1px solid var(--dsw-alias-border-l4)' } }, [
              h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' } }, [
                h('span', { className: 'upcv-verdict-mark ' + (slot.conclusion === 'mastered' ? 'pass' : slot.conclusion === 'weak' ? 'fail' : slot.conclusion === 'ok' ? 'partial' : ''), style: { fontSize: '14px' } },
                  slot.conclusion === 'mastered' ? '掌握住' : slot.conclusion === 'weak' ? '需巩固' : slot.conclusion === 'ok' ? '基本过' : '未覆盖'),
                h('span', { style: { fontWeight: '700', flex: '1', minWidth: '0' } }, slot.topic),
                h('span', { className: 'upcv-hint' }, slot.asked + ' 题 · 对 ' + slot.pass + ' / 部分 ' + slot.partial + ' / 错 ' + slot.fail),
              ]),
              slot.missed.length > 0 && h('p', { className: 'upcv-hint', style: { margin: '4px 0 0' } }, '缺失：' + slot.missed.join('；')),
              slot.better.length > 0 && h('p', { className: 'upcv-hint', style: { margin: '2px 0 0' } }, '更优做法：' + slot.better.join('；')),
            ])),
          ]),
          h(Notice, { key: 'hint' }, '判错的题已进入题库高权重区，之后练习会自动多出现；薄弱知识点也可以去题库与复盘页针对性查看。'),
          h('div', { style: { display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' } }, [
            h('button', { className: 'upcv-btn upcv-btn-primary', onClick: () => { setReport(null); setSession(null); setIv(null); setCurrent(null); setStage('select'); } }, '再来一轮'),
            h('button', { className: 'upcv-btn upcv-btn-secondary', onClick: () => onNavigate('bank') }, '去题库与复盘'),
            h('button', { className: 'upcv-btn upcv-btn-ghost', onClick: generateAiReport, disabled: loading }, loading ? '生成中...' : '生成 AI 综合评分（可选）'),
          ]),
        ]),

        stage === 'report' && report !== null && report.practice === true && h('div', { key: 'practice-report' }, [
          h('div', { className: 'upcv-page-head' },
            h('h2', { className: 'upcv-page-title' }, '练习小结'),
            h('p', { className: 'upcv-page-desc' }, (session?.jobTitle ?? '自由练习') + ' · 共答 ' + report.total + ' 题')),
          h('div', { className: 'upcv-card' }, [
            h('h4', { className: 'upcv-card-title' }, '判定分布'),
            h('p', { className: 'upcv-kv' },
              '对 ' + report.dist.pass + ' · 部分 ' + report.dist.partial + ' · 错 ' + report.dist.fail
              + (report.dist.unjudged > 0 ? ' · 未判 ' + report.dist.unjudged : '')
              + '　（权重已按判定更新：答错的题之后会多练）'),
          ]),
          report.weakItems.length > 0 && h('div', { className: 'upcv-card' }, [
            h('h4', { className: 'upcv-card-title' }, '这次待复盘（' + report.weakItems.length + ' 题）'),
            report.weakItems.map((item, i) => h('div', { key: i, style: { padding: '8px 0', borderBottom: '1px solid var(--dsw-alias-border-l4)' } }, [
              h('p', { style: { margin: '0 0 4px', fontWeight: '600' } }, [
                h('span', { className: 'upcv-verdict-mark ' + item.verdict, style: { marginRight: '8px' } }, VERDICT_LABEL[item.verdict] ?? ''),
                item.question,
              ]),
              item.missedPoints.length > 0 && h('p', { className: 'upcv-hint', style: { margin: '0' } }, '缺失：' + item.missedPoints.join('；')),
              item.betterApproach !== '' && h('p', { className: 'upcv-hint', style: { margin: '4px 0 0' } }, '更优做法：' + item.betterApproach),
            ])),
          ]),
          h(Notice, { key: 'hint' }, '错题不用专门回来刷：它们的权重更高，之后练习会自动多出现；连续答对后会自然淡出。'),
          h('div', { style: { display: 'flex', gap: '10px', marginTop: '16px' } }, [
            h('button', { className: 'upcv-btn upcv-btn-primary', onClick: () => { setReport(null); setSession(null); setCurrent(null); setStage('select'); } }, '再来一轮'),
            h('button', { className: 'upcv-btn upcv-btn-secondary', onClick: () => onNavigate('bank') }, '去题库与复盘'),
          ]),
        ]),

        stage === 'report' && !(report !== null && report.practice === true) && h('div', { key: 'report' }, [
          h('div', { className: 'upcv-page-head' },
            h('h2', { className: 'upcv-page-title' }, t('interview_report')),
            session !== null && h('p', { className: 'upcv-page-desc' }, (session.jobTitle || '') + ' · 共 ' + total + ' 题')),
          notice !== '' && h(Notice, null, notice),
          error !== '' && h(Notice, { tone: 'error' }, error),
          loading && h('p', { className: 'upcv-muted' }, '正在评估你的作答...'),
          report && h('div', null, [
            h('div', { style: { textAlign: 'center', marginBottom: '20px' } }, [
              h('div', { style: { fontSize: '48px', fontWeight: '900', color: 'var(--dsw-alias-brand-primary)', lineHeight: '1.1' } }, String(report.overall)),
              h('p', { style: { color: 'var(--dsw-alias-label-secondary)', margin: '4px 0 0' } }, t('interview_score')),
            ]),
            h('div', { className: 'upcv-card' }, [
              scoreRow('表达', report.communication),
              scoreRow('专业', report.professionalism),
              scoreRow('逻辑', report.logic),
            ]),
            report.verdictDist !== null && report.verdictDist !== undefined && h('div', { className: 'upcv-card' }, [
              h('h4', { className: 'upcv-card-title' }, '判定分布'),
              h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, [
                h('span', { className: 'upcv-pill' }, '对 ' + Number(report.verdictDist.pass ?? 0)),
                h('span', { className: 'upcv-pill' }, '部分 ' + Number(report.verdictDist.partial ?? 0)),
                h('span', { className: 'upcv-pill' }, '错 ' + Number(report.verdictDist.fail ?? 0)),
                Number(report.verdictDist.unjudged ?? 0) > 0 && h('span', { className: 'upcv-pill' }, '未判定 ' + Number(report.verdictDist.unjudged ?? 0)),
              ]),
            ]),
            (Array.isArray(report.weakTags) && report.weakTags.length > 0) && h('div', { className: 'upcv-card' }, [
              h('h4', { className: 'upcv-card-title' }, '薄弱知识点（按错题聚合）'),
              report.weakTags.map((slot, i) => h('div', { className: 'upcv-weak-row', key: i }, [
                h('span', { className: 'upcv-weak-tag' }, slot.tag),
                h('div', { className: 'upcv-weak-bar' }, h('span', { style: { width: Math.round((Number(slot.missed ?? 0) / Math.max(1, Number(slot.total ?? 1))) * 100) + '%' } })),
                h('span', { className: 'upcv-hint', style: { flex: 'none' } }, slot.missed + '/' + slot.total + ' 题未过'),
              ])),
            ]),
            (report.strengths || []).length > 0 && h('div', { className: 'upcv-card' }, [
              h('h4', { className: 'upcv-card-title' }, '做得好的地方'),
              h('ul', { className: 'upcv-list' }, report.strengths.map((item, i) => h('li', { key: i }, item))),
            ]),
            (report.suggestions || []).length > 0 && h('div', { className: 'upcv-card' }, [
              h('h4', { className: 'upcv-card-title' }, t('interview_feedback')),
              h('ul', { className: 'upcv-list' }, report.suggestions.map((item, i) => h('li', { key: i }, item))),
            ]),
            transcript.length > 0 && h('div', { className: 'upcv-card' }, [
              h('h4', { className: 'upcv-card-title' }, '逐题回顾'),
              transcript.map((item, i) => h('div', { key: String(item.questionId ?? i), style: { marginBottom: '12px', paddingBottom: '10px', borderBottom: '1px solid var(--dsw-alias-border-l2)' } }, [
                h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px', flexWrap: 'wrap' } }, [
                  h('span', { className: 'upcv-hint' }, '第 ' + (i + 1) + ' 题'),
                  item.isReplay === true && h('span', { className: 'upcv-pill accent' }, '回流'),
                  item.verdict !== null && item.verdict !== undefined && h('span', { className: 'upcv-verdict-mark ' + item.verdict.verdict, style: { fontSize: '13px' } }, VERDICT_LABEL[item.verdict.verdict] ?? ''),
                ]),
                h('p', { style: { fontSize: '13px', fontWeight: '600', margin: '0 0 4px', lineHeight: '1.6' } }, item.question),
                h('p', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', margin: '0', lineHeight: '1.6' } }, item.answer),
                (item.followUps || []).map((fu, j) => h('div', { key: j, style: { marginTop: '6px', paddingLeft: '10px', borderLeft: '2px solid var(--dsw-alias-border-l2)' } }, [
                  h('p', { style: { fontSize: '12px', color: 'var(--dsw-alias-label-tertiary)', margin: '0 0 2px' } }, '追问：' + fu.question),
                  h('p', { style: { fontSize: '13px', color: 'var(--dsw-alias-label-secondary)', margin: '0', lineHeight: '1.6' } }, fu.answer),
                ])),
                (item.verdict !== null && item.verdict !== undefined && Array.isArray(item.verdict.missedPoints) && item.verdict.missedPoints.length > 0) &&
                  h('p', { className: 'upcv-req-note miss' }, '缺失：' + item.verdict.missedPoints.join('；')),
                (report.perQuestion || []).filter((pq) => pq.index === i + 1).map((pq, j) => h('p', { key: j, className: 'upcv-req-note' }, '点评：' + pq.comment)),
              ])),
            ]),
          ]),
          h('button', { className: 'upcv-btn upcv-btn-primary', style: { width: '100%', marginTop: '16px' }, onClick: reset }, '再来一轮'),
        ]),
      ]);
    }
    // ========== 岗位：真实检索（0.14.0 内建采集器 + 紧凑行列表） ==========
    // 闭环（docs/JOBS-FEED-PLAN.md 第 11 节）：页头「查询」拉起采集器 → 采集器按 spec 检索并写 feed →
    // 「整理收件箱」摄取去重入库 → 本地筛选 → 行内「定制」直通 JD 对齐 / 直链去平台人工投递。
    // 整条链路不依赖 LLM；布局依据 .ui-review/jobs-layout-proposal.html。

    const JOB_STATUS_LABEL = { new: '待投', applied: '已投', dismissed: '不感兴趣' };
    const JOB_SOURCE_LABEL = { shixiseng: '实习僧', liepin: '猎聘' };
    const SOURCE_STATE_LABEL = { ok: '已登录', expired: '登录失效', unknown: '未检查', 'no-auth': '无需登录', disabled: '已停用' };
    const SALARY_FLOORS = [0, 6000, 10000, 15000, 20000];
    const JOB_STATUS_FILTERS = [
      { key: 'all', label: '全部' },
      { key: 'new', label: '待投' },
      { key: 'applied', label: '已投' },
      { key: 'dismissed', label: '不感兴趣' },
    ];

    function jobSourceLabel(id) {
      const key = String(id ?? '');
      return JOB_SOURCE_LABEL[key] !== undefined ? JOB_SOURCE_LABEL[key] : (key !== '' ? key : '未知渠道');
    }

    /** salaryRange → 紧凑月薪（≈ 5.4~8.7K/月）；区间不完整就返回空串，不猜。 */
    function salaryShort(range) {
      if (range === null || range === undefined || !Number.isFinite(range.min) || !Number.isFinite(range.max)) return '';
      const k = (value) => {
        const n = Math.round((value / 1000) * 10) / 10;
        return String(n).replace(/\.0$/, '');
      };
      return '≈ ' + k(range.min) + '~' + k(range.max) + 'K/月';
    }

    /** 收录时间：今天/昨天 HH:mm，更早显示日期；解析不了返回空串。 */
    function relativeTime(iso, now) {
      if (typeof iso !== 'string' || iso === '') return '';
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return '';
      const base = now instanceof Date && !Number.isNaN(now.getTime()) ? now : new Date();
      const pad = (n) => String(n).padStart(2, '0');
      const hhmm = pad(date.getHours()) + ':' + pad(date.getMinutes());
      const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
      if (sameDay(date, base)) return '今天 ' + hhmm;
      const yesterday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - 1);
      if (sameDay(date, yesterday)) return '昨天 ' + hhmm;
      const sameYear = date.getFullYear() === base.getFullYear();
      return (sameYear ? '' : date.getFullYear() + '-') + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + hhmm;
    }

    /**
     * 岗位 → JD 对齐页的预填参数（纯函数，便于单测）。
     * 只预填目标岗位标题；JD 原文仍由用户从直链页复制粘贴（v1 不抓 JD 正文）。
     */
    function jdPresetFromJob(job) {
      const record = job !== null && typeof job === 'object' ? job : {};
      return {
        jobId: typeof record.id === 'string' ? record.id : '',
        targetJob: String(record.title ?? '').trim(),
        company: String(record.company ?? '').trim(),
        sourceUrl: typeof record.sourceUrl === 'string' ? record.sourceUrl : '',
      };
    }

    /** 紧凑岗位行：职位/公司 · 薪资 · 城市 · 来源 · 收录时间 · 状态三按钮 · 定制 · 直链。 */
    function JobRow({ job, onStatus, onCustom }) {
      const record = job === null || typeof job !== 'object' ? {} : job;
      const url = typeof record.sourceUrl === 'string' ? record.sourceUrl : '';
      const title = String(record.title ?? '') !== '' ? String(record.title) : '（无标题）';
      const company = String(record.company ?? '') !== '' ? String(record.company) : '未知公司';
      const status = JOB_STATUS_LABEL[record.status] !== undefined ? record.status : 'new';
      const sourceId = String(record.source ?? '');
      const mark = (value) => (onStatus instanceof Function ? () => onStatus(record.id, value) : undefined);
      const custom = onCustom instanceof Function && typeof record.id === 'string' ? () => onCustom(record.id) : undefined;
      const short = salaryShort(record.salaryRange);
      const rawSalary = String(record.salary ?? '').trim();
      const primarySalary = rawSalary !== '' ? rawSalary : (short !== '' ? short.replace('≈ ', '') : '面议');
      return h('article', { className: 'upcv-jobrow' + (status === 'dismissed' ? ' is-dim' : '') }, [
        h('div', { className: 'upcv-jobrow-main', key: 'main' }, [
          h('span', { className: 'upcv-jobrow-title', title: title, key: 't' }, title),
          h('span', { className: 'upcv-jobrow-company', title: company, key: 'c' }, company),
        ]),
        h('div', { className: 'upcv-jobrow-salary', key: 'salary' }, [
          h('span', { key: 'raw' }, primarySalary),
          rawSalary !== '' && short !== '' ? h('small', { key: 'norm' }, short) : null,
        ]),
        h('span', { className: 'upcv-jobrow-city', key: 'city' }, String(record.cityNorm ?? record.city ?? '') || '—'),
        h('span', { className: 'upcv-jobrow-src is-' + (sourceId === '' ? 'unknown' : sourceId), key: 'src' }, jobSourceLabel(sourceId)),
        h('span', { className: 'upcv-jobrow-time', key: 'time' }, relativeTime(record.collectedAt) || '—'),
        h('div', { className: 'upcv-jobrow-seg', role: 'group', 'aria-label': '投递状态', key: 'seg' },
          Object.keys(JOB_STATUS_LABEL).map((value) => h('button', {
            key: value,
            type: 'button',
            className: 'is-' + value,
            'aria-pressed': status === value ? 'true' : 'false',
            onClick: mark(value),
          }, JOB_STATUS_LABEL[value]))),
        custom !== undefined
          ? h('button', { className: 'upcv-jobrow-custom', type: 'button', key: 'custom', onClick: custom, title: '用这条岗位定制简历：跳 JD 对齐并预填目标岗位' }, Icon('file-search'), '定制')
          : null,
        url !== ''
          ? h('a', { className: 'upcv-jobrow-link', key: 'link', href: url, target: '_blank', rel: 'noopener noreferrer', title: '在新窗口打开原始岗位页', 'aria-label': '打开职位页：' + title }, Icon('external-link'))
          : h('span', { className: 'upcv-jobrow-link is-disabled', key: 'link', 'aria-hidden': 'true' }, Icon('external-link')),
      ]);
    }

    function JobsPage({ onBack, onCustom }) {
      const [jobs, setJobs] = React.useState(null); // null = 还在读岗位库
      const [spec, setSpec] = React.useState(null);
      const [keyword, setKeyword] = React.useState('');
      const [ingesting, setIngesting] = React.useState(false);
      const [ingestStats, setIngestStats] = React.useState(null);
      const [starting, setStarting] = React.useState(false);
      const [collect, setCollect] = React.useState({ installed: null, status: null });
      const [collectUnavailable, setCollectUnavailable] = React.useState(false);
      const [collectError, setCollectError] = React.useState('');
      const [kw, setKw] = React.useState('');
      const [sourceSel, setSourceSel] = React.useState([]);
      const [minSalary, setMinSalary] = React.useState(0);
      const [statusFilter, setStatusFilter] = React.useState('all');
      const [copied, setCopied] = React.useState(false);
      const [error, setError] = React.useState('');
      const [doneNotice, setDoneNotice] = React.useState('');
      const copyTimer = React.useRef(null);
      const doneTimer = React.useRef(null);
      const prevCollect = React.useRef(null);
      const [sourcesOpen, setSourcesOpen] = React.useState(false);
      const [sourcesData, setSourcesData] = React.useState(null);
      const [sourcesLoading, setSourcesLoading] = React.useState(false);
      const [sourcesBusy, setSourcesBusy] = React.useState('');
      const [sourcesError, setSourcesError] = React.useState('');
      const [sourcesNote, setSourcesNote] = React.useState('');

      // 完成提示：面板内提示条 + 系统通知（有权限时）。失败不影响界面。
      const notifyDone = (body) => {
        try {
          if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
          new Notification('岗位检索完成', { body: body });
        } catch { /* 通知不是关键路径 */ }
      };

      const loadSources = React.useCallback(() => {
        setSourcesLoading(true);
        return apiGet('/jobs/sources')
          .then((data) => { setSourcesData(data); setSourcesError(''); })
          .catch((e) => setSourcesError((e && e.message) || '读取检索源失败。'))
          .finally(() => setSourcesLoading(false));
      }, []);

      const openSources = () => {
        setSourcesOpen(true);
        setSourcesNote('');
        setSourcesError('');
        loadSources();
      };

      const checkOne = async (id) => {
        setSourcesBusy('check:' + id);
        setSourcesNote('');
        setSourcesError('');
        try {
          const data = await apiPost('/jobs/sources/check', { id: id });
          const result = Array.isArray(data.results) ? data.results[0] : null;
          if (result !== null && result !== undefined) {
            setSourcesNote('检查完成：' + (SOURCE_STATE_LABEL[result.state] ?? result.state) + (result.note ? ' · ' + result.note : ''));
          } else {
            setSourcesNote('检查完成');
          }
          await loadSources();
        } catch (e) {
          setSourcesError((e && e.message) || '检查失败。');
        } finally {
          setSourcesBusy('');
        }
      };

      const checkAllSources = async () => {
        setSourcesBusy('check:all');
        setSourcesNote('');
        setSourcesError('');
        try {
          const data = await apiPost('/jobs/sources/check', {});
          const results = Array.isArray(data.results) ? data.results : [];
          const ok = results.filter((item) => item.state === 'ok').length;
          setSourcesNote('检查完成：' + ok + ' / ' + results.length + ' 个源可用');
          await loadSources();
        } catch (e) {
          setSourcesError((e && e.message) || '检查失败。');
        } finally {
          setSourcesBusy('');
        }
      };

      const loginSource = async (id) => {
        setSourcesBusy('login:' + id);
        setSourcesNote('');
        setSourcesError('');
        try {
          const data = await apiPost('/jobs/sources/login', { id: id });
          setSourcesNote('已打开登录标签（' + String(data.url ?? '') + '）；登录完成后点「检查」。');
        } catch (e) {
          setSourcesError((e && e.message) || '无法打开登录窗口。');
        } finally {
          setSourcesBusy('');
        }
      };

      const loadFeed = React.useCallback(() => apiGet('/jobs/feed')
        .then((data) => { setJobs(Array.isArray(data.items) ? data.items : []); setError(''); })
        .catch((e) => { setJobs([]); setError((e && e.message) || '读取岗位库失败。'); }), []);

      const refreshCollect = React.useCallback(() => apiGet('/jobs/collect/status')
        .then((data) => {
          setCollectUnavailable(false);
          const status = data !== null && data !== undefined && data.status !== undefined ? data.status : null;
          const previous = prevCollect.current;
          setCollect({
            installed: data !== null && data !== undefined && data.installed === true,
            status: status,
          });
          // 从「检索中」翻到「完成」这一帧：刷新列表 + 提示 + 系统通知
          if (status !== null && typeof status === 'object' && status.state === 'done'
            && previous !== null && previous !== undefined && previous.state === 'running') {
            const ingested = status.ingested !== null && typeof status.ingested === 'object' ? status.ingested : {};
            const notice = '检索完成：新增 ' + Number(status.addedLines ?? 0) + ' 行，已自动入库 ' + Number(ingested.added ?? 0) + ' 条'
              + (Number(ingested.duplicates ?? 0) > 0 ? '（重复 ' + Number(ingested.duplicates) + '）' : '');
            setDoneNotice(status.message ? notice + ' · ' + String(status.message) : notice);
            setIngestStats(null); // 清掉「整理收件箱」的旧统计，避免自动入库后又看到「收件箱为空」
            loadFeed();
            notifyDone(notice);
            if (doneTimer.current !== null) clearTimeout(doneTimer.current);
            doneTimer.current = setTimeout(() => setDoneNotice(''), 8000);
          }
          prevCollect.current = status;
        })
        .catch(() => { setCollectUnavailable(true); }), [loadFeed]);

      React.useEffect(() => {
        loadFeed();
        apiGet('/jobs/spec')
          .then((data) => {
            if (data && data.spec !== null && typeof data.spec === 'object') {
              setSpec(data.spec);
              const defaults = data.spec.defaults !== null && typeof data.spec.defaults === 'object' ? data.spec.defaults : {};
              setKeyword((current) => (current === '' && Array.isArray(defaults.keywords) ? defaults.keywords.join(' ') : current));
            }
          })
          .catch(() => { /* spec 读不到不挡列表：指令用空关键词占位 */ });
        refreshCollect();
        return () => {
          if (copyTimer.current !== null) clearTimeout(copyTimer.current);
          if (doneTimer.current !== null) clearTimeout(doneTimer.current);
        };
      }, []);

      const collectStatus = collect.status !== null && typeof collect.status === 'object' ? collect.status : null;
      const collectState = collectStatus !== null ? collectStatus.state : null;
      // 只在检索中轮询：每 2 秒读一次状态文件，结束即停（不制造无意义流量）
      React.useEffect(() => {
        if (collectState !== 'running') return undefined;
        const timer = setInterval(refreshCollect, 2000);
        return () => clearInterval(timer);
      }, [collectState, refreshCollect]);

      const defaults = spec !== null && spec.defaults !== null && typeof spec.defaults === 'object' ? spec.defaults : {};
      const city = typeof defaults.city === 'string' ? defaults.city : '';
      const command = keyword.trim() === '' ? '/jobs-collect' : '/jobs-collect ' + keyword.trim();

      const copyCommand = async () => {
        try {
          if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
            await navigator.clipboard.writeText(command);
          } else {
            const area = document.createElement('textarea');
            area.value = command;
            document.body.appendChild(area);
            area.select();
            document.execCommand('copy');
            area.remove();
          }
          setCopied(true);
          if (copyTimer.current !== null) clearTimeout(copyTimer.current);
          copyTimer.current = setTimeout(() => setCopied(false), 1600);
        } catch (e) {
          setError('复制失败，请手动选中指令文本复制。');
        }
      };

      const startQuery = async () => {
        setCollectError('');
        setError('');
        setDoneNotice('');
        setStarting(true);
        // 系统通知是可选增强：没权限就只用面板内提示条
        try {
          if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
            Notification.requestPermission().catch(() => {});
          }
        } catch { /* 忽略 */ }
        try {
          const data = await apiPost('/jobs/collect', { keyword: keyword.trim() });
          const status = data !== null && data !== undefined && data.status !== undefined ? data.status : null;
          prevCollect.current = status;
          setCollect({ installed: true, status: status !== null ? status : { state: 'running', mode: 'session' } });
        } catch (e) {
          const payload = e !== null && e !== undefined ? e.data : null;
          if (payload !== null && payload !== undefined && payload.error === 'login-required') {
            setSourcesOpen(true);
            setSourcesNote('先把检索源登录好，再点「查询」。');
            loadSources();
          }
          setCollectError((e && e.message) || '启动检索失败。');
          refreshCollect();
        } finally {
          setStarting(false);
        }
      };

      const ingest = async () => {
        setError('');
        setIngesting(true);
        try {
          const data = await apiPost('/jobs/ingest', {});
          setIngestStats(data);
          await loadFeed();
        } catch (e) {
          setError((e && e.message) || '整理收件箱失败。');
        } finally {
          setIngesting(false);
        }
      };

      const markStatus = async (id, status) => {
        try {
          await apiPost('/jobs/status', { id: id, status: status });
          setJobs((current) => (Array.isArray(current) ? current.map((job) => (job && job.id === id ? { ...job, status: status } : job)) : current));
        } catch (e) {
          setError((e && e.message) || '状态更新失败。');
        }
      };

      // 本地筛选：关键词（title/company/tags）、来源（多选，空=全部）、薪资下限、状态
      const list = Array.isArray(jobs) ? jobs : [];
      const sources = [...new Set(list.map((job) => (job !== null && typeof job === 'object' ? String(job.source ?? '') : '')).filter((id) => id !== ''))].sort();
      const activeSources = sourceSel.length === 0 ? sources : sourceSel;
      const kwLower = kw.trim().toLowerCase();
      const floor = Number(minSalary) || 0;
      const filtered = list.filter((job) => {
        const record = job === null || typeof job !== 'object' ? {} : job;
        const status = JOB_STATUS_LABEL[record.status] !== undefined ? record.status : 'new';
        if (statusFilter !== 'all' && status !== statusFilter) return false;
        if (activeSources.length > 0 && !activeSources.includes(String(record.source ?? ''))) return false;
        if (floor > 0) {
          const range = record.salaryRange;
          if (range === null || range === undefined || !Number.isFinite(range.min) || range.min < floor) return false;
        }
        if (kwLower !== '') {
          const tags = Array.isArray(record.tags) ? record.tags : [];
          const hay = [record.title, record.company].concat(tags).map((part) => String(part ?? '')).join(' ').toLowerCase();
          if (!hay.includes(kwLower)) return false;
        }
        return true;
      });
      const toggleSource = (id) => {
        setSourceSel((current) => {
          const base = current.length === 0 ? sources : current;
          const next = base.includes(id) ? base.filter((item) => item !== id) : base.concat(id);
          return next.length === sources.length ? [] : next; // 全选归一成空集合（= 不限）
        });
      };

      const latest = list.reduce((max, job) => {
        const ts = Date.parse(job !== null && typeof job === 'object' ? job.collectedAt : '');
        return Number.isNaN(ts) ? max : Math.max(max, ts);
      }, Number.NaN);
      const latestText = Number.isNaN(latest) ? '' : relativeTime(new Date(latest).toISOString());

      const collectLine = (() => {
        if (collectStatus === null) return null;
        const state = collectStatus.state;
        const when = relativeTime(collectStatus.finishedAt || collectStatus.startedAt);
        const sessionMode = collectStatus.mode === 'session';
        if (state === 'running') {
          const parts = ['检索中'];
          if (sessionMode) {
            const title = typeof collectStatus.sessionTitle === 'string' && collectStatus.sessionTitle !== ''
              ? collectStatus.sessionTitle
              : ('岗位检索 · ' + String(collectStatus.keyword ?? '默认关键词'));
            parts.push('后台会话「' + title + '」');
          } else {
            if (typeof collectStatus.channel === 'string' && collectStatus.channel !== '') parts.push(jobSourceLabel(collectStatus.channel));
            if (Number(collectStatus.page) > 0) parts.push('第 ' + Number(collectStatus.page) + ' 页');
          }
          if (Number(collectStatus.addedLines) > 0) parts.push('已写入 ' + Number(collectStatus.addedLines) + ' 行');
          return { tone: 'run', text: parts.join(' · ') };
        }
        if (state === 'done') {
          if (sessionMode) {
            const ingested = collectStatus.ingested !== null && typeof collectStatus.ingested === 'object' ? collectStatus.ingested : null;
            const stored = ingested !== null ? Number(ingested.added ?? 0) : 0;
            const duplicates = ingested !== null ? Number(ingested.duplicates ?? 0) : 0;
            return {
              tone: 'ok',
              text: '上次查询：完成 · 新增 ' + Number(collectStatus.addedLines ?? 0) + ' 行'
                + ' · 已自动入库 ' + stored + ' 条' + (duplicates > 0 ? '（重复 ' + duplicates + '）' : '')
                + (when !== '' ? ' · ' + when : ''),
            };
          }
          return { tone: 'ok', text: '上次查询：完成 · 新增 ' + Number(collectStatus.addedLines ?? 0) + ' 行 feed' + (when !== '' ? ' · ' + when : '') + ' · 点「整理收件箱」入库' };
        }
        if (state === 'error') {
          return { tone: 'err', text: '上次查询失败：' + String(collectStatus.message || collectStatus.error || '未知原因') + (when !== '' ? ' · ' + when : '') };
        }
        return null;
      })();

      const statsText = (stats) => {
        if (stats === null || typeof stats !== 'object') return '';
        const parts = [
          '新增 ' + Number(stats.added ?? 0) + ' 条',
          '重复命中 ' + Number(stats.duplicates ?? 0) + ' 条',
          '丢弃（无链接）' + Number(stats.dropped ?? 0) + ' 条',
          '坏行 ' + Number(stats.badLines ?? 0) + ' 条',
        ];
        if (Number(stats.trimmed ?? 0) > 0) parts.push('超出容量裁剪最旧待投 ' + Number(stats.trimmed) + ' 条');
        return parts.join(' · ');
      };

      const installed = collect.installed === true;
      const notInstalled = collect.installed === false;
      const running = collectState === 'running';
      const queryDisabled = installed !== true || running || starting;
      const statusOf = (job) => (job !== null && typeof job === 'object' && JOB_STATUS_LABEL[job.status] !== undefined ? job.status : 'new');
      const pendingCount = filtered.filter((job) => statusOf(job) === 'new').length;
      // 首次进入：岗位库或采集器状态还没读到 → 骨架屏（不要先闪一下「未安装」这种假结论）
      const booting = jobs === null || (list.length === 0 && collect.installed === null && !running && !collectUnavailable);

      return h('div', { className: 'upcv-page upcv-page-jobs' }, [
        h('button', { className: 'upcv-back', type: 'button', key: 'back', onClick: onBack }, Icon('arrow-left'), '返回'),

        // ── 页头：标题 + 数据截至 + 整理（次）/ 查询（主）──
        h('div', { className: 'upcv-jobs-head', key: 'head' }, [
          h('div', { className: 'upcv-jobs-head-main', key: 'main' }, [
            h('h2', { className: 'upcv-page-title', key: 'title' }, '岗位'),
            latestText !== '' ? h('span', { className: 'upcv-pill', key: 'asof' }, '数据截至 ' + latestText) : null,
          ]),
          h('div', { className: 'upcv-jobs-head-actions', key: 'actions' }, [
            h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', key: 'sources', onClick: openSources },
              Icon('external-link'), '检索源'),
            h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary', key: 'ingest', onClick: ingest, disabled: ingesting || running },
              Icon('inbox'), ingesting ? '整理中…' : '整理收件箱'),
            h('button', {
              type: 'button', className: 'upcv-btn upcv-btn-primary', key: 'query', onClick: startQuery, disabled: queryDisabled,
              title: installed !== true
                ? '检索不可用：宿主没有会话服务，且未安装采集器'
                : running ? '检索中，请等这一轮结束' : '开一个后台会话，让 agent 用浏览器检索真实岗位（城市取 spec 默认值）',
            }, Icon('search'), running ? '检索中…' : starting ? '启动中…' : '查询'),
          ]),
        ]),

        // ── 检索条：常驻单行（关键词 + 指令预览 + 复制）；城市不在界面输入 ──
        h('section', { className: 'upcv-jobs-search', key: 'search', 'aria-label': '检索指令' }, [
          h('label', { className: 'upcv-jobs-field', key: 'kw' }, '关键词',
            h('input', {
              className: 'upcv-input upcv-input-sm upcv-jobs-kw', key: 'input',
              value: keyword, placeholder: '如：前端 / Java 后端',
              onChange: (e) => setKeyword(e.target.value), 'aria-label': '检索关键词',
            })),
          h('code', { className: 'upcv-jobs-cmd', key: 'cmd', title: command }, command),
          h('button', {
            type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm upcv-jobs-copy', key: 'copy',
            onClick: copyCommand, title: '复制检索指令（粘贴到 ZCode 或 Codex）', 'aria-label': '复制检索指令',
          }, Icon(copied ? 'check' : 'copy')),
          copied ? h('span', { className: 'upcv-jobs-copied', key: 'copied', role: 'status' }, '已复制') : null,
        ]),

        // ── 状态小字：上次查询 / 检索中 / 失败 / 未安装 / 城市来源 ──
        h('p', { className: 'upcv-jobs-lastline', key: 'last' }, [
          collectLine !== null ? h('span', { key: 'state', className: collectLine.tone === 'ok' ? 'upcv-jobs-ok' : collectLine.tone === 'err' ? 'upcv-jobs-err' : '' }, collectLine.text) : null,
          collectError !== '' ? h('span', { key: 'cerr', className: 'upcv-jobs-err' }, collectError) : null,
          notInstalled
            ? h('span', { key: 'miss' }, '未安装采集器：在插件目录运行 ', h('code', { key: 'code' }, 'node scripts/setup-collector.mjs'), ' 后重启面板；也可以继续复制指令到 ZCode 检索。')
            : null,
          (collectLine !== null || collectError !== '') && installed && city !== '' ? h('span', { key: 'sep', 'aria-hidden': 'true' }, '·') : null,
          installed && city !== '' ? h('span', { key: 'city' }, '城市取 spec 默认值：' + city + '（不在界面输入）') : null,
          collectUnavailable
            ? h('span', { key: 'readfail', className: 'upcv-jobs-err' }, '读取检索状态失败：重启面板后重试（仍可复制指令到 ZCode 检索）。')
            : null,
          collectLine === null && collectError === '' && installed
            ? h('span', { key: 'none' }, '还没有查询记录：点右上角「查询」开一个后台会话检索，或复制指令到 ZCode 执行。')
            : null,
        ]),

        doneNotice !== '' && h(Notice, { key: 'done', icon: 'check' }, doneNotice),

        ingestStats !== null && statsText(ingestStats) !== '' && h('p', { className: 'upcv-hint upcv-jobs-stats', key: 'stats' }, statsText(ingestStats)),
        ingestStats !== null && Array.isArray(ingestStats.warnings) && ingestStats.warnings.length > 0 && h(Notice, { key: 'ingestwarn' }, ingestStats.warnings[0]),
        error !== '' && h(Notice, { key: 'err', tone: 'error' }, error),

        // ── 吸顶筛选栏：关键词 / 来源 / 薪资下限 / 状态 / 计数 ──
        h('div', { className: 'upcv-jobs-filterbar', key: 'filter', 'aria-label': '筛选' }, [
          h('label', { className: 'upcv-jobs-field', key: 'kw' }, Icon('search'),
            h('input', {
              className: 'upcv-input upcv-input-sm upcv-jobs-filterkw', key: 'input',
              placeholder: '过滤职位 / 公司 / 标签', value: kw,
              onChange: (e) => setKw(e.target.value), 'aria-label': '按关键词筛选',
            })),
          sources.length > 0 ? h('div', { className: 'upcv-jobs-fgroup', key: 'gsrc' }, [
            h('span', { className: 'upcv-jobs-flabel', key: 'label' }, '来源'),
            ...sources.map((id) => h('button', {
              key: 'src-' + id, type: 'button',
              className: 'upcv-chip' + (activeSources.includes(id) ? ' on' : ''),
              onClick: () => toggleSource(id),
              'aria-pressed': activeSources.includes(id) ? 'true' : 'false',
            }, jobSourceLabel(id))),
          ]) : null,
          h('div', { className: 'upcv-jobs-fgroup', key: 'gpay' }, [
            h('span', { className: 'upcv-jobs-flabel', key: 'label' }, '薪资下限'),
            h('select', {
              className: 'upcv-input upcv-input-sm upcv-jobs-floor', key: 'floor',
              value: String(floor), onChange: (e) => setMinSalary(Number(e.target.value)),
              'aria-label': '按薪资下限筛选',
            }, SALARY_FLOORS.map((value) => h('option', { key: value, value: String(value) }, value === 0 ? '不限' : Math.round(value / 1000) + 'K'))),
          ]),
          h('div', { className: 'upcv-jobs-fgroup', key: 'gstatus' }, [
            h('span', { className: 'upcv-jobs-flabel', key: 'label' }, '状态'),
            ...JOB_STATUS_FILTERS.map((item) => h('button', {
              key: 'status-' + item.key, type: 'button',
              className: 'upcv-chip' + (statusFilter === item.key ? ' on' : ''),
              onClick: () => setStatusFilter(item.key),
              'aria-pressed': statusFilter === item.key ? 'true' : 'false',
            }, item.label)),
          ]),
          h('span', { className: 'upcv-jobs-count', key: 'count' }, jobs === null ? '' : '共 ' + filtered.length + ' 条 · 待投 ' + pendingCount),
        ]),

        // ── 列表 / 四态（检索中 / 空 / 未安装 / 无匹配）──
        booting && h('div', { key: 'loading' }, [
          h('div', { className: 'upcv-skeleton', key: 'a', style: { height: '56px', marginBottom: '8px' } }),
          h('div', { className: 'upcv-skeleton', key: 'b', style: { height: '56px' } }),
        ]),
        jobs !== null && running && list.length === 0 && h('div', { key: 'running' }, [
          h('div', { className: 'upcv-skeleton', key: 'a', style: { height: '56px', marginBottom: '8px' } }),
          h('div', { className: 'upcv-skeleton', key: 'b', style: { height: '56px' } }),
          h('p', { className: 'upcv-hint', key: 'hint', style: { marginTop: '12px' } },
            '正在检索：' + (collectLine !== null ? collectLine.text : '已启动会话') + '。完成后会自动入库。'),
        ]),
        jobs !== null && filtered.length > 0 && h('div', { className: 'upcv-jobs-list', key: 'list' },
          filtered.map((job) => h(JobRow, { key: job && job.id, job: job, onStatus: markStatus, onCustom: onCustom }))),
        jobs !== null && !running && list.length === 0 && notInstalled && h('div', { className: 'upcv-empty', key: 'notinstalled' }, [
          h('div', { className: 'upcv-empty-icon', key: 'icon' }, Icon('inbox', 'lg')),
          h('div', { className: 'upcv-empty-title', key: 'title' }, '还没安装检索采集器'),
          h('p', { className: 'upcv-empty-desc', key: 'desc' }, '安装后点右上角「查询」，会用 headed 浏览器按 spec 里的渠道检索真实岗位；也可以继续复制上面的指令到 ZCode 检索。'),
          h('code', { className: 'upcv-jobs-cmdblock', key: 'cmd' }, 'node scripts/setup-collector.mjs'),
          h('p', { className: 'upcv-hint', key: 'hint' }, '采集器和 Playwright 只装在数据目录，不进插件依赖；装好后重启面板。'),
        ]),
        jobs !== null && !running && list.length === 0 && installed !== false && h('div', { className: 'upcv-empty', key: 'empty' }, [
          h('div', { className: 'upcv-empty-icon', key: 'icon' }, Icon('briefcase', 'lg')),
          h('div', { className: 'upcv-empty-title', key: 'title' }, '还没有真实检索岗位'),
          h('p', { className: 'upcv-empty-desc', key: 'desc' }, '点「查询」开一个后台会话检索一轮，完成后会自动入库；之后就能在这里筛选、定制、投递。'),
          h('div', { className: 'upcv-empty-actions', key: 'actions' },
            h('button', { type: 'button', className: 'upcv-btn upcv-btn-primary', onClick: startQuery, disabled: queryDisabled }, Icon('search'), '查询')),
        ]),
        jobs !== null && list.length > 0 && filtered.length === 0 && h('p', { className: 'upcv-muted', key: 'nomatch' }, '没有匹配当前筛选的岗位，放宽条件试试。'),
        sourcesOpen && h('div', { className: 'upcv-modal-mask', key: 'sources-modal', onClick: () => setSourcesOpen(false) },
          h('div', {
            className: 'upcv-modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': '检索源',
            onClick: (event) => event.stopPropagation(),
          }, [
            h('div', { className: 'upcv-modal-head', key: 'head' }, [
              h('h3', { key: 'title' }, '检索源'),
              h('button', { key: 'close', type: 'button', className: 'upcv-modal-close', onClick: () => setSourcesOpen(false), 'aria-label': '关闭' }, Icon('x')),
            ]),
            h('p', { className: 'upcv-hint', key: 'hint' }, '「登录」会打开一个独立标签页，登完点「检查」；查询前会自动复查，失效的源会被跳过。'),
            sourcesNote !== '' ? h(Notice, { key: 'note', icon: 'check' }, sourcesNote) : null,
            sourcesError !== '' ? h(Notice, { key: 'err', tone: 'error' }, sourcesError) : null,
            sourcesLoading
              ? h('p', { className: 'upcv-hint', key: 'loading' }, '读取中…')
              : h('div', { className: 'upcv-sources', key: 'list' },
                (sourcesData !== null && Array.isArray(sourcesData.sources) ? sourcesData.sources : []).map((source) => {
                  const status = source.status !== null && typeof source.status === 'object' ? source.status : { state: 'unknown' };
                  const label = SOURCE_STATE_LABEL[status.state] !== undefined ? SOURCE_STATE_LABEL[status.state] : '未检查';
                  const busy = sourcesBusy !== '';
                  return h('div', { className: 'upcv-source-row', key: source.id }, [
                    h('div', { className: 'upcv-source-main', key: 'main' }, [
                      h('strong', { key: 'name' }, jobSourceLabel(source.id)),
                      h('span', { className: 'upcv-source-entry', key: 'entry', title: source.entry }, source.entry),
                      typeof status.note === 'string' && status.note !== '' ? h('span', { className: 'upcv-source-note', key: 'note' }, status.note) : null,
                      typeof status.checkedAt === 'string' && status.checkedAt !== '' ? h('span', { className: 'upcv-source-note', key: 'at' }, '检查于 ' + formatTime(status.checkedAt)) : null,
                    ]),
                    h('span', { className: 'upcv-source-state is-' + String(status.state), key: 'state' }, label),
                    h('div', { className: 'upcv-source-actions', key: 'actions' }, [
                      source.enabled === true && source.hasAuth === true
                        ? h('button', { key: 'login', type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', disabled: busy, onClick: () => loginSource(source.id) }, '登录')
                        : null,
                      source.enabled === true && source.hasAuth === true
                        ? h('button', { key: 'check', type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', disabled: busy, onClick: () => checkOne(source.id) }, '检查')
                        : null,
                      source.enabled !== true ? h('span', { key: 'off', className: 'upcv-hint' }, '已停用') : null,
                    ]),
                  ]);
                })),
            h('div', { className: 'upcv-modal-foot', key: 'foot' }, [
              h('button', { key: 'all', type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', disabled: sourcesBusy !== '', onClick: checkAllSources }, '检查全部'),
              h('span', { key: 'tip', className: 'upcv-hint' }, '检查失败只跳过该源，不挡查询'),
            ]),
          ])),
      ]);
    }

    // ========== JD 对齐 ==========    // ========== JD 对齐 ==========
    function JdPage({ t, onBack, aiStatus, preset }) {
      const [jdText, setJdText] = React.useState('');
      const [targetJob, setTargetJob] = React.useState('');
      const [resumeText, setResumeText] = React.useState('');
      const [result, setResult] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [error, setError] = React.useState('');
      const history = useHistory('jd');
      const [presetJob, setPresetJob] = React.useState(null);

      // 岗位页「定制」直通：按 jobId 读岗位库，预填目标岗位，并给出直链让用户自己复制 JD 原文
      React.useEffect(() => {
        const jobId = preset !== null && preset !== undefined && typeof preset.jobId === 'string' ? preset.jobId : '';
        if (jobId === '') return undefined;
        let alive = true;
        apiGet('/jobs/feed')
          .then((data) => {
            if (!alive) return;
            const job = (Array.isArray(data.items) ? data.items : []).find((item) => item !== null && typeof item === 'object' && item.id === jobId);
            if (job === undefined) return;
            const fill = jdPresetFromJob(job);
            setPresetJob(fill);
            setTargetJob((current) => (current === '' ? fill.targetJob : current));
          })
          .catch(() => { /* 岗位库读不到就当作没有预填，不影响手动粘贴 JD */ });
        return () => { alive = false; };
      }, [preset]);

      // 用最近一份已保存的简历预填，省得每次重新粘贴
      React.useEffect(() => {
        storeList('resumes')
          .then((data) => {
            const latest = (data.items || [])[0];
            if (latest !== undefined) setResumeText((current) => (current === '' ? resumeToPlainText(latest.data) : current));
          })
          .catch(() => {});
      }, []);

      const align = async () => {
        if (jdText.trim() === '') { setError('请先粘贴岗位 JD 原文。'); return; }
        setError('');
        setLoading(true);
        try {
          const data = await apiPost('/jd/align', { jdText: jdText, targetJob: targetJob, resumeText: resumeText });
          setResult(data.alignment);
          storeSave('jd', {
            targetJob: data.alignment.targetJob,
            jdText: jdText,
            resumeText: resumeText,
            alignment: data.alignment,
          }).then(() => history.reload()).catch(() => {});
        } catch (e) {
          setError((e && e.message) || '对齐失败，请重试。');
        } finally {
          setLoading(false);
        }
      };

      const requirementRows = (alignment) => (alignment.requirements || []).map((requirement) => {
        const cover = (alignment.coverage || []).find((item) => item.requirementId === requirement.id) || { matched: false, evidence: '', suggestion: '' };
        return h('div', { className: 'upcv-req', key: requirement.id }, [
          h('div', { className: 'upcv-req-head' }, [
            h('span', { className: 'upcv-req-mark ' + (cover.matched ? 'ok' : 'miss') }, cover.matched ? '✓' : '✗'),
            h('span', { className: 'upcv-req-text' }, requirement.text),
            h('span', { className: 'upcv-chip' + (requirement.type === 'must' ? ' on' : '') }, requirement.type === 'must' ? '硬性' : '加分'),
          ]),
          (requirement.keywords || []).length > 0 && h('div', { style: { marginTop: '6px' } }, requirement.keywords.map((keyword, i) => h('span', { className: 'upcv-chip', key: i }, keyword))),
          cover.evidence !== '' && h('p', { className: 'upcv-req-note' }, '简历原文：' + cover.evidence),
          cover.suggestion !== '' && h('p', { className: 'upcv-req-note miss' }, '建议：' + cover.suggestion),
        ]);
      });

      return h('div', { className: 'upcv-page' }, [
        h('div', { className: 'upcv-back', onClick: onBack }, '← 返回'),
        h('h2', { style: { fontSize: '20px', fontWeight: '800', marginBottom: '8px' } }, 'JD 对齐'),
        h('p', { className: 'upcv-muted', style: { marginBottom: '16px', fontSize: '13px', lineHeight: '1.7' } },
          '把岗位 JD 原文贴进来，AI 会拆成可核对的要求，逐条判断你的简历是否覆盖，并列出 ATS 关键词缺口。'),

        !(aiStatus && aiStatus.available === true) && h('div', { className: 'upcv-notice' }, '⚠️ 本机没有可调用的模型，无法做 JD 对齐。请到 DSH 设置里确认模型。'),
        error !== '' && h('div', { className: 'upcv-error' }, '❌ ' + error),

        presetJob !== null && h('div', { className: 'upcv-jdsrc', key: 'preset' }, [
          h('span', { className: 'upcv-pill accent', key: 'pill' }, '来自岗位库'),
          h('span', { className: 'upcv-jdsrc-title', key: 'title' }, presetJob.targetJob !== '' ? presetJob.targetJob : '未命名岗位'),
          presetJob.company !== '' ? h('span', { className: 'upcv-jdsrc-company', key: 'company' }, presetJob.company) : null,
          presetJob.sourceUrl !== '' ? h('a', { className: 'upcv-jdsrc-link', key: 'link', href: presetJob.sourceUrl, target: '_blank', rel: 'noopener noreferrer' }, Icon('external-link'), '打开职位页复制 JD') : null,
          h('p', { className: 'upcv-hint', key: 'hint' }, 'JD 原文需要你从上面的直链复制后粘贴到下面（采集器只收岗位列表，不抓 JD 正文）。'),
        ]),
        h('input', { className: 'upcv-input', placeholder: '目标岗位（可选，如：产品经理）', value: targetJob, onChange: (e) => setTargetJob(e.target.value), style: { marginBottom: '10px' } }),
        h('textarea', { className: 'upcv-input', placeholder: '粘贴岗位 JD 原文...', value: jdText, onChange: (e) => setJdText(e.target.value), style: { minHeight: '150px', marginBottom: '10px', resize: 'vertical', lineHeight: '1.7' } }),
        h('textarea', { className: 'upcv-input', placeholder: '简历 / 经历内容（已自动填入最近一份简历，可改）', value: resumeText, onChange: (e) => setResumeText(e.target.value), style: { minHeight: '130px', marginBottom: '12px', resize: 'vertical', lineHeight: '1.7' } }),
        h('button', { className: 'upcv-btn upcv-btn-primary', style: { width: '100%' }, onClick: align, disabled: loading || !(aiStatus && aiStatus.available === true) }, loading ? '对齐中...' : '🎯 开始对齐'),

        result !== null && h('div', { style: { marginTop: '20px' } }, [
          h('div', { className: 'upcv-card' }, [
            h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '10px', marginBottom: '6px' } }, [
              h('span', { style: { fontSize: '34px', fontWeight: '900', color: 'var(--dsw-alias-brand-primary)', lineHeight: '1' } }, String(result.atsScore)),
              h('span', { className: 'upcv-muted' }, 'ATS 对齐分 · 命中 ' + result.stats.matched + '/' + result.stats.total + ' 条要求'),
            ]),
            result.summary !== '' && h('p', { style: { fontSize: '13px', lineHeight: '1.7', margin: '6px 0 0' } }, result.summary),
          ]),

          (result.keywordMisses || []).length > 0 && h('div', { className: 'upcv-card' }, [
            h('h4', { className: 'upcv-card-title' }, '⚠️ JD 有、简历缺的关键词'),
            h('div', null, result.keywordMisses.map((keyword, i) => h('span', { className: 'upcv-chip miss', key: i }, keyword))),
          ]),
          (result.keywordHits || []).length > 0 && h('div', { className: 'upcv-card' }, [
            h('h4', { className: 'upcv-card-title' }, '✅ 已覆盖的关键词'),
            h('div', null, result.keywordHits.map((keyword, i) => h('span', { className: 'upcv-chip on', key: i }, keyword))),
          ]),

          h('div', { className: 'upcv-card' }, [
            h('h4', { className: 'upcv-card-title' }, '逐条要求核对'),
            requirementRows(result),
          ]),

          (result.rewriteSuggestions || []).length > 0 && h('div', { className: 'upcv-card' }, [
            h('h4', { className: 'upcv-card-title' }, '💡 针对这份 JD 的改写建议'),
            h('ul', { className: 'upcv-list' }, result.rewriteSuggestions.map((item, i) => h('li', { key: i }, item))),
          ]),
        ]),

        history.items.length > 0 && h('div', { className: 'upcv-card', style: { marginTop: '20px' } }, [
          h('h4', { className: 'upcv-card-title' }, '📁 历史对齐记录（' + history.items.length + '）'),
          history.items.map((record) => h('div', { key: record.id, className: 'upcv-hist' }, [
            h('div', { style: { flex: '1', minWidth: '0' } }, [
              h('div', { className: 'upcv-hist-title' }, (record.targetJob || '未命名') + ' · ATS ' + ((record.alignment && record.alignment.atsScore) || 0)),
              h('div', { className: 'upcv-muted', style: { fontSize: '11px' } }, formatTime(record.updatedAt)),
            ]),
            h('button', { className: 'upcv-mini', onClick: () => { setResult(record.alignment); setJdText(record.jdText || ''); setResumeText(record.resumeText || ''); setTargetJob(record.targetJob || ''); } }, '查看'),
            h('button', { className: 'upcv-mini', onClick: () => storeDelete('jd', record.id).then(history.reload).catch(() => {}) }, '删除'),
          ])),
        ]),
      ]);
    }

    // ========== 题库与复盘（interview V3，docs/INTERVIEW-V3-PLAN.md §8）==========
    // 列表/筛选/详情/改判/标记掌握/移出 + 手动录入。
    // 数据走 /bank/list；操作走 /bank/verdict（改判重算 weight，judgedBy:user 是终局）；
    // 手动录入走 store 通用路由（questions 已入白名单，origin.source=user）。
    const BANK_LEVEL_LABEL = { junior: '初级', mid: '中级', senior: '高级' };
    const BANK_KIND_LABEL = { concept: '概念', mechanism: '原理', practice: '实践', scenario: '场景' };
    const BANK_VIEW_LABEL = { review: '待复盘', mastered: '已掌握', all: '全部' };

    /** 掌握度 → 状态徽标：weight 是题库抽样的出现权重，衰减到底≈已掌握。 */
    function bankMasteryState(item) {
      const weight = Number(item && item.mastery && item.mastery.weight);
      if (!Number.isFinite(weight)) return { label: '未练过', cls: '' };
      if (weight <= 0.06) return { label: '已掌握', cls: 'pass' };
      if (weight >= 3) return { label: '重点多练', cls: 'fail' };
      return { label: '学习中', cls: 'partial' };
    }

    function BankPage({ t, onBack, aiStatus }) {
      const [items, setItems] = React.useState([]);
      const [total, setTotal] = React.useState(0);
      const [loading, setLoading] = React.useState(true);
      const [error, setError] = React.useState('');
      const [notice, setNotice] = React.useState('');
      const [view, setView] = React.useState('all');
      const [level, setLevel] = React.useState('');
      const [kind, setKind] = React.useState('');
      const [topic, setTopic] = React.useState('');
      const [q, setQ] = React.useState('');
      const [limit, setLimit] = React.useState(50);
      const [expandedId, setExpandedId] = React.useState(null);
      const [showManual, setShowManual] = React.useState(false);
      const [manual, setManual] = React.useState({ text: '', tags: '', essentials: '', bestPractice: '', level: 'mid', kind: 'concept' });
      const [manualBusy, setManualBusy] = React.useState(false);
      const [showExpand, setShowExpand] = React.useState(false);
      const [expand, setExpand] = React.useState({ topics: '', level: '', count: 8 });
      const [expandStatus, setExpandStatus] = React.useState(null); // GET /bank/status 的 queue

      const query = React.useCallback(() => {
        const params = new URLSearchParams();
        if (view !== '') params.set('view', view);
        if (level !== '') params.set('level', level);
        if (kind !== '') params.set('kind', kind);
        if (topic !== '') params.set('topic', topic);
        if (q.trim() !== '') params.set('q', q.trim());
        params.set('limit', String(limit));
        setLoading(true);
        apiGet('/bank/list?' + params.toString())
          .then((data) => {
            setItems(Array.isArray(data.items) ? data.items : []);
            setTotal(Number(data.total) || 0);
            setError('');
          })
          .catch((e) => { setError((e && e.message) || '题库读取失败。'); setItems([]); setTotal(0); })
          .finally(() => setLoading(false));
      }, [view, level, kind, topic, q, limit]);
      React.useEffect(() => { query(); }, [query]);

      // 筛选项从当前结果聚合（服务端不读死词表，界面同理）
      const topicOptions = [...new Set(items
        .flatMap((item) => (Array.isArray(item.topic) ? item.topic : []))
        .map((tag) => String(tag ?? '').trim())
        .filter((tag) => tag !== ''))].sort();

      /** 单题操作（verdict/master/remove）统一走 /bank/verdict。 */
      const act = async (id, payload, okMessage) => {
        setError('');
        try {
          await apiPost('/bank/verdict', { id: id, ...payload });
          if (okMessage !== '') setNotice(okMessage);
          query();
        } catch (e) {
          setError((e && e.message) || '操作失败，请重试。');
        }
      };
      const judge = (id, verdict) => act(id, { action: 'verdict', verdict: verdict }, '已改判，出现权重已按新判定重算。');
      const master = (id) => act(id, { action: 'master' }, '已标记掌握，这题之后会很少出现。');
      const removeQ = (id) => act(id, { action: 'remove' }, '已从题库移出。');

      const submitManual = async () => {
        const text = manual.text.trim();
        if (text === '') { setError('请填写题目。'); return; }
        setError('');
        setManualBusy(true);
        try {
          await storeSave('questions', {
            text: text,
            points: {
              essentials: manual.essentials.split('\n').map((s) => s.trim()).filter((s) => s !== ''),
              bestPractice: manual.bestPractice.split('\n').map((s) => s.trim()).filter((s) => s !== ''),
            },
            topic: manual.tags.split(/[、,，;；\s]+/).map((s) => s.trim()).filter((s) => s !== ''),
            level: manual.level,
            kind: manual.kind,
            scope: 'general',
            origin: { source: 'user', via: 'manual' },
            mastery: { seen: 0, pass: 0, partial: 0, fail: 0, streak: 0, weight: 1, lastSeenAt: 0, history: [] },
            status: 'active',
          });
          setManual({ text: '', tags: '', essentials: '', bestPractice: '', level: 'mid', kind: 'concept' });
          setShowManual(false);
          setNotice('已录入题库。');
          query();
        } catch (e) {
          setError((e && e.message) || '录入失败，请重试。');
        } finally {
          setManualBusy(false);
        }
      };

      /** 后台扩充：进生成队列，不阻塞页面。 */
      const submitExpand = async () => {
        const topics = expand.topics.split(/[、,，;；\s]+/).map((s) => s.trim()).filter((s) => s !== '');
        if (topics.length === 0) { setError('请输入至少一个知识点标签。'); return; }
        setError('');
        try {
          const data = await apiPost('/bank/generate', { mode: 'expand', topics: topics, level: expand.level, count: expand.count });
          setExpandStatus(data.status ?? null);
          setNotice('已在后台补充题目（' + topics.join('、') + ' ' + expand.count + ' 题）：生成完成后刷新即可看到。');
        } catch (e) {
          setError((e && e.message) || '扩充任务提交失败。');
        }
      };

      const pollStatus = React.useCallback(() => {
        apiGet('/bank/status')
          .then((data) => { if (data && data.queue) setExpandStatus(data.queue); })
          .catch(() => {});
      }, []);
      // 队列在跑时每 3 秒刷新一次状态
      React.useEffect(() => {
        if (expandStatus === null || expandStatus.running !== true) return undefined;
        const timer = setTimeout(pollStatus, 3000);
        return () => clearTimeout(timer);
      }, [expandStatus, pollStatus]);

      const viewChips = [
        { key: 'review', label: BANK_VIEW_LABEL.review },
        { key: 'mastered', label: BANK_VIEW_LABEL.mastered },
        { key: 'all', label: BANK_VIEW_LABEL.all },
      ];
      const levelOptions = [
        { key: '', label: '全部级别' },
        { key: 'junior', label: '初级' },
        { key: 'mid', label: '中级' },
        { key: 'senior', label: '高级' },
      ];
      const kindOptions = [
        { key: '', label: '全部题型' },
        { key: 'concept', label: '概念' },
        { key: 'mechanism', label: '原理' },
        { key: 'practice', label: '实践' },
        { key: 'scenario', label: '场景' },
      ];

      return h('div', { className: 'upcv-page' }, [
        h('button', { className: 'upcv-back', type: 'button', key: 'back', onClick: onBack }, Icon('arrow-left'), '返回'),
        h('div', { className: 'upcv-page-head', key: 'head' },
          h('h2', { className: 'upcv-page-title' }, '题库与复盘'),
          h('p', { className: 'upcv-page-desc' }, '面试里出过的题都沉淀在这里。答错的题权重更高、出现更频繁；答对几次后权重衰减、自然淡出——不用专门刷错题，练着练着就会了。')
        ),

        error !== '' && h(Notice, { key: 'err', tone: 'error' }, error),
        notice !== '' && h(Notice, { key: 'notice' }, notice),

        h('div', { className: 'upcv-filter-bar', key: 'filters' }, [
          viewChips.map((chip) => h('button', {
            key: chip.key, type: 'button',
            className: 'upcv-chip' + (view === chip.key ? ' on' : ''),
            onClick: () => { setView(chip.key); setLimit(50); },
          }, chip.label)),
          h('select', {
            className: 'upcv-input upcv-input-sm', value: level,
            onChange: (e) => { setLevel(e.target.value); setLimit(50); }, 'aria-label': '按级别筛选',
            style: { width: 'auto', minWidth: '96px' },
          }, levelOptions.map((opt) => h('option', { key: opt.key, value: opt.key }, opt.label))),
          h('select', {
            className: 'upcv-input upcv-input-sm', value: kind,
            onChange: (e) => { setKind(e.target.value); setLimit(50); }, 'aria-label': '按题型筛选',
            style: { width: 'auto', minWidth: '96px' },
          }, kindOptions.map((opt) => h('option', { key: opt.key, value: opt.key }, opt.label))),
          topicOptions.length > 0 && h('select', {
            className: 'upcv-input upcv-input-sm', value: topic,
            onChange: (e) => { setTopic(e.target.value); setLimit(50); }, 'aria-label': '按标签筛选',
            style: { width: 'auto', minWidth: '110px' },
          },
            h('option', { value: '' }, '全部标签'),
            topicOptions.map((tag) => h('option', { key: tag, value: tag }, tag))),
          h('input', {
            className: 'upcv-input upcv-input-sm', value: q, placeholder: '搜题干…',
            onChange: (e) => setQ(e.target.value), 'aria-label': '搜索题干',
            style: { width: 'auto', minWidth: '120px', flex: '1' },
          }),
          h('span', { className: 'upcv-filter-count' }, items.length + ' / ' + total + ' 题'),
        ]),

        h('div', { className: 'upcv-actions upcv-actions-block', key: 'actions' }, [
          h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', onClick: () => setShowManual(!showManual), 'aria-expanded': showManual ? 'true' : 'false' },
            Icon(showManual ? 'chevron-down' : 'file-plus'), '手动录入题目'),
          h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', onClick: () => setShowExpand(!showExpand), 'aria-expanded': showExpand ? 'true' : 'false' },
            Icon(showExpand ? 'chevron-down' : 'sparkles'), '让 AI 补充题目'),
        ]),

        expandStatus !== null && (expandStatus.running === true || expandStatus.pending > 0) && h(Notice, { key: 'queue', style: { marginTop: '8px' } },
          '题库生成队列：' + (expandStatus.running === true ? '生成中' : '排队中') + (expandStatus.pending > 0 ? '，还有 ' + expandStatus.pending + ' 个任务' : '') + '，完成后自动入库。'),
        expandStatus !== null && expandStatus.running !== true && expandStatus.pending === 0 && expandStatus.lastError !== '' && h(Notice, { key: 'queue-err', tone: 'error' }, '上次生成失败：' + expandStatus.lastError),

        showExpand && h('div', { className: 'upcv-card', key: 'expand' }, [
          h('p', { className: 'upcv-hint', style: { marginTop: '0' } }, '按知识点在后台批量生成新题（覆盖概念/原理/实践/场景深度阶梯，自动去重入库）。需要可用模型。'),
          h('input', { className: 'upcv-input', placeholder: '知识点标签（如：缓存架构、事件循环，顿号/空格分隔）', value: expand.topics, onChange: (e) => setExpand({ ...expand, topics: e.target.value }), style: { marginBottom: '8px' } }),
          h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '10px' } }, [
            h('select', { className: 'upcv-input upcv-input-sm', value: expand.level, onChange: (e) => setExpand({ ...expand, level: e.target.value }), 'aria-label': '难度级别', style: { width: 'auto' } },
              h('option', { value: '' }, '不限级别'),
              h('option', { value: 'junior' }, '初级'),
              h('option', { value: 'mid' }, '中级'),
              h('option', { value: 'senior' }, '高级')),
            [8, 12].map((n) => h('button', { key: n, type: 'button', className: 'upcv-chip' + (expand.count === n ? ' on' : ''), onClick: () => setExpand({ ...expand, count: n }) }, n + ' 题')),
            h('button', { type: 'button', className: 'upcv-btn upcv-btn-primary upcv-btn-sm', onClick: submitExpand, disabled: expand.topics.trim() === '' }, '加入生成队列'),
          ]),
        ]),

        showManual && h('div', { className: 'upcv-card', key: 'manual' }, [
          h('p', { className: 'upcv-hint', style: { marginTop: '0' } }, '把你拿不准的题记进题库（初始权重正常，答错会自动加权）：标签用顿号或空格分隔，参考要点每行一条。'),
          h('textarea', { className: 'upcv-input', placeholder: '题目（必填）', value: manual.text, onChange: (e) => setManual({ ...manual, text: e.target.value }), style: { minHeight: '60px', marginBottom: '8px', resize: 'vertical' } }),
          h('input', { className: 'upcv-input', placeholder: '标签（可选，如：事件循环、Promise）', value: manual.tags, onChange: (e) => setManual({ ...manual, tags: e.target.value }), style: { marginBottom: '8px' } }),
          h('textarea', { className: 'upcv-input', placeholder: '判定要点（可选，每行一条，用于之后判卷）', value: manual.essentials, onChange: (e) => setManual({ ...manual, essentials: e.target.value }), style: { minHeight: '60px', marginBottom: '8px', resize: 'vertical' } }),
          h('div', { style: { display: 'flex', gap: '8px', marginBottom: '10px', flexWrap: 'wrap' } }, [
            h('select', { className: 'upcv-input upcv-input-sm', value: manual.level, onChange: (e) => setManual({ ...manual, level: e.target.value }), 'aria-label': '级别', style: { width: 'auto' } },
              levelOptions.filter((opt) => opt.key !== '').map((opt) => h('option', { key: opt.key, value: opt.key }, opt.label))),
            h('select', { className: 'upcv-input upcv-input-sm', value: manual.kind, onChange: (e) => setManual({ ...manual, kind: e.target.value }), 'aria-label': '题型', style: { width: 'auto' } },
              kindOptions.filter((opt) => opt.key !== '').map((opt) => h('option', { key: opt.key, value: opt.key }, opt.label))),
          ]),
          h('button', { type: 'button', className: 'upcv-btn upcv-btn-primary upcv-btn-sm', onClick: submitManual, disabled: manualBusy || manual.text.trim() === '' }, manualBusy ? '录入中...' : '录入题库'),
        ]),

        loading && items.length === 0 && h('p', { className: 'upcv-muted', key: 'loading' }, '题库加载中…'),
        !loading && items.length === 0 && h('div', { className: 'upcv-empty', key: 'empty' },
          h('div', { className: 'upcv-empty-icon' }, Icon('folder', 'lg')),
          h('div', { className: 'upcv-empty-title' }, '题库还是空的'),
          h('p', { className: 'upcv-empty-desc' }, '内置 300 题会在第一次打开时导入；做一轮模拟面试，AI 出的题也会自动沉淀进来。'),
          h('div', { className: 'upcv-empty-actions' },
            h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary', onClick: () => { setView('all'); setLimit(50); query(); } }, '重新加载'))),

        items.map((item) => {
          const expanded = expandedId === item.id;
          const state = bankMasteryState(item);
          const m = item.mastery ?? {};
          const points = item.points ?? {};
          return h('div', { className: 'upcv-mistake-item', key: item.id }, [
            h('button', {
              type: 'button', className: 'upcv-mistake-head',
              onClick: () => setExpandedId(expanded ? null : item.id),
              'aria-expanded': expanded ? 'true' : 'false',
            }, [
              h('span', { className: 'upcv-verdict-mark ' + (state.cls || 'pass'), style: { fontSize: '15px', flex: 'none' } }, state.label),
              h('span', { className: 'upcv-mistake-q' }, item.text || '（无题干）'),
              h('span', { className: 'upcv-pill' }, (BANK_LEVEL_LABEL[item.level] ?? item.level ?? '—') + ' · ' + (BANK_KIND_LABEL[item.kind] ?? item.kind ?? '—')),
            ]),
            expanded && h('div', { className: 'upcv-mistake-body' }, [
              (Array.isArray(item.topic) && item.topic.length > 0) && h('div', { style: { paddingTop: '10px' } },
                item.topic.map((tag, i) => h('span', { className: 'upcv-chip', key: i }, tag))),
              item.variantOf && h('p', { className: 'upcv-kv' }, h('b', null, '变体题：'), '与另一道题同考点（' + item.variantOf + '），判定要点相同、问法不同'),
              (Number(m.seen) || 0) > 0
                ? h('p', { className: 'upcv-kv' }, h('b', null, '练过：'), (Number(m.seen) || 0) + ' 次 · 对 ' + (Number(m.pass) || 0) + ' · 部分 ' + (Number(m.partial) || 0) + ' · 错 ' + (Number(m.fail) || 0) + ' · 当前权重 ' + (Number.isFinite(Number(m.weight)) ? Number(m.weight).toFixed(2) : '1.00'))
                : h('p', { className: 'upcv-kv' }, h('b', null, '还没练过这道题。')),
              (Array.isArray(points.essentials) && points.essentials.length > 0) && h('div', null, [
                h('p', { className: 'upcv-kv', style: { marginBottom: '2px' } }, h('b', null, '判定要点（答这些才算对）：')),
                h('ul', { className: 'upcv-verdict-points pass' }, points.essentials.map((point, i) => h('li', { key: i }, point))),
              ]),
              (Array.isArray(points.bestPractice) && points.bestPractice.length > 0) && h('div', null, [
                h('p', { className: 'upcv-kv', style: { marginBottom: '2px' } }, h('b', null, '进阶要点（答不出不算错）：')),
                h('ul', { className: 'upcv-verdict-points' }, points.bestPractice.map((point, i) => h('li', { key: i }, point))),
              ]),
              (Array.isArray(m.history) && m.history.length > 0) && h('div', null, [
                h('p', { className: 'upcv-kv', style: { marginBottom: '2px' } }, h('b', null, '判定历史：')),
                m.history.slice().reverse().map((row, i) => h('div', { className: 'upcv-hist-line', key: i },
                  formatTime(row && row.at) + ' · ' + ((row && row.judgedBy) === 'user' ? '我的判定' : 'AI 判定') + ' · ' + (VERDICT_LABEL[row && row.verdict] ?? String((row && row.verdict) ?? '—'))
                  + (Number.isFinite(Number(row && row.hitRatio)) ? ' · 命中 ' + Math.round(Number(row.hitRatio) * 100) + '%' : '')
                  + ((Array.isArray(row && row.missedPoints) && row.missedPoints.length > 0) ? ' · 缺 ' + row.missedPoints.length + ' 条要点' : ''))),
              ]),
              h('div', { className: 'upcv-job-actions' }, [
                ['pass', 'partial', 'fail'].map((v) => h('button', {
                  key: v, type: 'button', className: 'upcv-mini', onClick: () => judge(item.id, v),
                }, '判' + VERDICT_LABEL[v])),
                h('button', { type: 'button', className: 'upcv-mini', onClick: () => master(item.id) }, '标记掌握'),
                h('button', { type: 'button', className: 'upcv-mini danger', style: { marginLeft: 'auto' }, onClick: () => removeQ(item.id) }, Icon('trash'), '移出'),
              ]),
            ]),
          ]);
        }),

        items.length > 0 && items.length < total && h('div', { style: { textAlign: 'center', marginTop: '12px' }, key: 'more' },
          h('button', { type: 'button', className: 'upcv-btn upcv-btn-secondary upcv-btn-sm', onClick: () => setLimit(limit + 50) }, '加载更多（还有 ' + (total - items.length) + ' 题）')),
        items.length > 0 && loading && h('p', { className: 'upcv-muted', key: 'moreloading', style: { textAlign: 'center' } }, '加载中…'),
      ]);
    }

    // ========== 主工作台 ==========
    /** 面板由工作台宿主渲染，宿主不一定注入 t()；这里自带一份翻译。 */
    function makeT() {
      const lang = (typeof navigator !== 'undefined' && navigator.language ? navigator.language : 'zh').toLowerCase();
      const dict = lang.startsWith('zh') ? zh : Object.assign({}, zh, en);
      return (key) => (dict[key] !== undefined ? dict[key] : key);
    }

    function Workbench({ ctx }) {
      const t = React.useMemo(() => makeT(), []);
      const [page, setPage] = React.useState('home');
      const [editorId, setEditorId] = React.useState(null);
      const aiStatus = useAiStatus();

      const [jdPreset, setJdPreset] = React.useState(null);
      const nav = (p) => { if (p !== 'jd') setJdPreset(null); setPage(p); };
      // 岗位页「定制」：带 jobId 进 JD 对齐页，由 JdPage 自己读岗位库预填（不带 JD 正文，不自动抓取）
      const customizeWith = (jobId) => { setJdPreset({ jobId: jobId }); setPage('jd'); };

      return h('div', { className: 'upcv-app' }, [
        h('header', { className: 'upcv-header', key: 'header' }, [
          h('div', { className: 'upcv-header-brand', key: 'brand' }, [
            h('div', { className: 'upcv-header-logo', key: 'logo' }, 'UP'),
            h('span', { key: 'title' }, t('title')),
          ]),
          h('div', { className: 'upcv-header-meta', key: 'meta' }, [
            h('span', {
              key: 'badge',
              className: 'upcv-ai-badge',
              title: aiStatus.available ? ('模型可用：' + (aiStatus.models[0] || aiStatus.providers[0] || '默认')) : '本机没有可调用的模型',
            }, [
              h('span', { key: 'dot', className: 'upcv-ai-dot ' + (aiStatus.loading ? '' : (aiStatus.available ? 'on' : 'off')) }),
              aiStatus.loading ? 'AI 检测中' : (aiStatus.available ? 'AI ' + (aiStatus.models[0] || '已连接') : 'AI 不可用'),
            ]),
            h('span', { key: 'ver', className: 'upcv-hint', style: { fontSize: '11px' }, title: '工作台客户端版本' }, 'v' + CLIENT_VERSION),
          ]),
        ]),

        page === 'home' && h(HomePage, { key: 'home', onNavigate: nav, t }),
        page === 'resume' && h(ResumePage, { key: 'resume', t, onBack: () => nav('home'), aiStatus, onOpenEditor: (id) => { setEditorId(id); setPage('editor'); } }),
        page === 'editor' && h(ResumeEditorPage, { key: 'editor', t, onBack: () => nav('resume'), aiStatus, recordId: editorId }),
        page === 'interview' && h(InterviewPage, { key: 'interview', t, onBack: () => nav('home'), aiStatus, onNavigate: nav }),
        page === 'bank' && h(BankPage, { key: 'bank', t, onBack: () => nav('home'), aiStatus }),
        page === 'jobs' && h(JobsPage, { key: 'jobs', onBack: () => nav('home'), onCustom: customizeWith }),
        page === 'jd' && h(JdPage, { key: 'jd', t, onBack: () => nav('home'), aiStatus, preset: jdPreset }),
      ]);
    }

/* ---- client/src/30-pdf.js ---- */
/* ===========================================================================
 * dsh-upcv-workspace — client half, part 3: 文件文本抽取。
 *
 * PDF 提取移植自 dsh-resume-workbench/client/src/24-pdf.js（零依赖前端实现）：
 * 解析对象与对象流 → 解压 → 字体 ToUnicode CMap → 内容流抽文本，并做两项质量闸门
 * （提取过短 = 扫描件；可读字符占比过低 = 内嵌字体乱码）。两道闸门不过就明确报错，
 * 绝不把乱码喂给模型。
 *
 * DOCX 是本项目新增的：docx 就是 ZIP，取 word/document.xml 解压后剥标签即可。
 * ======================================================================== */

    const PDF_MAX_BYTES = 10 * 1024 * 1024

    function latin1(bytes) {
      let out = ''
      for (let index = 0; index < bytes.length; index += 0x8000) {
        out += String.fromCharCode.apply(null, bytes.subarray(index, index + 0x8000))
      }
      return out
    }

    async function inflate(bytes, format) {
      const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream(format))
      return new Uint8Array(await new Response(stream).arrayBuffer())
    }

    /** CMap 值的十六进制 → 字符串（值是 Unicode 码元序列，恒按 2 字节一组）。 */
    function hexToUnicode(hex) {
      const clean = hex.replace(/[^0-9A-Fa-f]/gu, '')
      if (clean.length < 4 || clean.length % 4 !== 0) return ''
      let out = ''
      for (let index = 0; index < clean.length; index += 4) {
        out += String.fromCharCode(parseInt(clean.slice(index, index + 4), 16))
      }
      return out
    }

    /** 解析 ToUnicode CMap 的 bfchar / bfrange 段 → Map(字形码 → 字符串)。 */
    function parseCmap(text) {
      const map = new Map()
      for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/gu)) {
        for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/gu)) {
          map.set(parseInt(entry[1], 16), hexToUnicode(entry[2]))
        }
      }
      for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/gu)) {
        for (const entry of block[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*(?:<([0-9A-Fa-f]+)>|\[([\s\S]*?)\])/gu)) {
          const lo = parseInt(entry[1], 16)
          const hi = Math.min(parseInt(entry[2], 16), lo + 65_535)
          if (entry[3] !== undefined) {
            const start = parseInt(entry[3], 16)
            for (let code = lo; code <= hi; code += 1) map.set(code, String.fromCharCode(start + (code - lo)))
          } else {
            const items = [...entry[4].matchAll(/<([0-9A-Fa-f]+)>/gu)]
            for (let code = lo; code <= hi && code - lo < items.length; code += 1) {
              map.set(code, hexToUnicode(items[code - lo][1]))
            }
          }
        }
      }
      return map
    }

    /** CMap 的字形码宽度：存在超过 1 字节的键 → 2 字节（Identity-H 类）。 */
    function cmapWidth(map) {
      for (const key of map.keys()) {
        if (key > 0xff) return 2
      }
      return 1
    }

    /** 用 CMap 解码十六进制字形串；查不到的码丢弃（宁缺勿乱）。 */
    function decodeHexWithCmap(hex, cmap, width) {
      const clean = hex.replace(/[^0-9A-Fa-f]/gu, '')
      const size = width * 2
      if (clean.length === 0 || clean.length % size !== 0) return null
      let out = ''
      for (let index = 0; index < clean.length; index += size) {
        const code = parseInt(clean.slice(index, index + size), 16)
        out += cmap.get(code) ?? ''
      }
      return out
    }

    // --- 无字体信息时的启发式回退 -------------------------------------------

    function unescapeLiteral(raw) {
      let out = ''
      for (let index = 0; index < raw.length; index += 1) {
        const ch = raw[index]
        if (ch !== '\\') { out += ch; continue }
        const next = raw[index + 1]
        if (next === undefined) break
        index += 1
        if (next >= '0' && next <= '7') {
          let octal = next
          while (octal.length < 3 && raw[index + 1] >= '0' && raw[index + 1] <= '7') {
            octal += raw[index + 1]
            index += 1
          }
          out += String.fromCharCode(parseInt(octal, 8))
          continue
        }
        const escapes = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', '(': '(', ')': ')', '\\': '\\' }
        out += escapes[next] ?? next
      }
      return out
    }

    function decodeBytes(bytes) {
      if (bytes.length === 0) return ''
      if (bytes.length % 2 === 0) {
        let cjk = 0
        for (let index = 0; index < bytes.length; index += 2) {
          const high = bytes[index]
          if ((high >= 0x4e && high <= 0x9f) || high === 0x30 || high === 0xff) cjk += 1
        }
        if (cjk >= Math.max(1, Math.floor(bytes.length / 4))) {
          let out = ''
          for (let index = 0; index < bytes.length; index += 2) {
            out += String.fromCharCode((bytes[index] << 8) | bytes[index + 1])
          }
          return out
        }
      }
      let ascii = 0
      for (const byte of bytes) {
        if ((byte >= 0x20 && byte <= 0x7e) || byte === 0x0a || byte === 0x0d) ascii += 1
      }
      if (ascii / bytes.length > 0.7) return latin1(bytes)
      return null
    }

    function decodeHexHeuristic(hex) {
      const clean = hex.replace(/[^0-9A-Fa-f]/gu, '')
      if (clean.length === 0 || clean.length % 2 !== 0) return null
      const bytes = new Uint8Array(clean.length / 2)
      for (let index = 0; index < bytes.length; index += 1) {
        bytes[index] = parseInt(clean.slice(index * 2, index * 2 + 2), 16)
      }
      return decodeBytes(bytes)
    }

    /**
     * 内容流 → 文本。`cmapFor(name)` 返回当前字体的 {map, width} 或 null。
     * 按"逻辑行"处理：Tf 行切换字体，其余行按序抽字面量/十六进制串。
     */
    function textFromContent(content, cmapFor) {
      const marked = content
        .replace(/\bT[Jj]\b/g, '$&\n')
        .replace(/\/([A-Za-z0-9+#,.\-]+)\s+[\d.]+\s+Tf\b/g, '\n/$1 Tf\n')
        .replace(/\b(T\*|Td|TD|ET|BT)\b/g, '\n$&\n')
        .replace(/('|")\s*(?=\(|<)/g, '$1\n')
      const pieces = []
      // /g 正则有 lastIndex 状态：跨行复用会漏掉后续匹配（真机踩过），每次使用前归零
      const literalPattern = /\((?:\\[\s\S]|[^\\()])*\)/gu
      const hexPattern = /<\s*[0-9A-Fa-f\s]*\s*>/gu
      let currentFont = null
      for (const line of marked.split('\n')) {
        const tf = /^\s*\/([A-Za-z0-9+#,.\-]+)\s+Tf\s*$/u.exec(line)
        if (tf !== null) {
          currentFont = typeof cmapFor === 'function' ? cmapFor(tf[1]) : null
          continue
        }
        literalPattern.lastIndex = 0
        for (const match of line.matchAll(literalPattern)) {
          pieces.push(unescapeLiteral(match[0].slice(1, -1)))
        }
        hexPattern.lastIndex = 0
        for (const match of line.matchAll(hexPattern)) {
          const token = match[0].slice(match[0].indexOf('<') + 1, match[0].lastIndexOf('>'))
          if (token.trim() === '') continue
          const decoded = currentFont !== null
            ? decodeHexWithCmap(token, currentFont.map, currentFont.width)
            : decodeHexHeuristic(token)
          if (decoded !== null && decoded !== '') pieces.push(decoded)
        }
      }
      return pieces.join('')
    }

    // --- 对象与字体资源 ------------------------------------------------------

    /**
     * 收集 PDF 对象：普通 `N 0 obj … endobj` + ObjStm 压缩对象流展开。
     * 返回 Map(对象号 → { dict, stream: Uint8Array|null })。
     */
    async function collectObjects(raw, rawLatin) {
      const objects = new Map()
      const objPattern = /(\d+)\s+0\s+obj\b/gu
      let match
      while ((match = objPattern.exec(rawLatin)) !== null) {
        const num = Number(match[1])
        const bodyStart = match.index + match[0].length
        const streamAt = rawLatin.indexOf('stream', bodyStart)
        const endObjAt = rawLatin.indexOf('endobj', bodyStart)
        if (streamAt !== -1 && (endObjAt === -1 || streamAt < endObjAt)) {
          const dict = rawLatin.slice(bodyStart, streamAt)
          const dataStart = streamAt + 'stream'.length
          const eol = rawLatin[dataStart] === '\r'
            ? dataStart + (rawLatin[dataStart + 1] === '\n' ? 2 : 1)
            : rawLatin[dataStart] === '\n' ? dataStart + 1 : dataStart
          const end = rawLatin.indexOf('endstream', eol)
          if (end === -1) continue
          let stop = end
          // endstream 前的 EOL 属于分隔符，混进流会被解压器当 trailing junk 拒收
          while (stop > eol && (raw[stop - 1] === 0x0a || raw[stop - 1] === 0x0d)) stop -= 1
          objects.set(num, { dict, stream: raw.subarray(eol, stop) })
          // 停在 end 会把 "endstream" 里的 "stream" 再匹配一次
          objPattern.lastIndex = end + 'endstream'.length
        } else {
          const end = endObjAt === -1 ? Math.min(bodyStart + 4096, rawLatin.length) : endObjAt
          objects.set(num, { dict: rawLatin.slice(bodyStart, end), stream: null })
          objPattern.lastIndex = end + 'endobj'.length
        }
      }
      // ObjStm 展开：字体字典这类非流对象可能藏在压缩对象流里。
      // 解压是异步的，全部完成后再返回对象表。
      const objstmExpansions = []
      for (const object of objects.values()) {
        if (!/\/Type\s*\/ObjStm\b/.test(object.dict) || object.stream === null) continue
        const count = Number(/\/N\s+(\d+)/.exec(object.dict)?.[1] ?? 0)
        const first = Number(/\/First\s+(\d+)/.exec(object.dict)?.[1] ?? 0)
        if (count <= 0 || first <= 0) continue
        objstmExpansions.push(inflate(object.stream, 'deflate').then((bytes) => {
          const text = latin1(bytes)
          const header = text.slice(0, first).trim().split(/\s+/u).map(Number)
          const body = text.slice(first)
          for (let index = 0; index < Math.min(count, Math.floor(header.length / 2)); index += 1) {
            const num = header[index * 2]
            const offset = header[index * 2 + 1]
            const nextOffset = index + 1 < Math.floor(header.length / 2) ? header[(index + 1) * 2 + 1] : body.length
            if (!objects.has(num)) objects.set(num, { dict: body.slice(offset, nextOffset), stream: null })
          }
        }).catch(() => {}))
      }
      await Promise.all(objstmExpansions)
      return objects
    }

    /** 解压一个流为 latin1 文本；失败返回 null。 */
    async function streamText(stream) {
      for (const format of ['deflate', 'deflate-raw']) {
        try {
          return latin1(await inflate(stream, format))
        } catch {
          // 换下一种格式 / 放弃
        }
      }
      return null
    }

    /** 页面资源的 /Font 字典体（内联 dict 或经 /Resources 间接引用；向上继承一层）。 */
    function fontDictOf(objects, pageDict) {
      let dict = pageDict
      for (let depth = 0; depth < 3; depth += 1) {
        const inline = /\/Font\s*<<([\s\S]*?)>>/u.exec(dict)
        if (inline !== null) return inline[1]
        const ref = /\/Resources\s+(\d+)\s+0\s+R/u.exec(dict)
        if (ref !== undefined) {
          const resources = objects.get(Number(ref[1]))
          if (resources === undefined) return ''
          dict = resources.dict
          continue
        }
        const parent = /\/Parent\s+(\d+)\s+0\s+R/u.exec(dict)
        if (parent !== undefined) {
          const parentObj = objects.get(Number(parent[1]))
          if (parentObj === undefined) return ''
          dict = parentObj.dict
          continue
        }
        return ''
      }
      return ''
    }

    /**
     * 提取 PDF 文本。成功返回字符串；提不出可用文本抛 Error（message 可直接给用户）。
     * @param {ArrayBuffer} arrayBuffer
     * @returns {Promise<string>}
     */
    async function extractPdfText(arrayBuffer) {
      const raw = new Uint8Array(arrayBuffer)
      if (raw.byteLength > PDF_MAX_BYTES) throw new Error('PDF 超过 10MB，请压缩后重试。')
      if (latin1(raw.subarray(0, 5)) !== '%PDF-') throw new Error('这不是有效的 PDF 文件。')
      const rawLatin = latin1(raw)
      const objects = await collectObjects(raw, rawLatin)

      // 字体对象号 → ToUnicode 对象号
      const fontToUnicode = new Map()
      for (const [num, object] of objects.entries()) {
        if (!/\/Type\s*\/Font\b/.test(object.dict)) continue
        const ref = /\/ToUnicode\s+(\d+)\s+0\s+R/u.exec(object.dict)
        if (ref !== null) fontToUnicode.set(num, Number(ref[1]))
      }
      // 资源名 → 字体对象号（跨页同名取先见者；简历类文档各页资源一致）
      const nameToFont = new Map()
      for (const [, object] of objects.entries()) {
        if (!/\/Type\s*\/Page\b/.test(object.dict)) continue
        for (const entry of fontDictOf(objects, object.dict).matchAll(/\/([A-Za-z0-9+#,.\-]+)\s+(\d+)\s+0\s+R/gu)) {
          if (!nameToFont.has(entry[1])) nameToFont.set(entry[1], Number(entry[2]))
        }
      }
      // 预载每个资源名的 CMap
      const fontNameCmaps = new Map()
      for (const [name, fontObj] of nameToFont.entries()) {
        const toUnicode = fontToUnicode.get(fontObj)
        if (toUnicode === undefined) {
          fontNameCmaps.set(name, null)
          continue
        }
        const target = objects.get(toUnicode)
        const text = target !== undefined && target.stream !== null ? await streamText(target.stream) : null
        const map = text === null ? new Map() : parseCmap(text)
        fontNameCmaps.set(name, map.size > 0 ? { map, width: cmapWidth(map) } : null)
      }
      const cmapFor = (name) => fontNameCmaps.get(name) ?? null

      // 页面内容流（按文档顺序）；找不到页面结构时退回"所有解压后带文本算子的流"
      const contentStreams = []
      for (const object of objects.values()) {
        if (!/\/Type\s*\/Page\b/.test(object.dict)) continue
        // 单引用（/Contents N 0 R）与数组（/Contents [ N 0 R M 0 R ]）两种形状归一成对象号列表
        const single = /\/Contents\s+(\d+)\s+0\s+R/u.exec(object.dict)
        const refs = single !== null ? [single[1]] : [...(/\/Contents\s*\[([\s\S]*?)\]/u.exec(object.dict)?.[1] ?? '').matchAll(/(\d+)\s+0\s+R/gu)].map((entry) => entry[1])
        for (const ref of refs) {
          const target = objects.get(Number(ref))
          if (target !== undefined && target.stream !== null) contentStreams.push(target.stream)
        }
      }
      if (contentStreams.length === 0) {
        for (const object of objects.values()) {
          if (object.stream === null || /\/Type\s*\/(ObjStm|Font)\b/.test(object.dict)) continue
          contentStreams.push(object.stream)
        }
      }

      const pieces = []
      for (const stream of contentStreams) {
        const text = await streamText(stream)
        if (text === null) continue
        pieces.push(textFromContent(text, cmapFor))
      }
      const text = pieces.join('\n').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/gu, '\n\n').trim()
      if (text.length < 40) {
        throw new Error('这份 PDF 提不出可用文本：可能是扫描件（图片型）。请改用文字版 PDF / TXT，或直接把简历内容粘贴进输入框。')
      }
      const printable = (text.match(/[\p{Script=Han}A-Za-z0-9，。、；：！？（）@.\-—–\s/]/gu) ?? []).length
      if (printable / text.length < 0.6) {
        throw new Error('这份 PDF 的文字是内嵌字体编码（提取出的是乱码）。请导出文字版 PDF / TXT，或直接粘贴简历文本。')
      }
      return text
    }

    /** 纯文本文件直接读；PDF 走提取。 */
    async function readResumeFile(file) {
      if (file.size > PDF_MAX_BYTES) throw new Error('文件超过 10MB。')
      if (/\.pdf$/iu.test(file.name) || file.type === 'application/pdf') {
        return extractPdfText(await file.arrayBuffer())
      }
      return file.text()
    }

    /**
     * DOCX 文本抽取。docx 就是 ZIP：读中央目录找到 word/document.xml，
     * raw deflate 解压后剥标签。<w:p> 分段、<w:tab> 转空格、<w:br> 转换行。
     * 零依赖，只用 DecompressionStream。
     */
    const DOCX_MAX_BYTES = 20 * 1024 * 1024

    function zipEntries(bytes) {
      // 从尾部找 End of Central Directory（0x06054b50）
      let eocd = -1
      for (let i = bytes.length - 22; i >= 0 && i > bytes.length - 66000; i -= 1) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) { eocd = i; break }
      }
      if (eocd === -1) throw new Error("这不是有效的 DOCX 文件（找不到 ZIP 目录）。")
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const total = view.getUint16(eocd + 10, true)
      let offset = view.getUint32(eocd + 16, true)
      const entries = []
      for (let index = 0; index < total; index += 1) {
        if (view.getUint32(offset, true) !== 0x02014b50) break
        const method = view.getUint16(offset + 10, true)
        const compressedSize = view.getUint32(offset + 20, true)
        const nameLength = view.getUint16(offset + 28, true)
        const extraLength = view.getUint16(offset + 30, true)
        const commentLength = view.getUint16(offset + 32, true)
        const localOffset = view.getUint32(offset + 42, true)
        const name = latin1(bytes.subarray(offset + 46, offset + 46 + nameLength))
        entries.push({ name, method, compressedSize, localOffset })
        offset += 46 + nameLength + extraLength + commentLength
      }
      return entries
    }

    function zipRead(bytes, entry) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
      const nameLength = view.getUint16(entry.localOffset + 26, true)
      const extraLength = view.getUint16(entry.localOffset + 28, true)
      const start = entry.localOffset + 30 + nameLength + extraLength
      return bytes.subarray(start, start + entry.compressedSize)
    }

    async function extractDocxText(arrayBuffer) {
      const bytes = new Uint8Array(arrayBuffer)
      if (bytes.byteLength > DOCX_MAX_BYTES) throw new Error("DOCX 超过 20MB，请压缩后重试。")
      const entries = zipEntries(bytes)
      const target = entries.find((entry) => entry.name === "word/document.xml")
      if (target === undefined) throw new Error("这份 DOCX 里没有正文（不是 Word 文档？）。")
      const compressed = zipRead(bytes, target)
      let xml
      if (target.method === 0) {
        xml = latin1(compressed)
      } else if (target.method === 8) {
        xml = latin1(await inflate(compressed, "deflate-raw"))
      } else {
        throw new Error("这份 DOCX 用了不支持的压缩方式（" + target.method + "）。")
      }
      const text = xmlToText(xml)
      if (text.length < 20) throw new Error("这份 DOCX 提不出可用文本，请改用 PDF / TXT 或直接粘贴内容。")
      return text
    }

    /** WordprocessingML → 纯文本。段落换行，制表符转空格。 */
    function xmlToText(xml) {
      const marked = xml
        .split("<w:p ").join("\n<w:p ")
        .split("<w:p>").join("\n<w:p>")
        .split("<w:tab/>").join(" ")
        .split("<w:br/>").join("\n")
      let out = ""
      let index = 0
      while (index < marked.length) {
        const lt = marked.indexOf("<", index)
        if (lt === -1) { out += decodeXmlEntities(marked.slice(index)); break }
        out += decodeXmlEntities(marked.slice(index, lt))
        const gt = marked.indexOf(">", lt)
        if (gt === -1) break
        index = gt + 1
      }
      return out.split("\n").map((line) => line.trim()).filter((line, i, all) => line !== "" || (i > 0 && all[i - 1] !== "")).join("\n").trim()
    }

    function decodeXmlEntities(text) {
      return text
        .split("&lt;").join("<").split("&gt;").join(">")
        .split("&quot;").join(String.fromCharCode(34))
        .split("&apos;").join(String.fromCharCode(39))
        .split("&amp;").join("&")
    }

    /** 统一入口：按扩展名分派；不支持的格式明确报错。 */
    async function readResumeFileFull(file) {
      const name = String((file && file.name) || "").toLowerCase()
      const type = String((file && file.type) || "").toLowerCase()
      if (name.endsWith(".docx") || type.indexOf("officedocument.wordprocessingml") !== -1) {
        return extractDocxText(await file.arrayBuffer())
      }
      if (name.endsWith(".pdf") || type === "application/pdf") {
        return extractPdfText(await file.arrayBuffer())
      }
      if (name.endsWith(".doc") || type === "application/msword") {
        throw new Error("旧版 .doc 无法直接解析，请用 Word 另存为 .docx 或 PDF 后重试。")
      }
      return file.text()
    }

/* ---- client/src/36-rr.js ---- */
/* ===========================================================================
 * dsh-upcv-workspace — client half, part 3.6: 14 套模板的 HTML/CSS 渲染层.
 *
 * 前 8 套重写自 Reactive Resume v4（MIT，见 README 致谢）。**没有复制 react-pdf 组件代码**：
 * RR 的原语（@react-pdf/renderer 的 View/Text）在这里不存在，所以整套版面按它的布局参数
 * （间距比例、字号层级、分栏宽度、标题体系）用 HTML/CSS 重写，并按中文排版习惯调参：
 *   · 字体栈 PingFang SC / Noto Sans SC 优先，行高 1.5-1.6；
 *   · 标题用字重 + 字距做层级，不用斜体（中文斜体是伪斜体，很难看）；
 *   · 照片位可显隐（沿用 metadata.basics.picture 的开关）。
 * 后 6 套（rr-docket / rr-ink / rr-glyph / rr-meadow / rr-lake / rr-light）按视觉复刻自
 * Evarlio 免费模板（2026-11）：只移植设计观感（配色 / 栏比 / 标题体系），代码全部自写，
 * 原型全部复用现有 body 骨架（分页与量测零改动）。
 *
 * 为什么是「纯字符串生成 HTML」而不是 React 组件：预览、导出、离线截图三条链路必须
 * 用**同一份 DOM 与同一份 CSS**，否则量测高度与打印高度会不一致（历史上踩过：
 * 预览用 min-height、打印用固定高，于是导出总被吞掉最后一行）。
 * ======================================================================== */

    // ========== 模板渲染 ·样式表 ==========
    // 所有规则都挂在 .rr-sheet 下：作用域隔离，不会碰到工作台 UI。
    // CSS 变量由 rrVars() 按每份简历的主题色/字体即时生成（见下）。
    const RR_CSS = [
      '.rr-sheet{position:relative;box-sizing:border-box;width:210mm;min-height:297mm;background:#fff;color:var(--rr-ink);overflow:hidden;-webkit-font-smoothing:antialiased}',
      '.rr-sheet *{box-sizing:border-box;margin:0;padding:0}',
      '.rr-page{height:297mm}',
      '.rr-cols{display:flex;align-items:flex-start}',
      // 单栏模板里这一栏必须撑满整页宽度：flex:0 1 auto 会按内容缩，第二页只剩左半页
      '.rr-lane{flex:1 1 auto;min-width:0}',
      '.rr-h2{font-size:13px;font-weight:800;letter-spacing:.04em;line-height:1.35}',
      '.rr-rich p{margin:0}',
      '.rr-rich ul,.rr-rich ol{margin:2px 0 0;padding-left:16px}',
      '.rr-rich li{margin:1px 0}',
      '.rr-item{margin-bottom:9px}',
      '.rr-item:last-child{margin-bottom:0}',
      '.rr-ihead{display:flex;align-items:baseline;justify-content:space-between;gap:10px}',
      '.rr-ihead b{font-size:1.03em;font-weight:700;letter-spacing:.01em}',
      '.rr-idate{font-size:.86em;color:var(--rr-ink-3);white-space:nowrap;font-variant-numeric:tabular-nums}',
      '.rr-isub{font-size:.88em;color:var(--rr-ink-2);margin-top:1px}',
      '.rr-irich{font-size:.94em;margin-top:3px;color:var(--rr-ink-2)}',
      '.rr-irich ul,.rr-irich ol{margin:2px 0 0;padding-left:15px}',
      '.rr-skill .rr-sname{font-size:.96em;font-weight:700;display:flex;align-items:center;gap:5px}',
      '.rr-skill .rr-sdesc{font-size:.85em;color:var(--rr-ink-2);margin-top:1px}',
      '.rr-skill{margin-bottom:7px}',
      '.rr-prof b{font-size:.96em}',
      '.rr-prof .rr-isub{font-size:.84em;word-break:break-all}',
      '.rr-rate{display:inline-flex;align-items:center;gap:3px;margin-top:3px;color:var(--rr-primary)}',
      '.rr-rate i{display:block;width:7px;height:7px;border-radius:50%;background:var(--rr-rule);font-style:normal}',
      '.rr-rate i.on{background:var(--rr-primary)}',
      '.rr-rate-squares i{border-radius:1px;width:9px;height:9px}',
      '.rr-rate-bars i{border-radius:0;width:14px;height:4px}',
      '.rr-rate-stars{letter-spacing:1.5px;font-size:11px;line-height:1;color:var(--rr-primary);font-style:normal}',
      '.rr-rate-progress{display:block;height:4px;background:var(--rr-soft);border-radius:2px;margin-top:4px;overflow:hidden}',
      '.rr-rate-progress>i{display:block;height:100%;background:var(--rr-primary);border-radius:2px}',
      '.rr-cis{display:flex;flex-wrap:wrap;gap:3px 16px;font-size:11.5px;color:var(--rr-ink-2);margin-top:7px}',
      '.rr-ci{display:inline-flex;align-items:center;gap:5px;min-width:0}',
      '.rr-ci svg{flex:none;opacity:.9;color:var(--rr-primary)}',
      '.rr-photo{display:block;object-fit:cover;background:var(--rr-soft)}',
      '.rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}',
      '.rr-headmain{min-width:0;flex:1}',
    ].join(String.fromCharCode(10));

    const RR_CSS_BRONZOR = [
      '.rr-sheet[data-tpl="rr-bronzor"] .rr-head{text-align:center;padding-bottom:14px;border-bottom:1px solid var(--rr-ink)}',
      '.rr-sheet[data-tpl="rr-bronzor"] .rr-photo{margin:0 auto 10px;border-radius:2px}',
      '.rr-sheet[data-tpl="rr-bronzor"] .rr-name{font-size:27px;font-weight:700;letter-spacing:.01em;line-height:1.2}',
      '.rr-sheet[data-tpl="rr-bronzor"] .rr-headline{font-size:12.5px;color:var(--rr-ink-2);margin-top:3px}',
      '.rr-sheet[data-tpl="rr-bronzor"] .rr-cis{justify-content:center}',
      '.rr-sheet[data-tpl="rr-bronzor"] .rr-rowsec{display:grid;grid-template-columns:var(--rr-label-w,25%) 1fr;gap:12px;padding:8px 0;border-top:1px solid var(--rr-line)}',
      '.rr-sheet[data-tpl="rr-bronzor"] .rr-rowsec:first-of-type{border-top:0}',
      '.rr-sheet[data-tpl="rr-bronzor"] .rr-rowsec>.rr-label .rr-h2{font-size:12px;font-weight:700;color:var(--rr-ink);padding-top:1px}',
      '.rr-sheet[data-tpl="rr-bronzor"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}',
      '.rr-sheet[data-tpl="rr-onyx"] .rr-head{display:flex;gap:16px;align-items:flex-start;padding-bottom:12px;border-bottom:2px solid var(--rr-ink);margin-bottom:14px}',
      '.rr-sheet[data-tpl="rr-onyx"] .rr-photo{border-radius:3px;flex:none}',
      '.rr-sheet[data-tpl="rr-onyx"] .rr-name{font-size:28px;font-weight:800;letter-spacing:.01em;line-height:1.15}',
      '.rr-sheet[data-tpl="rr-onyx"] .rr-headline{font-size:13px;font-weight:600;color:var(--rr-primary);margin-top:3px}',
      '.rr-sheet[data-tpl="rr-onyx"] .rr-sec{margin-bottom:13px}',
      '.rr-sheet[data-tpl="rr-onyx"] .rr-h2{color:var(--rr-primary);padding-bottom:4px;border-bottom:1px solid var(--rr-rule);margin-bottom:7px}',
      '.rr-sheet[data-tpl="rr-onyx"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_AZURILL = [
      '.rr-sheet[data-tpl="rr-azurill"] .rr-head{text-align:center;padding-bottom:10px;border-bottom:1px solid var(--rr-rule);margin-bottom:12px}',
      '.rr-sheet[data-tpl="rr-azurill"] .rr-photo{margin:0 auto 8px;border-radius:50%}',
      '.rr-sheet[data-tpl="rr-azurill"] .rr-name{font-size:25px;font-weight:700;letter-spacing:.02em}',
      '.rr-sheet[data-tpl="rr-azurill"] .rr-headline{font-size:12px;color:var(--rr-ink-2);margin-top:2px}',
      '.rr-sheet[data-tpl="rr-azurill"] .rr-cis{justify-content:center;font-size:11px}',
      '.rr-sheet[data-tpl="rr-azurill"] .rr-sec{margin-bottom:12px}',
      '.rr-sheet[data-tpl="rr-azurill"] .rr-h2{color:var(--rr-primary);padding-bottom:3px;border-bottom:1px solid var(--rr-rule);margin-bottom:6px;font-size:12.5px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_GLALIE = [
      '.rr-sheet[data-tpl="rr-glalie"] .rr-cols{gap:0}',
      '.rr-sheet[data-tpl="rr-glalie"]{background:linear-gradient(90deg,var(--rr-rail) 0 var(--rr-rail-w),#fff var(--rr-rail-w))}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-lane[data-lane="0"]{padding:26px 20px}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-lane[data-lane="1"]{padding:26px 26px}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-head{text-align:center;padding-bottom:10px;margin-bottom:12px;border-bottom:1px solid var(--rr-rule)}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-photo{margin:0 auto 10px;border-radius:3px}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-name{font-size:19px;font-weight:700;line-height:1.3}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-headline{font-size:11px;color:var(--rr-ink-2);margin-top:2px;line-height:1.4}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-cis{display:block;margin-top:10px;font-size:10.5px}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-ci{display:flex;margin-bottom:4px;gap:6px;align-items:center}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-sec{margin-bottom:11px}',
      '.rr-sheet[data-tpl="rr-glalie"] .rr-h2{color:var(--rr-primary);padding-bottom:3px;border-bottom:1px solid var(--rr-rule);margin-bottom:6px;font-size:12px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_CHIKORITA = [
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="0"]{padding:24px 22px 26px 26px}',
      '.rr-sheet[data-tpl="rr-chikorita"]{background:linear-gradient(90deg,#fff 0 var(--rr-rail-w),var(--rr-primary) var(--rr-rail-w))}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="1"]{padding:24px 20px 26px;color:#fff}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="1"] .rr-h2{color:#fff;border-bottom:1px solid rgba(255,255,255,.5)}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="1"] .rr-idate,.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="1"] .rr-isub,.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="1"] .rr-irich,.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="1"] .rr-sdesc{color:rgba(255,255,255,.85)}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="1"] .rr-rate{color:#fff}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="1"] .rr-rate i{background:rgba(255,255,255,.35)}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-lane[data-lane="1"] .rr-rate i.on{background:#fff}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-head{display:flex;gap:14px;align-items:flex-start;padding-bottom:12px;margin-bottom:12px;border-bottom:2px solid var(--rr-primary)}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-photo{border-radius:3px;flex:none}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-name{font-size:24px;font-weight:700;line-height:1.2}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-headline{font-size:11.5px;color:var(--rr-ink-2);margin-top:2px}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-cis{display:block;margin-top:6px;font-size:10.5px}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-ci{display:flex;margin-bottom:3px;gap:6px;align-items:center}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-sec{margin-bottom:12px}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-h2{color:var(--rr-primary);padding-bottom:3px;border-bottom:1px solid var(--rr-rule);margin-bottom:6px}',
      '.rr-sheet[data-tpl="rr-chikorita"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_DITTO = [
      '.rr-sheet[data-tpl="rr-ditto"] .rr-banner{position:relative;background:var(--rr-primary);color:#fff;padding:16px 24px 16px 148px;min-height:78px}',
      '.rr-sheet[data-tpl="rr-ditto"] .rr-banner .rr-photo{position:absolute;left:24px;top:14px;border-radius:4px;border:3px solid #fff}',
      '.rr-sheet[data-tpl="rr-ditto"] .rr-name{font-size:25px;font-weight:700;line-height:1.2}',
      '.rr-sheet[data-tpl="rr-ditto"] .rr-headline{font-size:11.5px;color:rgba(255,255,255,.92);margin-top:2px}',
      '.rr-sheet[data-tpl="rr-ditto"] .rr-banner .rr-cis{color:rgba(255,255,255,.95);margin-top:6px;font-size:10.5px}',
      '.rr-sheet[data-tpl="rr-ditto"] .rr-banner .rr-ci svg{color:rgba(255,255,255,.9)}',
      '.rr-sheet[data-tpl="rr-ditto"] .rr-cols{padding:0 24px;gap:18px}',
      '.rr-sheet[data-tpl="rr-ditto"] .rr-lane{padding:14px 0 22px}',
      '.rr-sheet[data-tpl="rr-ditto"] .rr-sec{margin-bottom:11px}',
      '.rr-sheet[data-tpl="rr-ditto"] .rr-h2{color:var(--rr-primary);padding-bottom:3px;border-bottom:1px solid var(--rr-rule);margin-bottom:6px;font-size:12px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_LAPRAS = [
      '.rr-sheet[data-tpl="rr-lapras"]{background:var(--rr-page);padding:18px 16px}',
      '.rr-sheet[data-tpl="rr-lapras"] .rr-card{background:#fff;border-radius:10px;padding:14px 16px;margin-bottom:10px;box-shadow:0 1px 3px rgba(15,40,60,.10)}',
      '.rr-sheet[data-tpl="rr-lapras"] .rr-head{display:flex;gap:14px;align-items:flex-start}',
      '.rr-sheet[data-tpl="rr-lapras"] .rr-photo{border-radius:8px;flex:none}',
      '.rr-sheet[data-tpl="rr-lapras"] .rr-name{font-size:23px;font-weight:700;line-height:1.2}',
      '.rr-sheet[data-tpl="rr-lapras"] .rr-headline{font-size:12px;color:var(--rr-ink-2);margin-top:2px}',
      '.rr-sheet[data-tpl="rr-lapras"] .rr-cis{margin-top:8px;gap:4px 18px;font-size:11px}',
      '.rr-sheet[data-tpl="rr-lapras"] .rr-h2{color:var(--rr-primary);margin-bottom:6px;font-size:13px}',
      '.rr-sheet[data-tpl="rr-lapras"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_PORYGON = [
      '.rr-sheet[data-tpl="rr-porygon"] .rr-headcard{border:1.5px solid var(--rr-ink);margin-bottom:12px}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-headtop{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;padding:14px 16px 10px}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-name{font-size:30px;font-weight:800;letter-spacing:.01em;line-height:1.1}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-headline{font-size:12.5px;margin-top:3px;color:var(--rr-ink-2)}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-ctable{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--rr-line)}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-crow{display:flex;align-items:center;gap:7px;padding:5px 16px;font-size:11px;border-bottom:1px solid var(--rr-line);color:var(--rr-ink-2)}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-crow:nth-child(odd){border-right:1px solid var(--rr-line)}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-sec{margin-bottom:12px;border:1px solid var(--rr-line)}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-h2{background:var(--rr-primary);color:#fff;padding:5px 12px;font-size:12px;letter-spacing:.14em;font-weight:700}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-secbody{padding:9px 12px 10px}',
      '.rr-sheet[data-tpl="rr-porygon"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_TAIL = [
      '.rr-pagenum{position:absolute;bottom:8px;right:14px;font-size:10px;color:var(--rr-ink-3);letter-spacing:.5px}',
      '.rr-flag{position:absolute;bottom:8px;left:14px;font-size:10px;font-weight:600;color:#dc2626}',
    ].join(String.fromCharCode(10));
    // —— Evarlio 复刻组（2026-11）：纸底色走 --rr-paper（CSS 层定义，不进 rrVars），
    //    编号节标题走 CSS counter（sheet 级 reset，分页后每页重新计数，纯 CSS 的已知限制）。
    const RR_CSS_DOCKET = [
      // 卷宗编号（复刻 Civic Docket）：米白纸底 + 衬线 + 「1.」编号节标题
      '.rr-sheet[data-tpl="rr-docket"]{--rr-paper:#fcfaf5;background:var(--rr-paper);counter-reset:rrsec}',
      '.rr-sheet[data-tpl="rr-docket"] .rr-head{text-align:center;padding-bottom:16px;border-bottom:1px solid var(--rr-rule);margin-bottom:16px}',
      '.rr-sheet[data-tpl="rr-docket"] .rr-photo{margin:0 auto 10px;border-radius:2px}',
      '.rr-sheet[data-tpl="rr-docket"] .rr-name{font-size:26px;font-weight:700;letter-spacing:.02em;line-height:1.25}',
      '.rr-sheet[data-tpl="rr-docket"] .rr-headline{font-size:13px;color:var(--rr-ink-2);margin-top:3px}',
      '.rr-sheet[data-tpl="rr-docket"] .rr-cis{justify-content:center;font-size:11px}',
      '.rr-sheet[data-tpl="rr-docket"] .rr-sec{margin-bottom:14px}',
      '.rr-sheet[data-tpl="rr-docket"] .rr-h2{counter-increment:rrsec;font-size:14px;letter-spacing:.02em;padding-bottom:4px;border-bottom:1px solid var(--rr-rule);margin-bottom:8px}',
      '.rr-sheet[data-tpl="rr-docket"] .rr-h2::before{content:counter(rrsec) ".";margin-right:8px}',
      '.rr-sheet[data-tpl="rr-docket"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_INK = [
      // 宣纸衬线（复刻 Inkawake）：米黄纸底 + 「正文无衬线 + 标题衬线」混排 + 青瓷节标题
      '.rr-sheet[data-tpl="rr-ink"]{--rr-paper:#fbf8f1;background:var(--rr-paper)}',
      // 原型预设整份衬线（rrVars 行内字体），这套按原设计在内容层覆写成混排
      '.rr-sheet[data-tpl="rr-ink"] header,.rr-sheet[data-tpl="rr-ink"] .rr-sec{font-family:PingFang SC,Noto Sans SC,Helvetica Neue,Arial,sans-serif}',
      '.rr-sheet[data-tpl="rr-ink"] .rr-h2,.rr-sheet[data-tpl="rr-ink"] .rr-name{font-family:Georgia,Source Serif 4,Noto Serif SC,Songti SC,serif}',
      '.rr-sheet[data-tpl="rr-ink"] .rr-head{text-align:center;padding-bottom:14px;margin-bottom:16px;border-bottom:1px solid var(--rr-rule)}',
      '.rr-sheet[data-tpl="rr-ink"] .rr-photo{margin:0 auto 10px;border-radius:50%}',
      '.rr-sheet[data-tpl="rr-ink"] .rr-name{font-size:24px;font-weight:700;letter-spacing:.03em;line-height:1.3}',
      '.rr-sheet[data-tpl="rr-ink"] .rr-headline{font-size:12.5px;color:var(--rr-ink-2);margin-top:3px}',
      '.rr-sheet[data-tpl="rr-ink"] .rr-cis{justify-content:center;font-size:11px}',
      '.rr-sheet[data-tpl="rr-ink"] .rr-sec{margin-bottom:14px}',
      '.rr-sheet[data-tpl="rr-ink"] .rr-h2{color:var(--rr-primary);font-size:14px;letter-spacing:.08em;margin-bottom:8px}',
      '.rr-sheet[data-tpl="rr-ink"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_GLYPH = [
      // 双列编号（复刻 Glyphlab）：暖白纸 + 双列均分 + 「01」两位编号节标题
      '.rr-sheet[data-tpl="rr-glyph"]{--rr-paper:#fbf9f5;background:var(--rr-paper);counter-reset:rrsec}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-head{text-align:center;padding-bottom:14px;margin-bottom:18px;border-bottom:1px solid var(--rr-line)}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-photo{margin:0 auto 10px;border-radius:3px}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-name{font-size:24px;font-weight:800;letter-spacing:.01em;line-height:1.25}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-headline{font-size:12.5px;color:var(--rr-ink-2);margin-top:3px}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-cis{justify-content:center;font-size:11px}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-cols{gap:34px}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-sec{margin-bottom:15px}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-h2{counter-increment:rrsec;font-size:14px;letter-spacing:.02em;margin-bottom:8px}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-h2::before{content:counter(rrsec,decimal-leading-zero);margin-right:10px;font-size:.92em}',
      '.rr-sheet[data-tpl="rr-glyph"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_MEADOW = [
      // 绿茵图标（复刻 Meadow）：左窄栏淡绿底 + 图标节标题 + 主色贯穿标题与图标
      '.rr-sheet[data-tpl="rr-meadow"] .rr-cols{gap:0}',
      '.rr-sheet[data-tpl="rr-meadow"]{background:linear-gradient(90deg,var(--rr-rail) 0 var(--rr-rail-w),#fff var(--rr-rail-w))}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-lane[data-lane="0"]{padding:28px 20px}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-lane[data-lane="1"]{padding:28px 28px}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-head{text-align:center;padding-bottom:12px;margin-bottom:14px;border-bottom:1px solid var(--rr-rule)}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-photo{margin:0 auto 10px;border-radius:50%}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-name{font-size:20px;font-weight:800;line-height:1.3}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-headline{font-size:11px;color:var(--rr-ink-2);margin-top:2px;line-height:1.4}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-cis{display:block;margin-top:10px;font-size:10.5px}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-ci{display:flex;margin-bottom:4px;gap:6px;align-items:center}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-sec{margin-bottom:13px}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-h2.rr-hicon{display:flex;align-items:center;gap:7px;color:var(--rr-primary);font-size:13px;letter-spacing:.05em;margin-bottom:7px}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-hicon svg{flex:none;opacity:.95}',
      '.rr-sheet[data-tpl="rr-meadow"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_LAKE = [
      // 湖畔衬线（复刻 Lakeletter）：衬线 + 左淡绿侧栏 + 紧排大名字 + progress 进度条
      '.rr-sheet[data-tpl="rr-lake"] .rr-cols{gap:0}',
      '.rr-sheet[data-tpl="rr-lake"]{background:linear-gradient(90deg,var(--rr-rail) 0 var(--rr-rail-w),#fff var(--rr-rail-w))}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-lane[data-lane="0"]{padding:30px 22px}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-lane[data-lane="1"]{padding:30px 30px}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-head{text-align:left;padding-bottom:12px;margin-bottom:14px;border-bottom:1px solid var(--rr-rule)}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-photo{margin:0 0 10px;border-radius:4px}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-name{font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.2}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-headline{font-size:12px;color:var(--rr-ink-2);margin-top:4px;letter-spacing:.02em}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-cis{display:block;margin-top:10px;font-size:10.5px}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-ci{display:flex;margin-bottom:4px;gap:6px;align-items:center}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-sec{margin-bottom:14px}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-h2{color:var(--rr-primary);font-size:13.5px;letter-spacing:.04em;margin-bottom:9px}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-rate-progress{height:5px;border-radius:2.5px;margin-top:5px}',
      '.rr-sheet[data-tpl="rr-lake"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 20px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_LIGHT = [
      // 墨幕横幅（复刻 Lightcatch）：炭黑 banner + 栏方向翻转为左主右辅 + 宽字距装饰条标题
      '.rr-sheet[data-tpl="rr-light"] .rr-banner{position:relative;background:var(--rr-primary);color:#fff;padding:20px 140px 20px 30px;min-height:104px;display:flex;flex-direction:column;justify-content:center}',
      '.rr-sheet[data-tpl="rr-light"] .rr-banner .rr-photo{position:absolute;right:30px;top:50%;transform:translateY(-50%);border-radius:6px;border:3px solid rgba(255,255,255,.25)}',
      '.rr-sheet[data-tpl="rr-light"] .rr-name{font-size:26px;font-weight:800;letter-spacing:.04em;line-height:1.2}',
      '.rr-sheet[data-tpl="rr-light"] .rr-headline{font-size:12px;color:rgba(255,255,255,.85);margin-top:3px;letter-spacing:.06em}',
      '.rr-sheet[data-tpl="rr-light"] .rr-banner .rr-cis{color:rgba(255,255,255,.88);margin-top:8px;font-size:10.5px;gap:3px 14px}',
      '.rr-sheet[data-tpl="rr-light"] .rr-banner .rr-ci svg{color:rgba(255,255,255,.85)}',
      // 原型固定「辅栏在左」，这套按原设计用 row-reverse 翻成左主右辅（量测按 DOM 顺序，不受影响）
      '.rr-sheet[data-tpl="rr-light"] .rr-cols{flex-direction:row-reverse;padding:0 30px;gap:24px}',
      '.rr-sheet[data-tpl="rr-light"] .rr-lane{padding:18px 0 26px}',
      '.rr-sheet[data-tpl="rr-light"] .rr-sec{margin-bottom:13px}',
      '.rr-sheet[data-tpl="rr-light"] .rr-h2{border-left:3px solid var(--rr-primary);padding-left:9px;letter-spacing:.12em;font-size:12.5px;margin-bottom:8px}',
      '.rr-sheet[data-tpl="rr-light"] .rr-grid{display:grid;grid-template-columns:1fr 1fr;gap:2px 18px}',
    ].join(String.fromCharCode(10));
    const RR_CSS_ALL = [RR_CSS, RR_CSS_BRONZOR, RR_CSS_AZURILL, RR_CSS_GLALIE, RR_CSS_CHIKORITA, RR_CSS_DITTO, RR_CSS_LAPRAS, RR_CSS_PORYGON, RR_CSS_DOCKET, RR_CSS_INK, RR_CSS_GLYPH, RR_CSS_MEADOW, RR_CSS_LAKE, RR_CSS_LIGHT, RR_CSS_TAIL].join(String.fromCharCode(10));


    // ========== 模板渲染 ·图标与文本工具 ==========
    // 图标是通用几何图元（信封/电话/定位/地球/链接），不是从 RR 拷来的资源。
    const RR_ICONS = {
      mail: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1.6" y="3.2" width="12.8" height="9.6" rx="1.4"/><path d="M2.2 4.4 8 8.6l5.8-4.2"/></svg>',
      phone: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M5.6 2.2H3.4a1.2 1.2 0 0 0-1.2 1.3c.3 4.6 4.1 8.4 8.7 8.7a1.2 1.2 0 0 0 1.3-1.2v-2.2l-2.6-.9-1.3 1.3a9.4 9.4 0 0 1-3.4-3.4l1.3-1.3-.6-2.3Z"/></svg>',
      pin: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M8 14s5-4.7 5-8A5 5 0 0 0 3 6c0 3.3 5 8 5 8Z"/><circle cx="8" cy="6" r="1.7"/></svg>',
      globe: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="5.8"/><path d="M2.4 8h11.2M8 2.2c1.9 1.9 1.9 9.7 0 11.6M8 2.2c-1.9 1.9-1.9 9.7 0 11.6"/></svg>',
      link: '<svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" stroke-width="1.3"><path d="M6.4 9.6a2.6 2.6 0 0 0 3.7 0l1.9-1.9a2.6 2.6 0 0 0-3.7-3.7l-1 1"/><path d="M9.6 6.4a2.6 2.6 0 0 0-3.7 0L4 8.3a2.6 2.6 0 0 0 3.7 3.7l1-1"/></svg>',
      dot: '<svg viewBox="0 0 16 16" width="11" height="11"><circle cx="8" cy="8" r="2" fill="currentColor"/></svg>',
    };

    // 节标题图标（title:'icon' 的模板用，如 rr-meadow）：通用几何图元，stroke 跟随文字色。
    const SEC_ICONS = {
      profiles: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="5.4" r="2.6"/><path d="M2.8 13.4a5.2 5.2 0 0 1 10.4 0"/></svg>',
      summary: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M4 1.8h5.6l3 2.8v9.6H4Z"/><path d="M9.4 1.8v3h3.2M5.8 8h4.4M5.8 10.4h4.4"/></svg>',
      experience: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="5" width="12" height="8" rx="1.4"/><path d="M5.8 5V3.6A1.2 1.2 0 0 1 7 2.4h2a1.2 1.2 0 0 1 1.2 1.2V5M2 8.6h12"/></svg>',
      education: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 2.6 14.6 5.6 8 8.6 1.4 5.6Z"/><path d="M4.4 7v3.2c0 1 1.6 1.9 3.6 1.9s3.6-.9 3.6-1.9V7M13.4 6.4v3.6"/></svg>',
      projects: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="2" y="2" width="5.4" height="5.4" rx="1"/><rect x="8.6" y="2" width="5.4" height="5.4" rx="1"/><rect x="2" y="8.6" width="5.4" height="5.4" rx="1"/><rect x="8.6" y="8.6" width="5.4" height="5.4" rx="1"/></svg>',
      volunteer: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 13.4C4.2 10.2 2 8 2 5.6A2.9 2.9 0 0 1 8 4.4a2.9 2.9 0 0 1 6 1.2c0 2.4-2.2 4.6-6 7.8Z"/></svg>',
      languages: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M13.8 8.8a1.6 1.6 0 0 1-1.6 1.6H6.2L3 13V3.4a1.6 1.6 0 0 1 1.6-1.6h7.6a1.6 1.6 0 0 1 1.6 1.6Z"/></svg>',
      skills: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="8" r="5.6"/><path d="M5.6 8.2 7.2 9.8l3.2-3.4"/></svg>',
      interests: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 2l1.4 4.6L14 8l-4.6 1.4L8 14l-1.4-4.6L2 8l4.6-1.4Z"/></svg>',
      certifications: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><circle cx="8" cy="6" r="3.4"/><path d="M5.8 8.8 4.6 14l3.4-2 3.4 2-1.2-5.2"/></svg>',
      awards: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M5 2.4h6v3.4a3 3 0 0 1-6 0Z"/><path d="M5 3.4H2.8a2.2 2.2 0 0 0 2.4 2.6M11 3.4h2.2a2.2 2.2 0 0 1-2.4 2.6M8 8.8v2.6M5.6 13.6h4.8"/></svg>',
      publications: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><path d="M8 3.4C6.6 2.4 4.6 2 2.2 2v10c2.4 0 4.4.4 5.8 1.4 1.4-1 3.4-1.4 5.8-1.4V2c-2.4 0-4.4.4-5.8 1.4Z"/><path d="M8 3.4v10"/></svg>',
      references: '<svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.2"><rect x="1.8" y="3.4" width="12.4" height="9.2" rx="1.2"/><circle cx="5.6" cy="7.2" r="1.4"/><path d="M4 11.2c.3-1.2 3-1.2 3.2 0M9.4 6.4h3M9.4 9h3"/></svg>',
    };

    const rrEsc = (text) => String(text == null ? '' : text)
      .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
    const rrRich = (html) => sanitizeHtml(String(html == null ? '' : html));

    function rrHex(value, fallback) {
      const text = typeof value === 'string' ? value.trim() : '';
      return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(text) ? text : fallback;
    }

    function rrChannels(hex) {
      const text = rrHex(hex, '#000000').slice(1);
      const full = text.length === 3 ? text.split('').map((ch) => ch + ch).join('') : text;
      return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
    }

    /** 与白色/其它色混合：ratio 是**前者**的占比（0 = 全 b，1 = 全 a）。 */
    function rrMix(a, b, ratio) {
      const x = rrChannels(a);
      const y = rrChannels(b);
      const t = Math.max(0, Math.min(1, ratio));
      const part = (i) => Math.round(x[i] * t + y[i] * (1 - t)).toString(16).padStart(2, '0');
      return '#' + part(0) + part(1) + part(2);
    }

    /**
     * 中文优先的字体栈：PingFang SC / Noto Sans SC 打头，再把用户选的西文字体接在后面。
     * 预览、导出、离线截图都用这一个函数——字体不同会导致换行位置不同、量测高度失真。
     */
    const RR_FONT_TAIL = ",-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";
    function rrFontStack(resume) {
      const family = resume.metadata.typography.font.family;
      const extra = typeof family === 'string' && family.trim() !== '' && family !== 'Noto Sans SC' ? "'" + family.trim() + "'," : '';
      return "'PingFang SC','Noto Sans SC','Microsoft YaHei','Hiragino Sans GB'," + extra + RR_FONT_TAIL;
    }

    /** 页面级 CSS 变量（主题色派生出分隔线/弱化字/侧栏底色等）。 */
    function rrVars(resume, spec) {
      const meta = resume.metadata;
      const primary = rrHex(meta.theme.primary, spec.color);
      const ink = rrHex(meta.theme.text, '#1f2328');
      const size = Number(meta.typography.font.size) || spec.fontSize;
      const lineHeight = String(meta.typography.lineHeight == null ? spec.lineHeight : meta.typography.lineHeight);
      const margin = Number(meta.page.margin) || 0;
      const railWidth = spec.ratio === null ? 0 : spec.ratio[0];
      const declarations = [
        '--rr-primary:' + primary,
        '--rr-ink:' + ink,
        '--rr-ink-2:' + rrMix(ink, '#ffffff', 0.72),
        '--rr-ink-3:' + rrMix(ink, '#ffffff', 0.55),
        '--rr-rule:' + rrMix(primary, '#ffffff', 0.7),
        '--rr-line:' + rrMix(ink, '#ffffff', 0.85),
        '--rr-soft:' + rrMix(primary, '#ffffff', 0.14),
        '--rr-rail:' + rrMix(primary, '#ffffff', 0.1),
        '--rr-page:' + rrMix(primary, '#ffffff', 0.05),
        '--rr-rail-w:' + railWidth + '%',
        '--rr-label-w:25%',
      ];
      return 'color:' + ink
        + ';font-family:' + rrFontStack(resume)
        + ';font-size:' + size + 'px'
        + ';line-height:' + lineHeight
        + ';padding:' + margin + 'px'
        + ';' + declarations.join(';');
    }

    /** 照片位：没填 url 或勾了 hidden 就不渲染（照片位可显隐）。 */
    function rrPhotoHtml(resume, spec) {
      const picture = resume.basics.picture;
      const url = picture !== null && typeof picture === 'object' && typeof picture.url === 'string' ? picture.url.trim() : '';
      const hidden = picture !== null && typeof picture === 'object' && picture.effects !== null && typeof picture.effects === 'object' && picture.effects.hidden === true;
      if (url === '' || hidden) return '';
      const sizes = { 'photo-top-center': 84, 'photo-left': 96, rail: 96, 'top-left': 78, banner: 96, card: 84, 'card-table': 92 };
      const size = sizes[spec.header] === undefined ? 84 : sizes[spec.header];
      return '<img class="rr-photo" data-photo alt="" src="' + rrEsc(url) + '" style="width:' + size + 'px;height:' + size + 'px" />';
    }

    /** 评级控件（与 schema 的 skill.level 语义对齐：0-5）。 */
    function rrRatingHtml(kind, level, max) {
      const top = Number(max) > 0 ? Number(max) : 5;
      const value = Math.max(0, Math.min(top, Number(level) || 0));
      if (kind === 'progress') {
        return '<span class="rr-rate-progress"><i style="width:' + Math.round((value / top) * 100) + '%"></i></span>';
      }
      if (kind === 'stars') {
        let out = '';
        for (let i = 0; i < top; i += 1) out += i < value ? '★' : '☆';
        return '<span class="rr-rate rr-rate-stars">' + out + '</span>';
      }
      const cls = kind === 'squares' ? ' rr-rate-squares' : (kind === 'bars' ? ' rr-rate-bars' : '');
      let out = '';
      for (let i = 0; i < top; i += 1) out += '<i class="' + (i < value ? 'on' : '') + '"></i>';
      return '<span class="rr-rate' + cls + '">' + out + '</span>';
    }

    /** 条目首字段 / 次要字段（与 schema 的 ITEM_FIELDS 对齐）。 */
    const rrItemPrimary = (id, item) => {
      const fields = ITEM_FIELDS[id] || [];
      return fields.length === 0 ? '' : String(item[fields[0].key] == null ? '' : item[fields[0].key]);
    };
    const rrItemSecondary = (id, item) => {
      const fields = ITEM_FIELDS[id] || [];
      const parts = [];
      for (let index = 1; index < fields.length; index += 1) {
        const field = fields[index];
        if (field.key === 'summary' || field.key === 'level' || field.key === 'date') continue;
        const value = item[field.key];
        if (Array.isArray(value)) { if (value.length > 0) parts.push(value.join('、')); continue; }
        const text = String(value == null ? '' : value).trim();
        if (text !== '') parts.push(text);
      }
      return parts.join(' · ');
    };

    function rrItemHtml(id, item, spec) {
      if (id === 'profiles') {
        const username = String(item.username == null ? '' : item.username);
        const url = String(item.url == null ? '' : item.url);
        return '<div class="rr-item rr-prof" data-item><div class="rr-ihead"><b>' + rrEsc(item.network) + '</b></div>'
          + (username !== '' ? '<div class="rr-isub">' + rrEsc(username) + '</div>' : '')
          + (username === '' && url !== '' ? '<div class="rr-isub">' + rrEsc(url) + '</div>' : '')
          + '</div>';
      }
      if (id === 'skills' || id === 'languages' || id === 'interests') {
        const hasLevel = id !== 'interests';
        const keywords = Array.isArray(item.keywords) && item.keywords.length > 0
          ? item.keywords.join('、')
          : String(typeof item.keywords === 'string' && item.keywords !== '' ? item.keywords : (item.description == null ? '' : item.description));
        return '<div class="rr-item rr-skill" data-item>'
          + '<div class="rr-sname">' + rrEsc(item.name) + '</div>'
          + (keywords.trim() !== '' ? '<div class="rr-sdesc">' + rrEsc(keywords) + '</div>' : '')
          + (hasLevel ? rrRatingHtml(spec.rating, item.level, 5) : '')
          + '</div>';
      }
      const secondary = rrItemSecondary(id, item);
      const summary = String(item.summary == null ? '' : item.summary);
      const date = String(item.date == null ? '' : item.date);
      return '<div class="rr-item" data-item>'
        + '<div class="rr-ihead"><b>' + rrEsc(rrItemPrimary(id, item)) + '</b>' + (date !== '' ? '<span class="rr-idate">' + rrEsc(date) + '</span>' : '') + '</div>'
        + (secondary !== '' ? '<div class="rr-isub">' + rrEsc(secondary) + '</div>' : '')
        + (stripTags(summary) !== '' ? '<div class="rr-irich">' + rrRich(summary) + '</div>' : '')
        + '</div>';
    }


    // ========== 模板渲染 ·分栏计划 ==========
    /**
     * 栏内是否有任何可见内容——口径与 rrSectionHtml 的判空一致：
     * 板块隐藏 / summary 无正文 / 条目全部隐藏都算空。
     */
    function rrLaneHasContent(resume, ids) {
      return ids.some((id) => {
        const section = resume.sections[id];
        if (section === undefined || section === null || section.visible === false) return false;
        if (id === 'summary') return stripTags(section.content == null ? '' : section.content) !== '';
        return (section.items || []).some((item) => item.visible !== false);
      });
    }

    /**
     * 一份简历在某套模板下的分栏计划。
     * 单栏模板只有一栏；分栏模板按模板自己的板块归属切（顺序仍听用户的模块顺序）。
     * 某一栏没有任何可见内容时整版降级为单栏（spec 动态改 ratio/headerLane）——
     * 留着空侧栏 = 半边空白，是版式缺陷；降级后侧栏底色/栏宽/页头位置都自然走单栏路径。
     */
    function rrPlan(resume, pageBodyHeight) {
      const spec = templateSpec(resume.metadata.template);
      const ordered = orderedSectionIds(resume);
      let lanes;
      if (spec.ratio === null) {
        lanes = [ordered.slice()];
      } else {
        const layout = templateLayout(resume, spec.id)[0];
        lanes = layout.map((lane) => lane.slice());
        const seen = {};
        lanes.forEach((lane) => lane.forEach((id) => { seen[id] = true; }));
        const missing = ordered.filter((id) => seen[id] !== true);
        if (missing.length > 0) lanes[lanes.length - 1] = lanes[lanes.length - 1].concat(missing);
        const filled = lanes.filter((ids) => rrLaneHasContent(resume, ids));
        if (filled.length > 0 && filled.length < lanes.length) {
          lanes = filled;
          spec.ratio = null;
          if (spec.headerLane !== 'page') spec.headerLane = 'page';
        }
      }
      const laneOf = {};
      lanes.forEach((ids, index) => ids.forEach((id) => { laneOf[id] = index; }));
      const width = spec.ratio === null ? [100] : spec.ratio.slice();
      return { spec, lanes, laneOf, width, pageBodyHeight: typeof pageBodyHeight === 'number' ? pageBodyHeight : 0 };
    }

    function rrLaneStyle(plan, laneIndex) {
      if (plan.width.length <= 1) return '';
      const pct = laneIndex === 0 ? plan.width[0] : 100 - plan.width[0];
      return ' style="flex:0 0 ' + pct + '%"';
    }

    // ========== 模板渲染 ·板块与条目 ==========
    function rrSectionHtml(resume, id, spec, opts) {
      const section = resume.sections[id];
      if (section === null || section === undefined || section.visible === false) return '';
      const options = opts === null || opts === undefined ? {} : opts;
      const withHead = options.withHead !== false;
      // title:'icon'（如 rr-meadow）：节标题带图标，图标按 section id 匹配、缺图标的板块退化为纯文字标题
      const headHtml = withHead ? (spec.title === 'icon' && SEC_ICONS[id]
        ? '<h2 class="rr-h2 rr-hicon">' + SEC_ICONS[id] + '<span>' + rrEsc(section.name) + '</span></h2>'
        : '<h2 class="rr-h2">' + rrEsc(section.name) + '</h2>') : '';
      let bodyHtml = '';
      if (id === 'summary') {
        if (stripTags(section.content == null ? '' : section.content) === '') return '';
        bodyHtml = '<div class="rr-rich" data-body>' + rrRich(section.content) + '</div>';
      } else {
        const all = (section.items || []).filter((item) => item.visible !== false);
        const picked = Array.isArray(options.items) ? options.items.map((index) => all[index]).filter((item) => item !== undefined) : all;
        if (picked.length === 0) return '';
        const columns = id === 'profiles' ? 2 : (Number(section.columns) > 1 ? Math.min(5, Number(section.columns)) : 1);
        const nodes = picked.map((item) => rrItemHtml(id, item, spec)).join('');
        // N 列卡片必须用 grid（CSS 多栏会把一条技能从中间切开）；2 列走类，其余写行内
        const gridStyle = columns > 2 ? ' style="grid-template-columns:repeat(' + columns + ', minmax(0, 1fr))"' : '';
        bodyHtml = columns > 1
          ? '<div class="rr-grid" data-grid' + gridStyle + '>' + nodes + '</div>'
          : '<div data-body>' + nodes + '</div>';
      }
      if (spec.body === 'rows') {
        return '<section class="rr-sec rr-rowsec" data-sec-id="' + id + '">'
          + '<div class="rr-label">' + headHtml + '</div>'
          + '<div class="rr-content">' + bodyHtml + '</div>'
          + '</section>';
      }
      if (spec.body === 'cards') {
        return '<section class="rr-sec rr-card" data-sec-id="' + id + '">' + headHtml + bodyHtml + '</section>';
      }
      if (spec.body === 'bands') {
        return '<section class="rr-sec" data-sec-id="' + id + '">' + headHtml + '<div class="rr-secbody">' + bodyHtml + '</div></section>';
      }
      return '<section class="rr-sec" data-sec-id="' + id + '">' + headHtml + bodyHtml + '</section>';
    }

    /** 联系方式拆成 [图标, 文本] 对：页头、表格化联系行、侧栏都用同一份数据。 */
    function rrContactPairs(resume) {
      const basics = resume.basics;
      const pairs = [];
      const push = (icon, value) => {
        const text = String(value == null ? '' : value).trim();
        if (text !== '') pairs.push([icon, text]);
      };
      push('phone', basics.phone);
      push('mail', basics.email);
      push('pin', basics.location);
      if (basics.url !== null && typeof basics.url === 'object') push('globe', basics.url.href);
      for (const field of basics.customFields || []) {
        const value = String(field.value == null ? '' : field.value).trim();
        if (value === '') continue;
        const label = String(field.label == null ? '' : field.label);
        push('dot', (label === '' ? '' : label + '：') + value);
      }
      return pairs;
    }

    // ========== 模板渲染 ·页头（7 种形态，每套固定一种） ==========
    function rrHeaderHtml(resume, spec) {
      const basics = resume.basics;
      const name = rrEsc(basics.name);
      const headline = String(basics.headline == null ? '' : basics.headline).trim();
      const photo = rrPhotoHtml(resume, spec);
      const pairs = rrContactPairs(resume);
      const nameHtml = '<div class="rr-name">' + name + '</div>';
      const headlineHtml = headline === '' ? '' : '<div class="rr-headline">' + rrEsc(headline) + '</div>';
      const contactsHtml = pairs.length === 0 ? '' : '<div class="rr-cis">' + pairs.map((pair) => '<span class="rr-ci">' + (RR_ICONS[pair[0]] || RR_ICONS.dot) + '<span>' + rrEsc(pair[1]) + '</span></span>').join('') + '</div>';

      if (spec.header === 'photo-top-center') {
        return '<header class="rr-head" data-head>' + photo + nameHtml + headlineHtml + contactsHtml + '</header>';
      }
      if (spec.header === 'photo-left' || spec.header === 'top-left') {
        return '<header class="rr-head" data-head>' + photo + '<div class="rr-headmain">' + nameHtml + headlineHtml + contactsHtml + '</div></header>';
      }
      if (spec.header === 'rail') {
        return '<header class="rr-head" data-head>' + photo + nameHtml + headlineHtml + contactsHtml + '</header>';
      }
      if (spec.header === 'banner') {
        return '<header class="rr-banner" data-head>' + photo + nameHtml + headlineHtml + contactsHtml + '</header>';
      }
      if (spec.header === 'card') {
        return '<header class="rr-head rr-card" data-head>' + photo + '<div class="rr-headmain">' + nameHtml + headlineHtml + contactsHtml + '</div></header>';
      }
      if (spec.header === 'card-table') {
        const rows = pairs.map((pair) => '<div class="rr-crow">' + (RR_ICONS[pair[0]] || RR_ICONS.dot) + '<span>' + rrEsc(pair[1]) + '</span></div>').join('');
        return '<header class="rr-headcard" data-head>'
          + '<div class="rr-headtop"><div>' + nameHtml + headlineHtml + '</div>' + photo + '</div>'
          + (rows === '' ? '' : '<div class="rr-ctable">' + rows + '</div>')
          + '</header>';
      }
      return '<header class="rr-head" data-head>' + photo + nameHtml + headlineHtml + contactsHtml + '</header>';
    }

    // ========== 模板渲染 ·量测（用真实 DOM 高度，不猜） ==========
    /**
     * 量测层 HTML：与真实版面同宽同栏，包含全部板块（不截断），并带
     * data-head / data-sec-id / data-item / data-body / data-grid 标记供读取高度。
     */
    function rrMeasureHtml(resume, plan) {
      const spec = plan.spec;
      const header = rrHeaderHtml(resume, spec);
      const lanesHtml = plan.lanes.map((ids, laneIndex) => {
        const head = spec.headerLane === laneIndex ? header : '';
        const inner = ids.map((id) => rrSectionHtml(resume, id, spec, { withHead: true, items: null })).join('');
        return '<div class="rr-lane" data-lane="' + laneIndex + '"' + rrLaneStyle(plan, laneIndex) + '>' + head + inner + '</div>';
      }).join('');
      const aboveHeader = spec.headerLane === 'page' ? header : '';
      return '<div class="rr-sheet rr-measure" data-tpl="' + spec.id + '" style="' + rrVars(resume, spec) + ';min-height:0">'
        + aboveHeader + '<div class="rr-cols">' + lanesHtml + '</div></div>';
    }

    /**
     * 从 DOM 读出原始几何（offsetHeight **不含外边距**，必须显式加回来，
     * 否则每页会装多一点点，打印时被切）。
     *
     * 拆成「读几何」+「按模板判定」两步：离线截图工具在 Chrome 里读几何，
     * 再调同一个判定函数——量测口径只有一份，不会两边算出不同的页数。
     */
    function rrMeasureShape(sheet) {
      const size = (el) => {
        const css = getComputedStyle(el);
        return el.offsetHeight + (parseFloat(css.marginTop) || 0) + (parseFloat(css.marginBottom) || 0);
      };
      const headNode = sheet.querySelector('[data-head]');
      const head = headNode === null ? 0 : size(headNode);
      // 页边距为 0 的模板（侧栏/横幅）垂直留白在栏的 padding 上，必须一起从可用高度里扣掉，
      // 否则内容会一路顶到纸边被 overflow:hidden 裁掉。
      const pad = Array.prototype.map.call(sheet.querySelectorAll('[data-lane]'), (lane) => {
        const css = getComputedStyle(lane);
        return (parseFloat(css.paddingTop) || 0) + (parseFloat(css.paddingBottom) || 0);
      });
      const sections = {};
      for (const el of sheet.querySelectorAll('[data-sec-id]')) {
        const id = el.getAttribute('data-sec-id');
        const headEl = el.querySelector('h2');
        const items = Array.prototype.map.call(el.querySelectorAll('[data-item]'), size);
        const bodyEl = el.querySelector('[data-body]');
        const grid = el.querySelector('[data-grid]');
        sections[id] = {
          head: headEl === null ? 0 : size(headEl),
          items: grid === null ? items : [],
          body: bodyEl === null ? 0 : size(bodyEl),
          total: size(el),
          grid: grid !== null,
        };
      }
      return { head: head, pad: pad, sections: sections };
    }

    /** 几何 + 模板 → 分页用的高度表（多列板块整块不可拆；卡片板块通常整块，过高才允许续页）。 */
    function rrMeasureDecide(shape, plan) {
      const sections = {};
      for (const id of Object.keys(shape.sections)) {
        const raw = shape.sections[id];
        if (raw.grid === true) { sections[id] = { head: 0, items: [], body: 0, whole: raw.total }; continue; }
        let record = { head: raw.head, items: raw.items, body: raw.body, whole: null };
        if (plan.spec.body === 'cards' || plan.spec.body === 'bands') {
          if (plan.pageBodyHeight <= 0 || raw.total <= plan.pageBodyHeight) {
            record = { head: raw.head, items: [], body: raw.total, whole: raw.total };
          }
        }
        sections[id] = record;
      }
      return { head: shape.head, pad: shape.pad || [], sections: sections };
    }

    /** 预览用：量测层容器 → 高度表。 */
    function rrMeasureFrom(container, plan) {
      const sheet = container.classList !== undefined && container.classList.contains('rr-sheet') ? container : container.querySelector('.rr-sheet');
      if (sheet === null || sheet === undefined) return { head: 0, sections: {} };
      return rrMeasureDecide(rrMeasureShape(sheet), plan);
    }

    /** 量测结果 → 每栏的块序列（标题 + 条目，条目可续页；整块板块不拆）。 */
    function rrBlocksByLane(resume, plan, measure) {
      const spec = plan.spec;
      return plan.lanes.map((ids) => {
        const blocks = [];
        for (const id of ids) {
          const data = measure.sections[id];
          const section = resume.sections[id];
          if (data === undefined || section === undefined || section === null || section.visible === false) continue;
          if (data.whole !== null && data.whole !== undefined) {
            blocks.push({ id: id, kind: 'whole', index: -1, height: data.whole });
            continue;
          }
          // 左侧标签行式：标题在标签列里，不额外占内容高度（避免把板块算高），
          // 但仍要参与「标题不孤行」判断——用 guard 记它的高度，只用于保护、不占位。
          blocks.push({
            id: id,
            kind: 'head',
            index: -1,
            height: spec.body === 'rows' ? 0 : data.head,
            guard: spec.body === 'rows' ? data.head : 0,
          });
          if (data.items.length === 0) blocks.push({ id: id, kind: 'body', index: -1, height: data.body });
          else data.items.forEach((height, index) => blocks.push({ id: id, kind: 'item', index: index, height: height }));
        }
        return blocks;
      });
    }

    /**
     * 按栏独立分页：每一栏有自己的游标，侧栏内容不会「跳」到主栏里，
     * 主栏也不会因为侧栏排满了而提前换页。
     * 规则：标题不能孤行（与紧随的内容块一起放下），单块高于整页时允许溢出但不死循环。
     */
    function rrPaginate(perLane, pageHeight, firstPageByLane) {
      // pageHeight 可以是数字（所有栏一样）或数组（每栏扣掉自己的内边距/页头后不同）
      const restOf = (lane) => (Array.isArray(pageHeight) ? pageHeight[lane] : pageHeight);
      const pages = [];
      const pageAt = (index) => {
        while (pages.length <= index) pages.push({ used: perLane.map(() => 0), blocks: perLane.map(() => []) });
        return pages[index];
      };
      for (let lane = 0; lane < perLane.length; lane += 1) {
        let pageIndex = 0;
        const blocks = perLane[lane];
        for (let k = 0; k < blocks.length; k += 1) {
          const block = blocks[k];
          const next = blocks[k + 1];
          const need = block.height + (Number(block.guard) || 0) + (block.kind === 'head' && next !== undefined ? next.height : 0);
          const limit = (index) => (index === 0 ? firstPageByLane[lane] : restOf(lane));
          let guard = 0;
          while (pageAt(pageIndex).used[lane] + need > limit(pageIndex) && pageAt(pageIndex).used[lane] > 0 && guard < 500) {
            pageIndex += 1;
            guard += 1;
          }
          pageAt(pageIndex).blocks[lane].push(block);
          pageAt(pageIndex).used[lane] += block.height;
        }
      }
      if (pages.length === 0) pages.push({ used: perLane.map(() => 0), blocks: perLane.map(() => []) });
      return pages;
    }

    /** 一栏的块 → 片段（同板块的连续块合并；续页片段不重复标题）。 */
    function rrFragmentsOf(blocks) {
      const fragments = [];
      for (const block of blocks) {
        const last = fragments[fragments.length - 1];
        if (last !== undefined && last.id === block.id) {
          if (block.kind === 'head') last.withHead = true;
          else if (block.kind === 'item') last.items.push(block.index);
          else last.whole = true;
          continue;
        }
        fragments.push({
          id: block.id,
          // 整块板块（多列 grid / 卡片）也要带标题——它只有一段，不存在「续页不重复标题」的问题
          withHead: block.kind === 'head' || block.kind === 'whole',
          whole: block.kind === 'whole' || block.kind === 'body',
          items: block.kind === 'item' ? [block.index] : [],
        });
      }
      return fragments;
    }

    /** 分页结果 → 每页每栏的片段（预览与导出共用这一份）。 */
    function rrPageFragments(pages) {
      return pages.map((page) => page.blocks.map((blocks) => rrFragmentsOf(blocks)));
    }

    /** 渲染一页：header + 各栏片段。 */
    function rrSheetHtml(resume, opts) {
      const plan = opts.plan;
      const spec = plan.spec;
      const laneFragments = opts.lanes;
      const header = rrHeaderHtml(resume, spec);
      const lanesHtml = plan.lanes.map((ids, laneIndex) => {
        const fragments = laneFragments[laneIndex] || [];
        const inner = fragments.map((fragment, fi) => rrSectionHtml(resume, fragment.id, spec, {
          withHead: fragment.withHead,
          items: fragment.whole ? null : fragment.items,
        })).join('');
        const head = opts.withHeader && spec.headerLane === laneIndex ? header : '';
        return '<div class="rr-lane" data-lane="' + laneIndex + '"' + rrLaneStyle(plan, laneIndex) + '>' + head + inner + '</div>';
      }).join('');
      const aboveHeader = opts.withHeader && spec.headerLane === 'page' ? header : '';
      const total = opts.total === undefined ? 1 : opts.total;
      const index = opts.index === undefined ? 0 : opts.index;
      const pageNum = opts.showNumbers === false ? '' : '<div class="rr-pagenum">' + String(index + 1) + ' / ' + String(total) + '</div>';
      const flag = opts.overflow === true ? '<div class="rr-flag">第 ' + String(index + 1) + ' 页内容超出 A4，会被裁掉</div>' : '';
      return '<div class="rr-sheet rr-page" data-tpl="' + spec.id + '" data-page="' + String(index + 1) + '" data-overflow="' + (opts.overflow === true ? '1' : '0') + '" style="' + rrVars(resume, spec) + '">'
        + aboveHeader + '<div class="rr-cols">' + lanesHtml + '</div>' + pageNum + flag + '</div>';
    }

    /** 独立 HTML 文档（导出 PDF / 离线截图共用）。 */
    function rrDocumentHtml(resume, opts) {
      const plan = opts.plan;
      const pages = opts.pages;
      const css = opts.css === undefined ? '' : opts.css;
      const startIndex = opts.startIndex === undefined ? 0 : opts.startIndex;
      const total = opts.total === undefined ? pages.length : opts.total;
      const sheets = pages.map((lanes, offset) => rrSheetHtml(resume, {
        plan: plan,
        lanes: lanes,
        withHeader: startIndex + offset === 0,
        index: startIndex + offset,
        total: total,
        showNumbers: opts.showNumbers !== false,
        overflow: false,
      })).join('');
      const title = String(resume.basics.name == null ? '' : resume.basics.name) + ' - 简历';
      return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><title>' + rrEsc(title) + '</title><style>'
        + '@page{size:A4;margin:0}html,body{margin:0;padding:0;background:#fff}'
        + '.rr-page{break-after:page;page-break-after:always;margin:0 auto}'
        + '.rr-page:last-child{break-after:auto;page-break-after:auto}'
        + RR_CSS_ALL
        + (css === '' ? '' : String.fromCharCode(10) + css)
        + '</style></head><body>' + sheets + '</body></html>';
    }


    // ========== 中文 fixture（缩略卡 / 离线截图 / 分页自检共用） ==========
    // 缩略图必须是**真实渲染**：同一份 fixture、同一套渲染函数，只是整体缩小。
    const RR_FIXTURE_PHOTO = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" fill="#dde5ee"/>'
      + '<circle cx="48" cy="37" r="15" fill="#b3c1d1"/><path d="M16 96c0-17.7 14.3-32 32-32s32 14.3 32 32z" fill="#b3c1d1"/></svg>',
    );

    function rrSampleItems(sectionId, items) {
      return items.map((item, index) => Object.assign({ id: sectionId + '-' + String(index + 1), visible: true }, item));
    }

    /**
     * 一份中文样例简历（虚构）。scale = 'long' 时内容足够铺满两页 A4，
     * 用于验证分页是否得体（标题不孤行、条目不撕裂）。
     */
    function rrFixture(scale) {
      const long = scale === 'long';
      const resume = blankResume();
      const basics = resume.basics;
      basics.name = '张若辰';
      basics.headline = '高级前端工程师 · 跨端与体验架构';
      basics.email = 'ruochen.zhang@example.com';
      basics.phone = '+86 138 0013 8000';
      basics.location = '上海 · 徐汇';
      basics.url = { label: '个人主页', href: 'ruochen.dev' };
      basics.customFields = [{ id: 'cf-github', label: 'GitHub', value: 'github.com/ruochen-zh' }];
      basics.picture = Object.assign({}, basics.picture, { url: RR_FIXTURE_PHOTO });

      const sections = resume.sections;
      sections.summary.content = '<p>7 年前端研发经验，长期负责日活千万级产品的架构演进：主导多端统一渲染方案，把三端的重复实现收敛为一份代码；推动首屏性能从 3.4s 降到 1.1s。擅长在业务压力下做技术取舍，落地过组件库、埋点体系与灰度发布链路，也带过 4 人小组。</p>';

      sections.experience.items = rrSampleItems('exp', [
        {
          company: '星辰科技', position: '高级前端工程师', location: '上海', date: '2021.03 - 至今',
          summary: '<ul><li>主导多端统一渲染方案 Render-X，三端重复代码收敛 62%，新页面交付周期从 5 天降到 2 天。</li>'
            + '<li>重建首屏性能基线：路由级代码分割 + 关键资源预取，LCP 3.4s → 1.1s，跳出率下降 9%。</li>'
            + '<li>设计灰度与回滚链路（按用户分桶 + 秒级回滚），线上故障平均恢复时间从 26 分钟降到 4 分钟。</li>'
            + '<li>带 4 人小组，建立设计稿走查与 Code Review 规范，线上回归缺陷率下降 40%。</li></ul>',
        },
        {
          company: '云帆网络', position: '前端工程师', location: '杭州', date: '2018.07 - 2021.02',
          summary: '<ul><li>从 0 搭建组件库（38 个组件）与文档站，被 6 条业务线接入，样式不一致问题基本清零。</li>'
            + '<li>落地埋点与实验平台前端 SDK，支持 20+ 实验并行，实验配置从改代码变为运营自助。</li>'
            + '<li>优化长列表与图片加载，商品列表滚动帧率从 32fps 提升到稳定 58fps。</li></ul>',
        },
      ].concat(long ? [{
        company: '起点信息', position: '前端开发（实习）', location: '杭州', date: '2017.09 - 2018.06',
        summary: '<ul><li>参与后台管理系统重构，把 40 余个 jQuery 页面迁移到组件化方案。</li>'
          + '<li>编写表单校验与权限指令，重复表单开发工时下降约一半。</li></ul>',
      }] : []));

      sections.projects.items = rrSampleItems('proj', [
        {
          name: 'Render-X 跨端渲染引擎', description: '发起人 / 核心开发', date: '2022.06 - 2023.04',
          summary: '<ul><li>抽象渲染协议与差异层，Web / 小程序 / App 三端共用 87% 业务逻辑。</li>'
            + '<li>内置性能护栏：包体预算、渲染帧率、内存水位三项指标进 CI，劣化合入会被拦下。</li></ul>',
        },
        {
          name: '实验与埋点平台', description: '前端负责人', date: '2020.03 - 2021.01',
          summary: '<ul><li>统一事件模型与上报通道，端到端数据延迟从小时级降到分钟级。</li></ul>',
        },
      ]);

      sections.education.items = rrSampleItems('edu', [{
        institution: '浙江大学', studyType: '本科', area: '计算机科学与技术', score: 'GPA 3.8/4.0',
        date: '2014.09 - 2018.06',
        summary: '主修课程：数据结构与算法、操作系统、计算机网络、编译原理、人机交互。毕业设计为「面向移动端的增量渲染框架」。',
      }]);

      sections.skills.items = rrSampleItems('skill', [
        { name: '前端框架', description: 'React / Vue 生态', level: 5, keywords: 'React 18、Vue 3、状态管理、SSR' },
        { name: '工程化', description: '构建与质量体系', level: 4, keywords: 'Vite、Webpack、Turborepo、单元测试' },
        { name: '跨端', description: '一码多端', level: 4, keywords: 'React Native、小程序、Flutter' },
        { name: 'Node 与 BFF', description: '服务端聚合层', level: 4, keywords: 'Node.js、Koa、GraphQL' },
        { name: '可视化', description: '数据表达', level: 3, keywords: 'ECharts、Canvas、WebGL 入门' },
        { name: '协作与带人', description: '流程建设', level: 3, keywords: 'Code Review、技术方案评审、新人培养' },
      ]);

      sections.languages.items = rrSampleItems('lang', [
        { name: '中文', description: '母语', level: 5 },
        { name: '英语', description: '熟练阅读技术文档，可日常沟通', level: 4 },
      ]);

      sections.certifications.items = rrSampleItems('cert', [
        { name: '信息系统项目管理师', issuer: '工信部', date: '2020.11' },
        { name: 'CET-6', issuer: '教育部考试中心', date: '2016.12' },
      ]);

      sections.awards.items = rrSampleItems('award', [
        { title: '年度技术创新奖', awarder: '星辰科技', date: '2023.01', summary: '表彰 Render-X 在多端收敛上的落地效果。' },
      ]);

      sections.interests.items = rrSampleItems('int', [
        { name: '长跑', keywords: '半马 1h52m、每周 20km' },
        { name: '摄影', keywords: '街头、胶片' },
        { name: '开源', keywords: '组件库维护、技术写作' },
      ]);

      sections.profiles.items = rrSampleItems('prof', [
        { network: 'GitHub', username: 'github.com/ruochen-zh', url: 'https://github.com/ruochen-zh' },
        { network: '掘金', username: 'juejin.cn/user/ruochen', url: 'https://juejin.cn/user/ruochen' },
        { network: '个人博客', username: 'ruochen.dev/notes', url: 'https://ruochen.dev' },
      ]);

      return resume;
    }

    /** 一页纸（不测量、不分页）：缩略卡与「整份内容长什么样」的自检用。 */
    function rrSinglePageHtml(resume) {
      const plan = rrPlan(resume, 0);
      const lanes = plan.lanes.map((ids) => ids.map((id) => ({ id: id, withHead: true, whole: true, items: [] })));
      return rrSheetHtml(resume, { plan: plan, lanes: lanes, withHeader: true, index: 0, total: 1, showNumbers: false });
    }

/* ---- client/src/40-editor.js ---- */
/* ===========================================================================
 * dsh-upcv-workspace — client half, part 4: 简历导入与编辑器。
 *
 * 结构对齐 upcv.tech（docs/UPCV-RESUME-RE.md）：左栏逐项表单、右栏 A4 实时预览，
 * 数据模型是 Reactive Resume schema（由 05-schema.js 提供，两端同源）。
 *
 * 导入链路：文件（PDF/DOCX/TXT）或粘贴文本 → 前端抽文本 → 服务端 LLM 结构化 → 编辑器。
 * ======================================================================== */

    /** 富文本描述渲染（HTML 已经过白名单清洗）。 */
    function RichText({ html, className }) {
      if (typeof html !== 'string' || html.trim() === '') return null;
      return h('div', { className: className, dangerouslySetInnerHTML: { __html: sanitizeHtml(html) } });
    }

    /** 关键词数组 ↔ 输入框文本。 */
    function keywordsToText(value) {
      return Array.isArray(value) ? value.join('、') : '';
    }
    function textToKeywords(text) {
      const raw = String(text == null ? '' : text);
      if (raw.trim() === '') return [];
      return raw.split(/[、,，;；]+/).map((item) => item.trim()).filter((item) => item !== '');
    }

    // ========== 导入面板 ==========
    function ResumeImportPanel({ onDone, onCancel, aiStatus }) {
      const [mode, setMode] = React.useState('file');
      const [file, setFile] = React.useState(null);
      const [text, setText] = React.useState('');
      const [title, setTitle] = React.useState('');
      const [busy, setBusy] = React.useState('');
      const [error, setError] = React.useState('');
      const inputRef = React.useRef(null);

      const NOTICE = aiStatus && aiStatus.available === true ? '' : '⚠️ 本机没有可调用的模型，无法解析简历。请到 DSH 设置里确认模型。';

      const pickFile = (picked) => {
        if (!picked) return;
        setFile(picked);
        setError('');
        if (title === '') setTitle(picked.name.replace(/\.[^.]+$/, ''));
      };

      const run = async () => {
        setError('');
        try {
          let source = text;
          if (mode === 'file') {
            if (file === null) { setError('请先选择一份简历文件。'); return; }
            setBusy('正在提取文本...');
            source = await readResumeFileFull(file);
          }
          if (String(source).trim() === '') { setError('没有提取到内容，请改用粘贴文本。'); setBusy(''); return; }
          setBusy('正在解析结构（可能需要十几秒）...');
          const data = await apiPost('/resume/import', { text: source, targetJob: '' });
          setBusy('正在保存...');
          const saved = await storeSave('resumes', {
            title: title || (data.resume.basics.name ? data.resume.basics.name + '的简历' : '导入的简历'),
            source: 'import',
            data: data.resume,
            provider: data.provider,
            model: data.model,
          });
          onDone(saved.item);
        } catch (e) {
          setError((e && e.message) || '导入失败，请重试。');
        } finally {
          setBusy('');
        }
      };

      const humanSize = (bytes) => bytes < 1024 ? bytes + ' B' : bytes < 1048576 ? (bytes / 1024).toFixed(1) + ' KB' : (bytes / 1048576).toFixed(2) + ' MB';

      return h('div', { className: 'upcv-card' }, [
        h('h4', { className: 'upcv-card-title' }, '导入现有简历'),
        NOTICE !== '' && h('div', { className: 'upcv-notice' }, NOTICE),
        error !== '' && h('div', { className: 'upcv-error' }, '❌ ' + error),
        busy !== '' && h('div', { className: 'upcv-notice' }, '⏳ ' + busy),

        h('div', { style: { display: 'flex', gap: '8px', marginBottom: '12px' } }, [
          h('button', { className: 'upcv-chip' + (mode === 'file' ? ' on' : ''), style: { border: 'none', cursor: 'pointer' }, onClick: () => setMode('file') }, '上传文件'),
          h('button', { className: 'upcv-chip' + (mode === 'paste' ? ' on' : ''), style: { border: 'none', cursor: 'pointer' }, onClick: () => setMode('paste') }, '粘贴文本'),
        ]),

        // 刻意不做拖放目标：宿主用 document 级监听 + dragDepth 计数器管理「窗口级拖拽」，
        // 只有 dragleave 归零 / drop / dragend 三条解除路径。插件在这里 stopPropagation
        // 会截断这些事件，遮罩就永久卡住（必须重启才消失）——这个坑踩过一次。
        // 宿主已把窗口级拖拽用于会话附件，面板不再抢同一个拖放目标，改为点选文件。
        mode === 'file' && h('div', {
          className: 'upcv-drop',
          onClick: () => { if (inputRef.current) inputRef.current.click(); },
        }, [
          h('input', {
            ref: inputRef,
            type: 'file',
            accept: '.pdf,.docx,.txt,.md,.json',
            style: { display: 'none' },
            onChange: (e) => { pickFile(e.target.files && e.target.files[0]); if (e.target) e.target.value = ''; },
          }),
          file === null
            ? h('div', null, [h('div', { style: { fontSize: '28px' } }, '📄'), h('div', { className: 'upcv-muted' }, '点击选择简历文件'), h('div', { className: 'upcv-muted', style: { fontSize: '11px', marginTop: '4px' } }, '支持 PDF / DOCX / TXT / Markdown（≤10MB）；也可以切到「粘贴文本」')])
            : h('div', null, [h('div', { style: { fontSize: '28px' } }, '✅'), h('div', { style: { fontWeight: '600' } }, file.name), h('div', { className: 'upcv-muted' }, humanSize(file.size))]),
        ]),

        mode === 'paste' && h('textarea', {
          className: 'upcv-input',
          placeholder: '把简历内容粘贴到这里...',
          value: text,
          onChange: (e) => setText(e.target.value),
          style: { minHeight: '160px', resize: 'vertical', lineHeight: '1.7' },
        }),

        h('input', { className: 'upcv-input', placeholder: '简历名称（可选）', value: title, onChange: (e) => setTitle(e.target.value), style: { marginTop: '12px' } }),

        h('div', { style: { display: 'flex', gap: '10px', marginTop: '12px' } }, [
          h('button', { className: 'upcv-btn upcv-btn-primary', onClick: run, disabled: busy !== '' || !(aiStatus && aiStatus.available === true) }, busy !== '' ? busy : '开始解析'),
          h('button', { className: 'upcv-btn upcv-btn-secondary', onClick: onCancel, disabled: busy !== '' }, '取消'),
        ]),
      ]);
    }


    /** 技能/语言评级的文字形态（圆点 / 方形 / 星级）。 */
    /** 条目首字段（学校/公司/项目名/奖项名）。 */
    function itemPrimary(sectionId, item) {
      const fields = ITEM_FIELDS[sectionId] || [];
      if (fields.length === 0) return '';
      const value = item[fields[0].key];
      return value == null ? '' : String(value);
    }

    /** 条目的次要字段行（跳过首字段与摘要）。 */
    function itemSecondary(sectionId, item) {
      const fields = ITEM_FIELDS[sectionId] || [];
      const parts = [];
      for (let index = 1; index < fields.length; index += 1) {
        const field = fields[index];
        if (field.key === 'summary' || field.key === 'level') continue;
        const value = item[field.key];
        if (Array.isArray(value)) { if (value.length > 0) parts.push(value.join('、')); continue; }
        const text = String(value == null ? '' : value).trim();
        if (text !== '') parts.push(text);
      }
      return parts.join(' · ');
    }

    // ========== A4 预览与导出（14 套模板）==========
    // 预览、导出、离线截图三条链路都用 36-rr.js 的同一份 HTML 与同一份 CSS：
    // 只要两边不是同一份 DOM，量测高度和打印高度就会不一致（历史教训：导出总被吞掉最后一行）。
    const PX_PER_MM = 96 / 25.4;
    // 每页底部留出的安全余量：量测与打印的字体度量难免有几像素差异。
    const PAGE_SAFE_MM = 6;
    const PAGE_HEIGHT_MM = 297;

    /** 一份简历在当前模板下的分栏计划 + 每页可用高度。 */
    function resumePagePlan(resume) {
      const margin = Number(resume.metadata.page.margin) || 0;
      const available = PAGE_HEIGHT_MM * PX_PER_MM - 2 * margin;
      const pageLimit = Math.max(120, available - PAGE_SAFE_MM * PX_PER_MM);
      return { plan: rrPlan(resume, pageLimit), pageLimit: pageLimit, margin: margin };
    }

    /** 量测层 → 每个板块的真实高度（offsetHeight 不含外边距，必须显式加回来）。 */
    function useResumeMeasure(measureRef, plan) {
      const [measure, setMeasure] = React.useState(null);
      const lastKey = React.useRef('');
      React.useLayoutEffect(() => {
        const host = measureRef.current;
        if (host === null || host === undefined) return;
        const sheet = host.querySelector('.rr-sheet');
        if (sheet === null) return;
        const next = rrMeasureFrom(sheet, plan);
        const key = JSON.stringify(next);
        if (key !== lastKey.current) { lastKey.current = key; setMeasure(next); }
      });
      return measure;
    }

    /** 分页：拿到量测就按真实高度装箱；拿不到（首帧 / 服务端渲染）就退化成单页。 */
    function resumePageFragments(resume, measure, plan, pageLimit) {
      if (measure === null) {
        const lanes = plan.lanes.map((ids) => ids.map((id) => ({ id: id, kind: 'whole', index: -1 })));
        return [lanes.map((blocks) => rrFragmentsOf(blocks))];
      }
      const blocks = rrBlocksByLane(resume, plan, measure);
      const headerLane = plan.spec.headerLane;
      // 每栏自己的可用高度 = 页可用高度 − 该栏上下内边距（rail 模板 margin=0，留白在栏上）
      const pads = Array.isArray(measure.pad) ? measure.pad : [];
      const restByLane = plan.lanes.map((ids, index) => Math.max(120, pageLimit - (Number(pads[index]) || 0)));
      // 页级页头（居中/左侧/横幅/卡片）对所有栏都占高度；栏级页头（侧栏）只占那一栏
      const firstPageByLane = plan.lanes.map((ids, index) => {
        const hasHeader = headerLane === 'page' || headerLane === index;
        return hasHeader ? Math.max(80, restByLane[index] - (measure.head || 0)) : restByLane[index];
      });
      const pages = rrPaginate(blocks, restByLane, firstPageByLane);
      return rrPageFragments(pages);
    }

    function ResumePreview({ resume, onPages }) {
      if (resume == null) return null;
      const meta = resume.metadata;
      const computed = resumePagePlan(resume);
      const plan = computed.plan;
      const measureRef = React.useRef(null);
      const pagesRef = React.useRef(null);
      const measure = useResumeMeasure(measureRef, plan);
      const pages = resumePageFragments(resume, measure, plan, computed.pageLimit);
      const [overflowPages, setOverflowPages] = React.useState('');
      // 固定 A4 高 + 裁掉溢出会**静默丢内容**，所以每次渲染后都要检查并标出来。
      React.useLayoutEffect(() => {
        const node = pagesRef.current;
        if (node === null) return;
        const bad = [];
        for (const el of node.querySelectorAll('[data-page]')) {
          if (el.scrollHeight > el.clientHeight + 1) bad.push(el.getAttribute('data-page'));
        }
        const key = bad.join(',');
        setOverflowPages((prev) => (prev === key ? prev : key));
      });
      if (typeof onPages === 'function') onPages(pages);
      const showNumbers = !(meta.page.options != null && meta.page.options.pageNumbers === false);
      const customCss = meta.css != null && meta.css.visible === true && typeof meta.css.value === 'string' ? meta.css.value : '';
      const overflowSet = overflowPages === '' ? [] : overflowPages.split(',');
      const nodes = [h('div', {
        key: 'measure',
        className: 'upcv-measure',
        ref: measureRef,
        'aria-hidden': 'true',
        dangerouslySetInnerHTML: { __html: rrMeasureHtml(resume, plan) },
      })];
      pages.forEach((lanes, index) => {
        nodes.push(h('div', {
          key: 'page-' + index,
          className: 'upcv-page',
          dangerouslySetInnerHTML: {
            __html: rrSheetHtml(resume, {
              plan: plan,
              lanes: lanes,
              withHeader: index === 0,
              index: index,
              total: pages.length,
              showNumbers: showNumbers,
              overflow: overflowSet.indexOf(String(index + 1)) !== -1,
            }),
          },
        }));
      });
      if (customCss !== '') nodes.push(h('style', { key: 'custom-css' }, customCss.split('</style').join('')));
      return h('div', { className: 'upcv-pages', ref: pagesRef }, nodes);
    }

    /**
     * 导出用 HTML：用**预览算出的同一份分页**（pages: page → lane → fragment）逐页输出。
     * 导出管线（服务端 pdf.js / Chromium print-to-pdf）不动，只换这份 HTML。
     */
    function resumeToPrintHtml(resume, pageFragments) {
      const meta = resume.metadata;
      const computed = resumePagePlan(resume);
      const plan = computed.plan;
      const pages = Array.isArray(pageFragments) && pageFragments.length > 0
        ? pageFragments
        : [plan.lanes.map((ids) => ids.map((id) => ({ id: id, withHead: true, whole: true, items: [] })))];
      const customCss = meta.css != null && meta.css.visible === true && typeof meta.css.value === 'string'
        ? meta.css.value.split('</style').join('')
        : '';
      const showNumbers = !(meta.page.options != null && meta.page.options.pageNumbers === false);
      return rrDocumentHtml(resume, { plan: plan, pages: pages, showNumbers: showNumbers, css: customCss });
    }

    /** 单个字段的编辑控件（按字段定义选 input / textarea / 关键词 / 等级）。 */
    function FieldInput({ field, value, onChange }) {
      if (field.key === 'keywords') {
        return h('input', { className: 'upcv-input upcv-input-sm', placeholder: field.label + '（顿号分隔）', value: keywordsToText(value), onChange: (e) => onChange(textToKeywords(e.target.value)) });
      }
      if (field.key === 'level') {
        const current = Number(value) || 3;
        return h('select', { className: 'upcv-input upcv-input-sm', value: String(current), onChange: (e) => onChange(Number(e.target.value)) },
          [1, 2, 3, 4, 5].map((n) => h('option', { key: n, value: String(n) }, n + ' / 5')));
      }
      if (field.multiline) {
        return h('textarea', {
          className: 'upcv-input upcv-input-sm',
          placeholder: field.label + (field.rich ? '（支持 <ul><li> 与 <strong> 强调）' : ''),
          value: value == null ? '' : String(value),
          rows: field.rich ? 4 : 2,
          onChange: (e) => onChange(e.target.value),
        });
      }
      return h('input', { className: 'upcv-input upcv-input-sm', placeholder: field.label, value: value == null ? '' : String(value), onChange: (e) => onChange(e.target.value) });
    }

    // ========== 模板面板（14 套真实设计 + 色板）与模块顺序面板 ==========
    // 缩略图是**真渲染**：同一份中文 fixture 走同一套 rrSinglePageHtml，再整体 zoom 缩小。
    // 不做假图、不手搓 markup —— 缩略图和右侧预览必须是同一份渲染结果。
    const TEMPLATE_THUMB_ZOOM = 0.186;

    function TemplateThumb({ templateId }) {
      const html = React.useMemo(() => rrSinglePageHtml(applyTemplate(rrFixture('short'), templateId)), [templateId]);
      return h('div', { className: 'upcv-tplthumb', dangerouslySetInnerHTML: { __html: html } });
    }

    function TemplatePanel({ resume, onChange, collapsed, setCollapsed }) {
      const current = normalizeTemplateId(resume.metadata.template);
      const spec = templateSpec(current);
      const isCollapsed = collapsed.template === true;
      const pick = (id) => onChange(applyTemplate(resume, id));
      const pickColor = (hex) => onChange(setThemeColor(resume, 'primary', hex));
      return h('div', { className: 'upcv-panel' }, [
        h('div', { className: 'upcv-panel-head', onClick: () => setCollapsed({ ...collapsed, template: !isCollapsed }) }, [
          h('span', { className: 'upcv-panel-title' }, (isCollapsed ? '▸ ' : '▾ ') + '模板'),
          h('span', { className: 'upcv-muted' }, spec.name),
        ]),
        !isCollapsed && h('div', { className: 'upcv-panel-body' }, [
          h('div', { className: 'upcv-muted', style: { fontSize: '11px', marginBottom: '8px' } },
            '14 套真实版式（8 套移植自 Reactive Resume + 6 套复刻自 Evarlio 免费模板，均按中文排版调参）：点一张即换整套骨架——页头 / 分栏 / 标题 / 评级一并切换'),
          h('div', { className: 'upcv-tpl-grid' }, TEMPLATES.map((pair) => h('button', {
            key: pair[0],
            className: 'upcv-tplcard' + (current === pair[0] ? ' on' : ''),
            title: pair[1] + '（' + pair[0] + '）',
            onClick: () => pick(pair[0]),
          }, [
            h(TemplateThumb, { key: 'thumb', templateId: pair[0] }),
            h('span', { key: 'name', className: 'upcv-tplname' }, pair[1]),
          ]))),
          h('div', { className: 'upcv-opt-row' }, [
            h('div', { className: 'upcv-opt-label' }, '主色'),
            h('div', { className: 'upcv-opt-items' }, spec.palette.map((pair) => h('button', {
              key: pair[0],
              className: 'upcv-swatch' + (String(resume.metadata.theme.primary).toLowerCase() === pair[0] ? ' on' : ''),
              style: { background: pair[0] },
              title: pair[1] + ' ' + pair[0],
              onClick: () => pickColor(pair[0]),
            }))),
          ]),
          h('div', { className: 'upcv-muted', style: { fontSize: '11px', marginTop: '2px' } },
            '主色可独立于模板调整（换模板会回到该模板的默认色；只改色不会动版式）'),
        ]),
      ]);
    }

    function OrderPanel({ resume, onChange, collapsed, setCollapsed }) {
      const isCollapsed = collapsed.order === true;
      // 栏目分工由模板决定，这里只排「全局顺序」（上移/下移一格）
      const ids = orderedSectionIds(resume);
      const total = ids.length;
      const row = (id, index) => {
        const section = resume.sections[id];
        const count = section == null ? 0 : (section.items || []).filter((item) => item.visible !== false).length;
        const detail = section == null ? '' : (id === 'summary' ? (stripTags(section.content || '') === '' ? '未填写' : '已填写') : count + ' 项');
        return h('div', { className: 'upcv-order-row', key: id }, [
          h('span', { className: 'upcv-order-name' }, section == null ? id : section.name),
          h('span', { className: 'upcv-order-detail' }, detail),
          h('button', { className: 'upcv-mini', disabled: index === 0, onClick: () => onChange(moveSectionOrder(resume, id, -1)) }, '↑'),
          h('button', { className: 'upcv-mini', disabled: index === total - 1, onClick: () => onChange(moveSectionOrder(resume, id, 1)) }, '↓'),
        ]);
      };
      const blocks = ids.map((id, index) => row(id, index));
      return h('div', { className: 'upcv-panel' }, [
        h('div', { className: 'upcv-panel-head', onClick: () => setCollapsed({ ...collapsed, order: !isCollapsed }) }, [
          h('span', { className: 'upcv-panel-title' }, (isCollapsed ? '▸ ' : '▾ ') + '模块顺序'),
          h('span', { className: 'upcv-muted' }, String(total) + ' 个板块'),
        ]),
        !isCollapsed && h('div', { className: 'upcv-panel-body' }, blocks),
      ]);
    }

    // ========== 样式面板（照网站的 dynamic-style 面板）==========
    /**
     * 排版设置面板：字体 / 字号 / 行高 / 页边距 / 照片位 / 自定义 CSS。
     *
     * 各套模板各自决定页头、分栏、标题体系与评级样式，所以这里不再有
     * 「页头样式 / 版式 / 板块标题 / 技能样式 / 页面背景」那 5 组开关——
     * 那些选项上一轮是拿来做 45 套等效近似的，现在由模板自己负责。
     */
    function StylePanel({ resume, onChange, collapsed, setCollapsed }) {
      const metadata = resume.metadata;
      const isCollapsed = collapsed.style === true;
      const picture = resume.basics.picture || {};
      const effects = picture.effects || {};
      const setPicture = (patch) => onChange({ ...resume, basics: { ...resume.basics, picture: { ...picture, ...patch } } });
      const setPictureEffects = (patch) => setPicture({ effects: { ...effects, ...patch } });

      const selectRow = (label, values, value, onPick, format) => h('div', { className: 'upcv-opt-row' }, [
        h('div', { className: 'upcv-opt-label' }, label),
        h('div', { className: 'upcv-opt-items' }, values.map((item) => h('button', {
          key: String(item),
          className: 'upcv-chip' + (String(item) === String(value) ? ' on' : ''),
          style: { border: 'none', cursor: 'pointer' },
          onClick: () => onPick(item),
        }, format(item)))),
      ]);

      const pickPhoto = (event) => {
        const file = event.target.files === null || event.target.files === undefined ? null : event.target.files[0];
        if (file === null || file === undefined) return;
        if (file.size > 2 * 1024 * 1024) { event.target.value = ''; return; }
        const reader = new FileReader();
        reader.onload = () => {
          setPicture({ url: String(reader.result || ''), effects: { ...effects, hidden: false } });
        };
        reader.readAsDataURL(file);
        event.target.value = '';
      };

      return h('div', { className: 'upcv-panel' }, [
        h('div', { className: 'upcv-panel-head', onClick: () => setCollapsed({ ...collapsed, style: !isCollapsed }) }, [
          h('span', { className: 'upcv-panel-title' }, (isCollapsed ? '▸ ' : '▾ ') + '排版'),
          h('span', { className: 'upcv-muted' }, metadata.typography.font.size + 'px · ' + String(metadata.typography.lineHeight) + ' · ' + (Number(metadata.page.margin) || 0) + 'px'),
        ]),
        !isCollapsed && h('div', { className: 'upcv-panel-body' }, [
          selectRow('字体', FONT_FAMILIES.map((f) => f[0]), metadata.typography.font.family, (v) => onChange(setFontFamily(resume, v)), (v) => (FONT_FAMILIES.find((f) => f[0] === v) || [null, v])[1] + ' ' + v),
          selectRow('字号', FONT_SIZES, metadata.typography.font.size, (v) => onChange(setFontSize(resume, Number(v))), (v) => v + 'px'),
          selectRow('行高', LINE_HEIGHTS, String(metadata.typography.lineHeight), (v) => onChange(setLineHeight(resume, v)), (v) => v),
          selectRow('页边距', PAGE_MARGINS, metadata.page.margin, (v) => onChange(setPageMargin(resume, Number(v))), (v) => v + 'px'),
          h('div', { className: 'upcv-opt-row' }, [
            h('div', { className: 'upcv-opt-label' }, '照片位'),
            h('div', { className: 'upcv-opt-items', style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } }, [
              h('button', {
                key: 'toggle',
                className: 'upcv-chip' + (effects.hidden === true ? '' : ' on'),
                style: { border: 'none', cursor: 'pointer' },
                onClick: () => setPictureEffects({ hidden: effects.hidden !== true }),
              }, effects.hidden === true ? '已隐藏' : '显示中'),
              h('label', { key: 'upload', className: 'upcv-mini', style: { cursor: 'pointer' } }, [
                '上传照片',
                h('input', { key: 'file', type: 'file', accept: 'image/*', style: { display: 'none' }, onChange: pickPhoto }),
              ]),
              picture.url ? h('button', { key: 'clear', className: 'upcv-mini', onClick: () => setPicture({ url: '' }) }, '移除') : null,
            ]),
          ]),
          h('div', { className: 'upcv-muted', style: { fontSize: '11px', margin: '0 0 8px' } },
            '照片位是否出现在简历上由上面的开关决定；不同模板的尺寸与圆角各自适配。'),
          h('div', { className: 'upcv-opt-row' }, [
            h('div', { className: 'upcv-opt-label' }, '自定义 CSS'),
            h('div', { className: 'upcv-opt-items' }, [
              h('textarea', {
                className: 'upcv-input upcv-input-sm',
                rows: 4,
                placeholder: '高级功能：直接编写 CSS 代码来自定义简历样式，修改后实时预览。',
                value: metadata.css.value == null ? '' : metadata.css.value,
                onChange: (e) => onChange(setCustomCss(resume, e.target.value)),
              }),
            ]),
          ]),
        ]),
      ]);
    }

    // ========== 编辑器页面 ==========
    // 网站的三档缩放（Anc / Znc）
    const ZOOM_SCALES = [1, 0.85, 0.7];
    const ZOOM_LABELS = ['默认尺寸', '中等尺寸', '最小尺寸'];

    function readStoredZoom() {
      try {
        const stored = localStorage.getItem('resume-zoom-level');
        const index = stored === null ? 0 : Number.parseInt(stored, 10);
        return Number.isFinite(index) && index >= 0 && index < ZOOM_SCALES.length ? index : 0;
      } catch (e) { return 0; }
    }

    function ResumeEditorPage({ t, onBack, aiStatus, recordId }) {
      const [record, setRecord] = React.useState(null);
      const [missing, setMissing] = React.useState(false);
      const [saveState, setSaveState] = React.useState('');
      const [collapsed, setCollapsed] = React.useState({ style: true });
      // 网站的缩放：三档循环 [1, 0.85, 0.7]，档位存 localStorage['resume-zoom-level']
      const [zoomIndex, setZoomIndex] = React.useState(readStoredZoom);
      const wrapRef = React.useRef(null);
      const timerRef = React.useRef(null);
      // 预览算出的分页结果，导出 PDF 用它，保证预览与打印逐页一致。
      const pagesRef = React.useRef(null);
      // 导出结果的提示（不要复用 saveState：那是自动保存的状态，文案会串台）
      const [exportMsg, setExportMsg] = React.useState('');

      React.useEffect(() => {
        let alive = true;
        storeList('resumes').then((data) => {
          if (!alive) return;
          const found = (data.items || []).find((item) => item.id === recordId);
          if (found === undefined) { setMissing(true); return; }
          setRecord(found);
        }).catch(() => { if (alive) setMissing(true); });
        return () => { alive = false; };
      }, [recordId]);

      // 照抄网站的做法：对被缩放的容器做 transform: scale(x)，并用 minHeight 补上缩放后的高度，
      // 避免缩小时下方留出未缩放高度的空白。
      React.useLayoutEffect(() => {
        const wrap = wrapRef.current;
        if (wrap === null) return;
        const scale = ZOOM_SCALES[zoomIndex];
        wrap.style.transform = 'scale(' + scale + ')';
        wrap.style.transformOrigin = 'top center';
        const page = wrap.firstElementChild;
        const height = page !== null && page.offsetHeight > 0 ? page.offsetHeight : 1123;
        wrap.style.height = (height * scale) + 'px';
      }, [zoomIndex, record]);
      // 防抖自动保存：改一个字就保存会打爆磁盘，停 700ms 再写
      const persist = (next) => {
        if (timerRef.current !== null) clearTimeout(timerRef.current);
        setSaveState('saving');
        timerRef.current = setTimeout(() => {
          storeSave('resumes', { id: next.id, title: next.title, targetJob: next.targetJob, source: next.source, data: next.data })
            .then(() => setSaveState('saved'))
            .catch(() => setSaveState('error'));
        }, 700);
      };

      const applyResume = (nextResume) => {
        if (record === null) return;
        const next = { ...record, data: nextResume };
        setRecord(next);
        persist(next);
      };
      const applyRecord = (patch) => {
        if (record === null) return;
        const next = { ...record, ...patch };
        setRecord(next);
        persist(next);
      };

      if (missing) {
        return h('div', { className: 'upcv-page' }, [
          h('div', { className: 'upcv-back', onClick: onBack }, '← 返回'),
          h('div', { className: 'upcv-error' }, '找不到这份简历，可能已被删除。'),
        ]);
      }
      if (record === null) {
        return h('div', { className: 'upcv-page' }, [
          h('div', { className: 'upcv-back', onClick: onBack }, '← 返回'),
          h('p', { className: 'upcv-muted' }, '载入中...'),
        ]);
      }

      const resume = record.data;
      const savedText = saveState === 'saving' ? '保存中...' : saveState === 'saved' ? '已保存' : saveState === 'error' ? '保存失败' : '';

      /** 触发浏览器下载一个 Blob。 */
      const downloadBlob = (blob, fileName) => {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
      };

      /**
       * 兜底导出：写进隐藏 iframe 调 print()，打印不可用则下载 HTML。
       *
       * 正常路径走服务端（见 exportPdf）——插件服务端拿不到 electron，
       * 但可以拉起本机 Chromium 的 --headless --print-to-pdf，产出真 PDF 文件。
       * 这条 fallback 只在服务端不可用时才走。
       */
      const exportResumeHtml = (html, fileName, notify) => {
        const report = (message) => { if (typeof notify === 'function') notify(message); };
        const fallback = () => {
          try {
            downloadBlob(new Blob([html], { type: 'text/html;charset=utf-8' }), fileName);
            report('已改为下载 HTML：用浏览器打开后「打印 → 另存为 PDF」');
          } catch (err) {
            report('导出失败：既打不开打印窗口，也无法下载文件');
          }
        };
        const frame = document.createElement('iframe');
        frame.setAttribute('aria-hidden', 'true');
        frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;visibility:hidden';
        document.body.appendChild(frame);
        const cleanup = () => { try { frame.remove(); } catch (err) { /* 忽略 */ } };
        const win = frame.contentWindow;
        if (win === null) { cleanup(); fallback(); return; }
        try {
          const doc = win.document;
          doc.open();
          doc.write(html);
          doc.close();
        } catch (err) { cleanup(); fallback(); return; }
        setTimeout(() => {
          try {
            win.focus();
            win.print();
            report('已调起打印：在打印对话框里选「另存为 PDF」');
            setTimeout(cleanup, 60000);
          } catch (err) {
            cleanup();
            fallback();
          }
        }, 300);
      };

      /**
       * 导出 PDF。
       *
       * 先走服务端：把与预览**同一份** HTML 发给 /pdf/export，
       * 服务端拉起本机 Chromium 打印成 PDF 后作为附件回传 —— 和网站一样是真文件下载。
       * 服务端不可用（没有浏览器 / 被拦）时退回打印窗口，再不行退回下载 HTML。
       */
      const exportPdf = async () => {
        setExportMsg('正在生成 PDF…');
        const html = resumeToPrintHtml(resume, pagesRef.current);
        const pdfName = (resume.basics.name || 'resume') + '-简历.pdf';
        let reason = '';
        try {
          const res = await fetch(API_BASE + '/pdf/export', {
            method: 'POST',
            headers: { 'content-type': 'application/json', [ACTION_HEADER]: '1' },
            body: JSON.stringify({ html: html, filename: pdfName }),
          });
          const type = String(res.headers.get('content-type') || '');
          if (res.ok === true && type.indexOf('application/pdf') === 0) {
            const blob = await res.blob();
            downloadBlob(blob, pdfName);
            setExportMsg('已生成 PDF（' + Math.max(1, Math.round(blob.size / 1024)) + ' KB）并开始下载');
            return;
          }
          const data = await res.json().catch(() => null);
          reason = data !== null && (data.message || data.error) !== undefined ? String(data.message || data.error) : ('HTTP ' + String(res.status));
        } catch (err) {
          reason = String(err && err.message ? err.message : err);
        }
        const head = '服务端生成失败（' + reason.slice(0, 70) + '）→ ';
        setExportMsg(head + '改用打印窗口…');
        exportResumeHtml(html, (resume.basics.name || 'resume') + '.html', (message) => setExportMsg(head + message));
      };

      const basicsPanel = h('div', { className: 'upcv-panel', key: 'basics' }, [
        h('div', {
          className: 'upcv-panel-head',
          onClick: () => setCollapsed({ ...collapsed, basics: !collapsed.basics }),
        }, [
          h('span', { className: 'upcv-panel-title' }, (collapsed.basics ? '▸ ' : '▾ ') + '基本信息'),
          h('span', { className: 'upcv-muted' }, resume.basics.name || '未填写'),
        ]),
        !collapsed.basics && h('div', { className: 'upcv-panel-body' }, [
          BASICS_FIELDS.map((field) => h('label', { className: 'upcv-field', key: field.key }, [
            h('span', { className: 'upcv-field-label' }, field.label),
            h('input', {
              className: 'upcv-input upcv-input-sm',
              placeholder: field.label,
              value: resume.basics[field.key] == null ? '' : String(resume.basics[field.key]),
              onChange: (e) => applyResume(updateBasics(resume, field.key, e.target.value)),
            }),
          ])),
          h('label', { className: 'upcv-field' }, [
            h('span', { className: 'upcv-field-label' }, '个人主页'),
            h('input', {
              className: 'upcv-input upcv-input-sm',
              placeholder: 'https://',
              value: resume.basics.url && resume.basics.url.href ? resume.basics.url.href : '',
              onChange: (e) => {
                const nextBasics = { ...resume.basics, url: { label: '个人主页', href: e.target.value } };
                applyResume({ ...resume, basics: nextBasics });
              },
            }),
          ]),
          (resume.basics.customFields || []).map((field) => h('label', { className: 'upcv-field', key: field.id }, [
            h('span', { className: 'upcv-field-label' }, [
              h('input', {
                className: 'upcv-input upcv-input-sm',
                placeholder: '字段名',
                value: field.label || '',
                onChange: (e) => applyResume(updateCustomField(resume, field.id, 'label', e.target.value)),
              }),
            ]),
            h('div', { style: { display: 'flex', gap: '6px' } }, [
              h('input', {
                className: 'upcv-input upcv-input-sm',
                placeholder: '内容',
                value: field.value || '',
                onChange: (e) => applyResume(updateCustomField(resume, field.id, 'value', e.target.value)),
              }),
              h('button', { className: 'upcv-mini', onClick: () => applyResume(removeCustomField(resume, field.id)) }, '删除'),
            ]),
          ])),
          h('button', { className: 'upcv-mini', onClick: () => applyResume(addCustomField(resume, '', '')) }, '+ 自定义字段'),
        ]),
      ]);

      const sectionPanel = (id) => {
        const section = resume.sections[id];
        if (section == null) return null;
        const items = Array.isArray(section.items) ? section.items : [];
        const isCollapsed = collapsed[id] === true;
        return h('div', { className: 'upcv-panel', key: id }, [
          h('div', { className: 'upcv-panel-head', onClick: () => setCollapsed({ ...collapsed, [id]: !isCollapsed }) }, [
            h('span', { className: 'upcv-panel-title' }, (isCollapsed ? '▸ ' : '▾ ') + section.name),
            h('span', { className: 'upcv-muted' }, id === 'summary' ? (stripTags(section.content || '') === '' ? '未填写' : '已填写') : items.length + ' 项'),
            h('button', {
              className: 'upcv-mini',
              onClick: (e) => { e.stopPropagation(); applyResume(setSection(resume, id, { visible: section.visible === false })); },
            }, section.visible === false ? '已隐藏' : '显示中'),
          ]),
          !isCollapsed && h('div', { className: 'upcv-panel-body' }, [
            id === 'summary'
              ? h('textarea', {
                  className: 'upcv-input upcv-input-sm',
                  placeholder: '个人总结 / 自我评价',
                  rows: 4,
                  value: section.content || '',
                  onChange: (e) => applyResume(setSection(resume, id, { content: e.target.value })),
                })
              : h('div', null, [
                  items.map((item) => h('div', { className: 'upcv-item', key: item.id }, [
                    h('div', { className: 'upcv-item-head' }, [
                      h('span', { className: 'upcv-item-title' }, itemPrimary(id, item) || '未命名'),
                      h('button', { className: 'upcv-mini', title: '上移', onClick: () => applyResume(moveItem(resume, id, item.id, -1)) }, '↑'),
                      h('button', { className: 'upcv-mini', title: '下移', onClick: () => applyResume(moveItem(resume, id, item.id, 1)) }, '↓'),
                      h('button', {
                        className: 'upcv-mini',
                        onClick: () => applyResume(updateItem(resume, id, item.id, 'visible', item.visible === false)),
                      }, item.visible === false ? '已隐藏' : '隐藏'),
                      h('button', { className: 'upcv-mini', onClick: () => applyResume(removeItem(resume, id, item.id)) }, '删除'),
                    ]),
                    (ITEM_FIELDS[id] || []).map((field) => h('label', { className: 'upcv-field', key: field.key }, [
                      h('span', { className: 'upcv-field-label' }, field.label),
                      h(FieldInput, {
                        field: field,
                        value: item[field.key],
                        onChange: (value) => applyResume(updateItem(resume, id, item.id, field.key, value)),
                      }),
                    ])),
                  ])),
                  h('button', { className: 'upcv-mini', onClick: () => applyResume(addItem(resume, id)) }, '+ 添加一项'),
                ]),
          ]),
        ]);
      };

      return h('div', { className: 'upcv-editor' }, [
        h('div', { className: 'upcv-editor-bar' }, [
          h('div', { className: 'upcv-back', onClick: onBack, style: { marginBottom: '0' } }, '← 返回'),
          h('input', {
            className: 'upcv-input upcv-input-sm',
            style: { maxWidth: '220px' },
            value: record.title || '',
            placeholder: '简历名称',
            onChange: (e) => applyRecord({ title: e.target.value }),
          }),
          h('span', { className: 'upcv-muted', style: { fontSize: '12px' } }, savedText),
          h('div', { style: { marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' } }, [
            exportMsg !== '' && h('span', { className: 'upcv-muted', style: { fontSize: '11px', maxWidth: '340px' } }, exportMsg),
            h('button', {
              className: 'upcv-mini',
              title: '缩放视图 (' + ZOOM_LABELS[zoomIndex] + ')',
              onClick: () => {
                const next = (zoomIndex + 1) % ZOOM_SCALES.length;
                setZoomIndex(next);
                localStorage.setItem('resume-zoom-level', String(next));
              },
            }, '🔍'),
            h('button', { className: 'upcv-btn upcv-btn-primary', style: { padding: '6px 14px', fontSize: '13px' }, onClick: exportPdf }, '导出 PDF'),
          ]),
        ]),
        h('div', { className: 'upcv-editor-body' }, [
          h('div', { className: 'upcv-editor-form' }, [
            h(TemplatePanel, { key: 'template', resume: resume, onChange: applyResume, collapsed: collapsed, setCollapsed: setCollapsed }),
            h(OrderPanel, { key: 'order', resume: resume, onChange: applyResume, collapsed: collapsed, setCollapsed: setCollapsed }),
            h(StylePanel, { key: 'style', resume: resume, onChange: applyResume, collapsed: collapsed, setCollapsed: setCollapsed }),
            basicsPanel,
].concat(orderedSectionIds(resume).map(sectionPanel))),
          h('div', { className: 'upcv-editor-preview' }, h('div', { className: 'upcv-page-wrap', ref: wrapRef }, h(ResumePreview, { resume: resume, onPages: (pages) => { pagesRef.current = pages; } }))),
        ]),
      ]);
    }

/* ---- client/src/90-register.js ---- */
/* ===========================================================================
 * dsh-upcv-workspace — client half, part 9: 插件注册.
 *
 * 手写 __ModuleLoader__ 包（无打包器、无 JSX）：client/src/*.js 按文件名顺序
 * 由 scripts/build-client.mjs 拼成 lib/client.js。只使用平台种子 `react`。
 * ======================================================================== */
    // ========== 插件注册 ==========
    // 工作台身份由宿主按这个 GitHub repository 解析（本地 tarball 没有市场条目），
    // 因此它必须与 package.json 的 repository 字段一致。
    const REPOSITORY = 'https://github.com/1445688048/dsh-upcv-workspace';

    /**
     * 面板级错误边界：任何渲染异常都在面板内兜底并显示堆栈，而不是让宿主整块黑屏
     * （宿主自己的 PanelBoundary 只显示一句「业务面板加载失败」，看不到原因）。
     */
    class PanelErrorBoundary extends React.Component {
      constructor(props) {
        super(props);
        this.state = { error: null };
      }

      static getDerivedStateFromError(error) {
        return { error: error };
      }

      componentDidCatch(error) {
        console.error('[dsh-upcv-workspace] 面板渲染出错', error);
      }

      render() {
        if (this.state.error !== null) {
          return h('div', { className: 'upcv-panel-error' }, [
            h('p', null, '求职工作台面板出错：' + String(this.state.error && this.state.error.message || this.state.error)),
            h('pre', null, String(this.state.error && this.state.error.stack || '')),
            h('p', { className: 'upcv-muted' }, '这是面板内部兜底，已避免整块黑屏。请把上面的堆栈反馈给开发者。'),
          ]);
        }
        return this.props.children;
      }
    }

    function UpcvPanel(props) {
      return h(PanelErrorBoundary, null, h(Workbench, props));
    }

    // 调试出口：让 tests/panel-render.test.mjs 能用真实 React 逐个渲染各页面，
    // 在打包前就拦住「打开面板即黑屏」这类渲染期异常。
    if (typeof window !== 'undefined') {
      window.__upcvDebug = {
        Workbench: Workbench, HomePage: HomePage, ResumePage: ResumePage, InterviewPage: InterviewPage,
        BankPage: BankPage, JobsPage: JobsPage, JobRow: JobRow, jdPresetFromJob: jdPresetFromJob,
        salaryShort: salaryShort, relativeTime: relativeTime, jobSourceLabel: jobSourceLabel, JdPage: JdPage,
        ResumeImportPanel: ResumeImportPanel, ResumeEditorPage: ResumeEditorPage, ResumePreview: ResumePreview,
        blankResume: blankResume, resumeToPrintHtml: resumeToPrintHtml,
        TemplatePanel: TemplatePanel, OrderPanel: OrderPanel, StylePanel: StylePanel,
        // 14 套模板渲染层的公共入口（测试与离线截图工具用它，保证走的是同一份实现）
        templates: {
          list: TEMPLATES, spec: templateSpec, palette: templatePalette, normalize: normalizeTemplateId,
          plan: rrPlan, apply: applyTemplate, measureHtml: rrMeasureHtml, measureFrom: rrMeasureFrom,
          measureShape: rrMeasureShape, measureDecide: rrMeasureDecide, blocks: rrBlocksByLane,
          paginate: rrPaginate, pageFragments: rrPageFragments, fragmentsOf: rrFragmentsOf,
          sheetHtml: rrSheetHtml, documentHtml: rrDocumentHtml, singlePageHtml: rrSinglePageHtml,
          pagePlan: resumePagePlan, css: RR_CSS_ALL, fixture: rrFixture,
        },
      };
    }

    function apply(ctx) {
      ctx.effect(() => {
        const style = document.createElement('style');
        style.dataset.pluginCss = 'dsh-upcv-workspace';
        // 14 套模板的纸张样式与工作台 UI 样式分开维护（36-rr.js），一起注入
        style.textContent = css + String.fromCharCode(10) + RR_CSS_ALL;
        document.head.appendChild(style);
        return () => style.remove();
      }, 'upcv-styles');

      // 面板通过工作台宿主注册（宿主负责侧边栏入口与面板容器），不再自己占 sidebar slot。
      ctx.effect(() => ctx.desktopWorkbenches.register({
        title: '求职工作台',
        panelTitle: '求职',
        repository: REPOSITORY,
        description: 'AI 简历、模拟面试与岗位推荐：出题、语音作答、结构化评分与 PDF 导出',
        category: '求职',
        icon: '职',
        customFrame: true,
      }, UpcvPanel));
    }

    return { apply, inject: ['desktopWorkbenches'] }
  },
})

