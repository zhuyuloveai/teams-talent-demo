/**
 * iCode Teams shared frontend styles (design variables + base classes).
 * Value rules: see the frontend shared style standard in engineering/docs; --ui-* variables are also the style contract of the plugin uiApi, so check plugin consumers before renaming any.
 */
export const designSystemCss = `
.framework-attentions{display:grid;gap:var(--ui-space-inner);padding:var(--ui-space-inner) var(--ui-block-padding-x)}.framework-attentions:empty{display:none}

:root{
--ui-color-workspace:#fff;--ui-color-workspace-soft:#f7f7fa;--ui-color-workspace-text:#282a35;--ui-color-workspace-muted:#737580;--ui-color-workspace-line:#e5e5ed;--ui-color-workspace-accent:#7855ae;--ui-color-workspace-tint:#f1ebf9;--ui-color-workspace-overlay:#20213238;
--ui-font-family-workspace:var(--ui-font-family);--ui-font-size-workspace:14px;--ui-font-size-workspace-table:13px;
--ui-font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC",sans-serif;--ui-font-family-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;
--ui-font-size-h1:clamp(2rem,6vw,4rem);--ui-font-size-h2:1.5rem;--ui-font-size-h3:1.17rem;--ui-font-size-body:14px;--ui-font-size-note:13px;--ui-font-size-caption:12px;--ui-font-size-eyebrow:11px;--ui-font-size-navigation:12px;--ui-font-size-project-toolbar:13px;
--ui-color-primary:#7855ae;--ui-color-primary-hover:#68459e;--ui-color-primary-deep:#68459e;--ui-color-primary-soft:#f1ebf9;--ui-color-primary-faint:#f4f2fa;--ui-color-primary-ghost:#fbfaff;--ui-color-ring:#c0abe4;
--ui-color-text:#282a35;--ui-color-text-secondary:#535563;--ui-color-nav:#737580;--ui-color-muted:#737580;--ui-color-faint:#8b8d98;--ui-color-disabled:#a1a1aa;
--ui-color-success:#08783e;--ui-color-success-soft:#e2f5e9;--ui-color-online:#16a34a;--ui-color-danger:#a12622;--ui-color-danger-soft:#fde9e7;--ui-color-warning:#b45309;--ui-color-warning-soft:#f9efdb;--ui-color-info:#1d4ed8;--ui-color-info-soft:#e8eefd;
--ui-color-avatar-1:#1f5c3f;--ui-color-avatar-2:#2e7d4f;--ui-color-avatar-3:#4f8a6b;--ui-color-avatar-4:#b46a17;--ui-color-avatar-5:#6d4a9e;--ui-color-avatar-text:#ffffff;
--ui-shadow-block:0 1px 2px #18181b08;--ui-shadow-card:0 1px 2px #18181b0f,0 3px 12px #18181b0a;--ui-shadow-glow-primary:0 1px 10px #9470c43d;--ui-shadow-glow-success:0 1px 10px #08783e33;--ui-shadow-glow-warning:0 1px 10px #b4530933;--ui-shadow-glow-info:0 1px 10px #1a5fb433;--ui-shadow-elevated:0 24px 80px #1c1c1c26;
--ui-color-bg:#f7f7fa;--ui-color-surface:#fff;--ui-color-surface-sunken:#f3f3f7;--ui-color-fill:#f7f7fa;
--ui-color-border:#e5e5ed;--ui-color-border-block:#e5e5ed;--ui-color-divider:#e5e5ed;
--ui-space-1:8px;--ui-space-2:12px;--ui-space-3:16px;
--ui-space-block:16px;--ui-space-inner:12px;
--ui-block-padding-y:24px;--ui-block-padding-x:24px;--ui-card-padding:18px;
--ui-border-block:1px solid var(--ui-color-border-block);
--ui-radius:9px;--ui-radius-card:12px;--ui-radius-block:16px;
}
/* Dark theme: palette taken from Chrys TUI (chrys/app/tui/theme.py); same-named variables are overridden and plugins follow automatically */
:root[data-theme='dark']{
--ui-color-workspace:#19191f;--ui-color-workspace-soft:#212128;--ui-color-workspace-text:#eeeef4;--ui-color-workspace-muted:#aaaab7;--ui-color-workspace-line:#383842;--ui-color-workspace-accent:#bca1ec;--ui-color-workspace-tint:#332b40;--ui-color-workspace-overlay:#08090b80;
--ui-color-primary:#bca1ec;--ui-color-primary-hover:#ccb4f0;--ui-color-primary-deep:#d9caff;--ui-color-primary-soft:#332b40;--ui-color-primary-faint:#2b2635;--ui-color-primary-ghost:#24212c;--ui-color-ring:#5f5faf;
--ui-color-text:#eeeef4;--ui-color-text-secondary:#d0d0db;--ui-color-nav:#aaaab7;--ui-color-muted:#aaaab7;--ui-color-faint:#85858e;--ui-color-disabled:#6b6b74;
--ui-color-success:#5fd75f;--ui-color-success-soft:#1f3325;--ui-color-online:#5fff87;--ui-color-danger:#ff5f5f;--ui-color-danger-soft:#3a2426;--ui-color-warning:#e3b341;--ui-color-warning-soft:#3a3220;--ui-color-info:#8ab4ff;--ui-color-info-soft:#1f2b47;
--ui-color-avatar-1:#3d8f66;--ui-color-avatar-2:#4fae7c;--ui-color-avatar-3:#6fae8f;--ui-color-avatar-4:#d98f2f;--ui-color-avatar-5:#9a72cf;--ui-color-avatar-text:#ffffff;
--ui-shadow-block:0 1px 2px #00000059;--ui-shadow-card:0 1px 2px #00000073,0 3px 12px #00000040;--ui-shadow-glow-primary:0 1px 12px #af87ff40;--ui-shadow-glow-success:0 1px 12px #5fd75f38;--ui-shadow-glow-warning:0 1px 12px #e3b34138;--ui-shadow-glow-info:0 1px 12px #6ab0f338;--ui-shadow-elevated:0 24px 80px #00000080;
--ui-color-bg:#19191f;--ui-color-surface:#19191f;--ui-color-surface-sunken:#1e1e25;--ui-color-fill:#212128;
--ui-color-border:#383842;--ui-color-border-block:#383842;--ui-color-divider:#383842;
/* Font families match the light theme: dark mode keeps the fonts, but the same-named variables are declared here too so both themes have matching variable lists */
--ui-font-family-mono:ui-monospace,SFMono-Regular,Menlo,Consolas,'Liberation Mono',monospace;
}
:root.theme-switching,:root.theme-switching *,:root.theme-switching *::before,:root.theme-switching *::after{transition:background-color .2s ease,border-color .2s ease,color .2s ease,box-shadow .2s ease,fill .2s ease,stroke .2s ease!important}
@media(prefers-reduced-motion:reduce){:root.theme-switching,:root.theme-switching *,:root.theme-switching *::before,:root.theme-switching *::after{transition:none!important}}
.ui-form{display:grid;gap:var(--ui-space-2)}.ui-field{display:grid;gap:5px;font-size:.8rem;font-weight:700}.ui-field input,.ui-field select{font:inherit;padding:9px;border:1px solid var(--ui-color-border);border-radius:var(--ui-radius)}.ui-actions{display:flex;gap:var(--ui-space-1);align-items:end;flex-wrap:wrap}.ui-note,.ui-empty{font-size:var(--ui-font-size-note);color:var(--ui-color-muted)}.ui-note.error{color:var(--ui-color-danger)}.ui-section{padding:var(--ui-space-3);border:1px solid var(--ui-color-border);border-radius:var(--ui-radius-card);background:var(--ui-color-surface)}
.ui-split{display:grid;grid-template-columns:minmax(0,2fr) minmax(240px,1fr);gap:var(--ui-space-block)}.ui-split-main,.ui-split-side{display:grid;align-content:start;gap:var(--ui-space-block);min-width:0}.ui-split-side{border-left:1px solid var(--ui-color-divider);padding-left:var(--ui-space-block)}@media(max-width:760px){.ui-split{grid-template-columns:minmax(0,1fr)}.ui-split-side{border-left:0;border-top:1px solid var(--ui-color-divider);padding-left:0;padding-top:var(--ui-space-block)}}
.ui-button,.ui-button-primary,.ui-button-secondary,.ui-button-danger{font:inherit;font-size:var(--ui-font-size-note);font-weight:700;padding:4px 15px;border:1px solid var(--ui-color-border);border-radius:var(--ui-radius);background:var(--ui-color-surface);color:var(--ui-color-text);cursor:pointer}.ui-button:hover{border-color:var(--ui-color-ring)}.ui-button-primary{background:var(--ui-color-primary);border-color:var(--ui-color-primary);color:var(--ui-color-surface)}.ui-button-secondary{background:var(--ui-color-primary-soft);border-color:transparent;color:var(--ui-color-primary-deep)}.ui-button-danger{background:var(--ui-color-danger);border-color:var(--ui-color-danger);color:var(--ui-color-surface)}.ui-button:disabled,.ui-button-primary:disabled,.ui-button-secondary:disabled,.ui-button-danger:disabled{cursor:not-allowed;opacity:.5}.ui-list{display:grid;gap:var(--ui-space-inner)}.ui-stack{display:grid;gap:var(--ui-space-inner);justify-items:start}.ui-stack>.ui-list{justify-self:stretch}.ui-stack>p{margin:0}.ui-table{width:100%;border-collapse:collapse;font-size:var(--ui-font-size-note)}.ui-table th{text-align:left;font-weight:700;color:var(--ui-color-muted);padding:6px 10px;border-bottom:1px solid var(--ui-color-border);white-space:nowrap}.ui-table td{padding:8px 12px;border-bottom:1px solid var(--ui-color-border)}.ui-table tbody tr{cursor:pointer}.ui-table tbody tr:hover{background:var(--ui-color-primary-soft)}
/* justify-items:start on .ui-stack shrinks its direct children to content width (only >.ui-list is exempt).
   Every "full-width body block" (two-column .ui-split, page title row, full-width collapsible section) must stretch explicitly,
   otherwise it is squeezed to content width: the layout skews, top-right actions end up bottom-left, and long path text wraps hard.
   This is the general layout contract of the .ui-stack container; plugins do not need to (and cannot) work around it with inline styles. */
.ui-stack>.ui-split,.ui-stack>.ui-panel-head,.ui-stack>details{justify-self:stretch}
/* The browser's display:none for [hidden] comes from the UA stylesheet, which ranks below any display in author stylesheets,
   so once an element gets a rule like .ui-dialog{display:flex}, the hidden attribute can no longer hide it.
   Plugins have no inline styles, so this contract rule is the backstop: any node with hidden set must really be invisible. */
[hidden]{display:none!important}
/* Message entry tone nodes/labels and filter chips (consumers of the open-data agent-session message stream):
   tone mapping: input=theme purple, thinking=warning amber, output=success green, tool=info blue, unrecognized=neutral. */
.ui-node-input{background:var(--ui-color-primary);box-shadow:var(--ui-shadow-glow-primary)}
.ui-node-thinking{background:var(--ui-color-warning);box-shadow:var(--ui-shadow-glow-warning)}
.ui-node-output{background:var(--ui-color-success);box-shadow:var(--ui-shadow-glow-success)}
.ui-node-tool{background:var(--ui-color-info);box-shadow:var(--ui-shadow-glow-info)}
.ui-node-unknown{background:var(--ui-color-faint)}
.ui-msg-kind{flex:none;font-size:var(--ui-font-size-caption);font-weight:700;padding:1px 7px;border-radius:var(--ui-radius);white-space:nowrap;background:var(--ui-color-fill);color:var(--ui-color-muted)}
.ui-kind-input{background:var(--ui-color-primary-soft);color:var(--ui-color-primary-deep)}
.ui-kind-thinking{background:var(--ui-color-warning-soft);color:var(--ui-color-warning)}
.ui-kind-output{background:var(--ui-color-success-soft);color:var(--ui-color-success)}
.ui-kind-tool{background:var(--ui-color-info-soft);color:var(--ui-color-info)}
.ui-kind-unknown{background:var(--ui-color-fill);color:var(--ui-color-muted)}
.ui-msg-title{font-weight:700;font-size:var(--ui-font-size-note);color:var(--ui-color-text);white-space:nowrap}
.ui-msg-preview{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ui-color-muted);font-size:var(--ui-font-size-note)}
.ui-msg-body{margin:0;white-space:pre-wrap;overflow-wrap:anywhere;font-size:var(--ui-font-size-note);line-height:1.55;color:var(--ui-color-text);max-height:280px;overflow-y:auto}
.ui-msg-body-mono{font-family:var(--ui-font-family-mono);font-size:var(--ui-font-size-caption)}
/* Message view enhancements (P2): search box, match highlight, turn separator rows; small copy button. */
.ui-search-input{font:inherit;font-size:var(--ui-font-size-note);padding:6px 10px;border:1px solid var(--ui-color-border);border-radius:var(--ui-radius);background:var(--ui-color-surface);color:var(--ui-color-text);min-width:180px}
.ui-mark{background:var(--ui-color-warning-soft);border-radius:2px}
.ui-turn-head{padding-top:10px;margin-top:2px;border-top:1px solid var(--ui-color-divider);font-size:var(--ui-font-size-note);font-weight:700;color:var(--ui-color-muted)}
.ui-turn-head:first-child{padding-top:0;border-top:0;margin-top:0}
.ui-msg-copy{flex:none;font:inherit;font-size:var(--ui-font-size-caption);padding:2px 8px;border:1px solid var(--ui-color-border);border-radius:var(--ui-radius);background:var(--ui-color-surface);color:var(--ui-color-muted);cursor:pointer}
/* Type filter chips: unselected=neutral outline, selected=colored by tone; counts always cover the full set. */
.ui-chip{font:inherit;font-size:var(--ui-font-size-caption);font-weight:700;padding:3px 10px;border:1px solid var(--ui-color-border);border-radius:999px;background:var(--ui-color-surface);color:var(--ui-color-muted);cursor:pointer}
.ui-chip-on-primary{background:var(--ui-color-primary-soft);border-color:transparent;color:var(--ui-color-primary-deep)}
.ui-chip-on-warning{background:var(--ui-color-warning-soft);border-color:transparent;color:var(--ui-color-warning)}
.ui-chip-on-success{background:var(--ui-color-success-soft);border-color:transparent;color:var(--ui-color-success)}
.ui-chip-on-info{background:var(--ui-color-info-soft);border-color:transparent;color:var(--ui-color-info)}
.ui-chip-on-neutral{background:var(--ui-color-fill);border-color:transparent;color:var(--ui-color-text-secondary)}
.ui-dialog{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(15,23,18,.36);z-index:1000}.ui-dialog-card{display:grid;gap:var(--ui-space-inner);width:min(420px,calc(100% - 2 * var(--ui-block-padding-x)));padding:var(--ui-block-padding-y) var(--ui-block-padding-x);background:var(--ui-color-surface);border:var(--ui-border-block);border-radius:var(--ui-radius-block);box-shadow:var(--ui-shadow-block)}.ui-dialog-card h3{margin:0}.ui-dialog-card p{margin:0;color:var(--ui-color-text-secondary)}.ui-dialog-card .ui-actions{justify-content:flex-end}
/* Full management dialog: wider card + separate title/action row; inside, a grid fills the space and scrolls so content never pushes the card out of the viewport */
.ui-dialog-wide{width:min(760px,calc(100% - 2 * var(--ui-block-padding-x)));max-height:calc(100% - 2 * var(--ui-block-padding-y));overflow:auto;align-content:start}
.ui-dialog-head{display:flex;gap:var(--ui-space-2);align-items:center;justify-content:space-between}
.ui-dialog-foot{display:flex;gap:var(--ui-space-1);justify-content:flex-end;flex-wrap:wrap}
/* Page title row: title on the left, actions on the right; with no title the actions still sit on the right */
.ui-panel-head{display:flex;gap:var(--ui-space-2);align-items:center;justify-content:space-between;flex-wrap:wrap}
/* Page top-right action area: must fill its row, otherwise flex-end has no room to push and the buttons stay on the left */
.ui-toolbar-end{display:flex;gap:var(--ui-space-1);align-items:center;justify-content:flex-end;flex-wrap:wrap;width:100%}
/* Session card title row: title takes the remaining width, status badge does not wrap */
.ui-session-head{display:flex;gap:var(--ui-space-2);align-items:baseline;justify-content:space-between}.ui-session-head p{margin:0;min-width:0;overflow-wrap:anywhere}
/* Sync status badge: each of the four states has its own background (syncing=theme purple, synced=success green, not reported=neutral, undeterminable=danger) */
.ui-status{flex:none;font-size:var(--ui-font-size-caption);font-weight:700;padding:2px 9px;border-radius:999px;white-space:nowrap;background:var(--ui-color-fill);color:var(--ui-color-muted)}
.ui-status-synced{background:var(--ui-color-success-soft);color:var(--ui-color-success)}
.ui-status-syncing{background:var(--ui-color-primary-soft);color:var(--ui-color-primary-deep)}
.ui-status-unreported{background:var(--ui-color-fill);color:var(--ui-color-text-secondary)}
.ui-status-unknown{background:var(--ui-color-danger-soft);color:var(--ui-color-danger)}
/* Attribution verdict badge (03 §13.6.5): shows only the verdict, not the source; **does not reuse .ui-status** (that carries sync-status semantics).
   caused=success green, partially_caused=theme purple, not_caused=neutral fill (not an error), undetermined=danger red. */
.ui-verdict{flex:none;font-size:var(--ui-font-size-caption);font-weight:700;padding:2px 9px;border-radius:999px;white-space:nowrap;background:var(--ui-color-fill);color:var(--ui-color-muted)}
.ui-verdict-caused{background:var(--ui-color-success-soft);color:var(--ui-color-success)}
.ui-verdict-partial{background:var(--ui-color-primary-soft);color:var(--ui-color-primary-deep)}
.ui-verdict-none{background:var(--ui-color-fill);color:var(--ui-color-text-secondary)}
.ui-verdict-undetermined{background:var(--ui-color-danger-soft);color:var(--ui-color-danger)}
/* Line-level source tags: both sources share shape and rules, distinguished only by text and color (commit=success green, local=theme purple, unattributed=muted neutral) */
.ui-tag{flex:none;font-size:var(--ui-font-size-caption);font-weight:700;padding:1px 7px;border-radius:var(--ui-radius);white-space:nowrap;background:var(--ui-color-fill);color:var(--ui-color-muted)}
.ui-tag-evidence{background:var(--ui-color-success-soft);color:var(--ui-color-success)}
.ui-tag-local{background:var(--ui-color-primary-soft);color:var(--ui-color-primary-deep)}
.ui-tag-muted{background:var(--ui-color-fill);color:var(--ui-color-faint)}
/* Line-by-line view: monospace font, fixed-width line-number column, content column does not wrap (ui-line-list scrolls horizontally; a line is never split in two) */
.ui-line-list{display:grid;gap:0;font-family:var(--ui-font-family-mono);font-size:var(--ui-font-size-caption);line-height:1.5;background:var(--ui-color-surface-sunken);border:1px solid var(--ui-color-border);border-radius:var(--ui-radius);overflow:auto;max-height:420px}
.ui-line-row{display:flex;align-items:baseline;gap:var(--ui-space-1);min-width:max-content;padding:1px var(--ui-space-1)}
.ui-line-gutter{flex:none;width:5em;text-align:right;color:var(--ui-color-faint);user-select:none}
.ui-line-body{flex:none;white-space:pre;color:var(--ui-color-text)}
`
