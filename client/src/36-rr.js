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

