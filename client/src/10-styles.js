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
    
