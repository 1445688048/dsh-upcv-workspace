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
