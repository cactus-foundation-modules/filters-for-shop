import type { Breakpoints } from '@/modules/shop/lib/breakpoints'

// Filter panel stylesheet, emitted once by the grid surface alongside shop's
// own shopCardCss. Class prefix `flt-`. Colours are tokens only, so the panel
// tracks the site's light/dark theme with no second palette to keep in step.
// Media queries can't read CSS custom properties, so the site's breakpoints are
// baked in at render time - same approach as the shop's own grids.
//
// Three layouts, one DOM:
// - Desktop (> tablet): always-visible panel; the sheet chrome (pill, scrim,
//   head, foot) is display:none and the drawer/body unwrap via display:contents.
// - Tablet (<= tablet): the drawer is a slide-over sheet from the right, opened
//   by a floating pill, with a scrim behind and an apply footer.
// - Phone (<= mobile): same sheet, but rising from the bottom edge.
export function shopFilterCss({ tabletBp, mobileBp }: Breakpoints): string {
  return `
.flt-wrap{display:grid;gap:28px;margin-top:8px}
.flt-pos-left{grid-template-columns:minmax(200px,240px) 1fr;align-items:start}
.flt-pos-top{grid-template-columns:1fr}
.flt-panel{display:flex;flex-direction:column;gap:4px;min-width:0}
.flt-pos-top .flt-panel{flex-direction:row;flex-wrap:wrap;gap:8px 28px;align-items:flex-start;padding-bottom:20px;border-bottom:1px solid var(--color-border)}
.flt-head{display:flex;align-items:baseline;justify-content:space-between;gap:8px;margin-bottom:6px}
.flt-pos-top .flt-head{flex:1 0 100%}
.flt-title{font-family:var(--display-family,Georgia,serif);font-size:18px;font-weight:600;margin:0;color:var(--color-fg);line-height:1.2}
.flt-clear{border:0;background:none;padding:0;font-size:13px;font-weight:600;color:var(--color-primary);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.flt-clear:hover{opacity:.8}
.flt-fab{display:none}
.flt-scrim{display:none}
.flt-sheet-head{display:none}
.flt-sheet-foot{display:none}
.flt-drawer{display:contents}
.flt-sheet-body{display:contents}
.flt-group{border:0;padding:0;margin:0;min-width:0;border-top:1px solid var(--color-border)}
.flt-pos-top .flt-group{border-top:0}
.flt-group-head{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;padding:11px 0;border:0;background:none;cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:var(--color-fg);text-align:left}
.flt-group-head:hover{color:var(--color-primary)}
.flt-group-name{display:inline-flex;align-items:center;gap:7px;min-width:0}
.flt-group-badge{display:inline-flex;align-items:center;justify-content:center;min-width:17px;height:17px;padding:0 4px;font-size:10px;font-weight:700;color:var(--color-primary-contrast,#fff);background:var(--color-primary);border-radius:999px;line-height:1}
.flt-chevron{flex:none;width:9px;height:9px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .15s ease;margin-right:2px}
.flt-group.is-closed .flt-chevron{transform:rotate(-45deg)}
.flt-group-body{padding:2px 0 14px}
.flt-group.is-closed .flt-group-body{display:none}
.flt-chips{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin-bottom:14px}
.flt-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;font-size:13px;color:var(--color-fg);background:var(--color-bg-subtle);border:1px solid var(--color-border);border-radius:999px;cursor:pointer;line-height:1}
.flt-chip:hover{border-color:var(--color-text-muted)}
.flt-chip-x{font-size:15px;line-height:1;color:var(--color-text-muted)}
.flt-ticks{display:flex;flex-direction:column;gap:7px}
.flt-pos-top .flt-ticks{flex-direction:row;flex-wrap:wrap;gap:14px}
.flt-tick{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--color-text);cursor:pointer;line-height:1.3}
.flt-tick input{accent-color:var(--color-primary);cursor:pointer;flex:none;width:15px;height:15px}
.flt-tick:hover{color:var(--color-fg)}
.flt-tick.is-dead{opacity:.45}
.flt-count{margin-left:auto;font-size:12px;color:var(--color-text-muted);font-variant-numeric:tabular-nums}
.flt-pos-top .flt-count{margin-left:0}
.flt-fold{align-self:flex-start;border:0;background:none;padding:2px 0;font-size:13px;font-weight:600;color:var(--color-primary);cursor:pointer;text-decoration:underline;text-underline-offset:2px}
.flt-fold:hover{opacity:.8}
.flt-select{width:100%;padding:7px 10px;font-size:14px;color:var(--color-text);background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px}
.flt-pos-top .flt-select{width:auto;min-width:10rem}
.flt-swatches{display:flex;flex-wrap:wrap;gap:8px}
.flt-swatch{display:inline-flex;align-items:center;gap:7px;padding:5px 10px 5px 6px;font-size:13px;color:var(--color-text);background:var(--color-surface);border:1px solid var(--color-border);border-radius:999px;cursor:pointer;line-height:1}
.flt-swatch:hover{border-color:var(--color-text-muted)}
.flt-swatch.is-on{border-color:var(--color-primary);box-shadow:0 0 0 1px var(--color-primary) inset;color:var(--color-fg);font-weight:600}
.flt-swatch.is-dead{opacity:.45}
.flt-swatch-dot{width:14px;height:14px;border-radius:999px;border:1px solid var(--color-border);flex:none;background-size:cover;background-position:center}
.flt-images{display:flex;flex-wrap:wrap;gap:10px}
.flt-image{display:flex;flex-direction:column;align-items:center;gap:5px;width:64px;padding:0;border:0;background:none;cursor:pointer;font:inherit;color:var(--color-text);line-height:1.2}
.flt-image-pic{width:56px;height:56px;object-fit:cover;display:block;border-radius:8px;border:1px solid var(--color-border);background:var(--color-bg-subtle)}
.flt-image-blank{border-style:dashed}
.flt-image:hover .flt-image-pic{border-color:var(--color-text-muted)}
.flt-image.is-on .flt-image-pic{border-color:var(--color-primary);box-shadow:0 0 0 2px var(--color-primary)}
.flt-image.is-on{color:var(--color-fg);font-weight:600}
.flt-image.is-dead{opacity:.45}
.flt-image-label{font-size:12px;text-align:center;overflow-wrap:anywhere}
.flt-toolbar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:10px 16px;margin-bottom:14px}
.flt-showing{margin:0;font-size:13px;color:var(--color-text-muted)}
.flt-sort{display:inline-flex;align-items:center;gap:8px;margin-left:auto;font-size:13px;color:var(--color-text-muted);white-space:nowrap}
.flt-sort-select{padding:7px 10px;font:inherit;font-size:14px;color:var(--color-text);background:var(--color-surface);border:1px solid var(--color-border);border-radius:8px;cursor:pointer;max-width:100%}
.flt-sort-select:hover{border-color:var(--color-text-muted)}
.flt-sort-select:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.flt-empty{margin:24px 0 0;font-size:14px;color:var(--color-text-muted)}
.flt-results{scroll-margin-top:var(--flt-sticky-top,7rem)}
.flt-chip:focus-visible,.flt-clear:focus-visible,.flt-fab:focus-visible,.flt-fold:focus-visible,.flt-group-head:focus-visible,.flt-image:focus-visible,.flt-sheet-close:focus-visible,.flt-swatch:focus-visible,.flt-foot-apply:focus-visible,.flt-foot-clear:focus-visible{outline:2px solid var(--color-primary);outline-offset:2px}
.flt-tick input:focus-visible{outline:2px solid var(--color-primary);outline-offset:1px}
@media (max-width:${tabletBp}){
  .flt-pos-left{grid-template-columns:1fr}
  .flt-head{display:none}
  .flt-panel{gap:0}
  .flt-pos-top .flt-panel{flex-direction:column;gap:0;padding-bottom:0;border-bottom:0}
  .flt-fab{position:fixed;left:50%;bottom:calc(18px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:1200;display:inline-flex;align-items:center;gap:8px;padding:12px 20px;font-size:14px;font-weight:600;color:var(--color-fg);background:var(--color-surface);border:1px solid var(--color-border);border-radius:999px;cursor:pointer;line-height:1;box-shadow:0 4px 18px rgb(0 0 0/.22)}
  .flt-fab-icon{width:15px;height:15px}
  .flt-fab-badge{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;font-size:11px;font-weight:700;color:var(--color-primary-contrast,#fff);background:var(--color-primary);border-radius:999px}
  .flt-scrim{display:block;position:fixed;inset:0;z-index:1201;background:rgb(0 0 0/.45);opacity:0;pointer-events:none;transition:opacity .25s ease}
  .flt-scrim.is-open{opacity:1;pointer-events:auto}
  .flt-drawer{position:fixed;z-index:1202;display:flex;flex-direction:column;background:var(--color-surface);color:var(--color-text);visibility:hidden;transition:transform .28s ease,visibility 0s linear .28s;top:0;right:0;bottom:0;width:min(400px,92vw);transform:translateX(102%);box-shadow:-8px 0 30px rgb(0 0 0/.18)}
  .flt-drawer.is-open{visibility:visible;transform:none;transition:transform .28s ease}
  .flt-sheet-head{display:flex;flex:none;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid var(--color-border)}
  .flt-sheet-close{display:inline-flex;align-items:center;justify-content:center;width:36px;height:36px;padding:0;border:0;border-radius:999px;background:var(--color-bg-subtle);color:var(--color-fg);cursor:pointer}
  .flt-sheet-close svg{width:16px;height:16px}
  .flt-sheet-body{display:block;flex:1;overflow-y:auto;overscroll-behavior:contain;padding:0 18px 12px;-webkit-overflow-scrolling:touch}
  .flt-sheet-body .flt-group:first-child{border-top:0}
  .flt-sheet-foot{display:flex;flex:none;align-items:center;gap:10px;padding:12px 18px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--color-border);background:var(--color-surface)}
  .flt-foot-apply{flex:1;padding:13px 18px;font-size:15px;font-weight:600;color:var(--color-primary-contrast,#fff);background:var(--color-primary);border:0;border-radius:999px;cursor:pointer;line-height:1}
  .flt-foot-apply:hover{opacity:.92}
  .flt-foot-clear{flex:none;padding:13px 16px;font-size:14px;font-weight:600;color:var(--color-fg);background:none;border:1px solid var(--color-border);border-radius:999px;cursor:pointer;line-height:1}
  .flt-foot-clear:disabled{opacity:.4;cursor:default}
  .flt-group-head{padding:14px 0;font-size:14px}
  .flt-tick{min-height:40px;font-size:15px}
  .flt-tick input{width:18px;height:18px}
  .flt-swatch{padding:9px 14px 9px 9px;font-size:14px}
  .flt-swatch-dot{width:16px;height:16px}
  .flt-select{padding:11px 12px}
  .flt-ticks{gap:0}
  .flt-pos-top .flt-ticks{flex-direction:column;gap:0}
  .flt-fold{padding:10px 0}
  .flt-pos-top .flt-count{margin-left:auto}
  .flt-pos-top .flt-select{width:100%}
}
@media (max-width:${mobileBp}){
  .flt-wrap{gap:20px}
  .flt-sort{width:100%;margin-left:0;justify-content:space-between}
  .flt-sort-select{flex:1 1 auto;min-width:0;padding:11px 12px}
  .flt-drawer{top:auto;right:0;bottom:0;left:0;width:auto;max-height:85vh;max-height:85dvh;border-radius:16px 16px 0 0;transform:translateY(102%);box-shadow:0 -8px 30px rgb(0 0 0/.18)}
}
@media (min-width:calc(${tabletBp} + 1px)){
  .flt-pos-left .flt-panel{position:sticky;top:var(--flt-sticky-top,7rem);max-height:calc(100vh - var(--flt-sticky-top,7rem) - 1rem);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
}
@media (prefers-reduced-motion:reduce){
  .flt-drawer,.flt-drawer.is-open,.flt-scrim,.flt-chevron{transition:none}
}
`
}
