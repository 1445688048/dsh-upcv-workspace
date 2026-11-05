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
