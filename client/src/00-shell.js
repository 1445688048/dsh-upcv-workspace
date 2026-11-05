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
    const CLIENT_VERSION = '0.25.4';
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
    
