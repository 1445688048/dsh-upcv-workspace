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
