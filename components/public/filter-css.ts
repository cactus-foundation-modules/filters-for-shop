import type { Breakpoints } from '@/modules/shop/lib/breakpoints'

// Filter panel stylesheet, emitted once by the grid surface alongside shop's
// own shopCardCss. Class prefix `flt-`. Colours are tokens only, so the panel
// tracks the site's light/dark theme with no second palette to keep in step.
// Media queries can't read CSS custom properties, so the site's breakpoints are
// baked in at render time - same approach as the shop's own grids.
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
.flt-toggle{display:none}
.flt-group{border:0;padding:0;margin:0;min-width:0;border-top:1px solid var(--color-border)}
.flt-pos-top .flt-group{border-top:0}
.flt-group-head{display:flex;width:100%;align-items:center;justify-content:space-between;gap:8px;padding:11px 0;border:0;background:none;cursor:pointer;font:inherit;font-size:13px;font-weight:600;color:var(--color-fg);text-align:left}
.flt-group-head:hover{color:var(--color-primary)}
.flt-chevron{flex:none;width:9px;height:9px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(45deg);transition:transform .15s ease;margin-right:2px}
.flt-group.is-closed .flt-chevron{transform:rotate(-45deg)}
.flt-group-body{padding:2px 0 14px}
.flt-group.is-closed .flt-group-body{display:none}
.flt-chips{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px}
.flt-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;font-size:13px;color:var(--color-fg);background:var(--color-bg-subtle);border:1px solid var(--color-border);border-radius:999px;cursor:pointer;line-height:1}
.flt-chip:hover{border-color:var(--color-text-muted)}
.flt-chip-x{font-size:15px;line-height:1;color:var(--color-text-muted)}
.flt-ticks{display:flex;flex-direction:column;gap:7px}
.flt-pos-top .flt-ticks{flex-direction:row;flex-wrap:wrap;gap:14px}
.flt-tick{display:flex;align-items:center;gap:8px;font-size:14px;color:var(--color-text);cursor:pointer;line-height:1.3}
.flt-tick input{accent-color:var(--color-primary);cursor:pointer;flex:none}
.flt-tick:hover{color:var(--color-fg)}
.flt-tick.is-dead{opacity:.45}
.flt-count{margin-left:auto;font-size:12px;color:var(--color-text-muted);font-variant-numeric:tabular-nums}
.flt-pos-top .flt-count{margin-left:0}
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
.flt-showing{margin:0 0 14px;font-size:13px;color:var(--color-text-muted)}
.flt-empty{margin:24px 0 0;font-size:14px;color:var(--color-text-muted)}
@media (max-width:${tabletBp}){
  .flt-pos-left{grid-template-columns:1fr}
  .flt-toggle{display:inline-flex;align-items:center;gap:8px;align-self:flex-start;padding:9px 16px;font-size:14px;font-weight:600;color:var(--color-fg);background:var(--color-surface);border:1px solid var(--color-border);border-radius:999px;cursor:pointer;line-height:1}
  .flt-toggle-badge{display:inline-flex;align-items:center;justify-content:center;min-width:19px;height:19px;padding:0 5px;font-size:11px;font-weight:700;color:var(--color-primary-contrast,#fff);background:var(--color-primary);border-radius:999px}
  .flt-panel .flt-drawer{display:none;flex-direction:column;gap:4px;margin-top:14px}
  .flt-panel.is-open .flt-drawer{display:flex}
  .flt-pos-top .flt-panel{flex-direction:column;gap:4px;border-bottom:1px solid var(--color-border)}
}
@media (min-width:calc(${tabletBp} + 1px)){
  .flt-panel .flt-drawer{display:contents}
  .flt-pos-left .flt-panel{position:sticky;top:var(--flt-sticky-top,7rem);max-height:calc(100vh - var(--flt-sticky-top,7rem) - 1rem);overflow-y:auto;overscroll-behavior:contain;scrollbar-width:thin}
}
@media (max-width:${mobileBp}){
  .flt-wrap{gap:20px}
}
`
}
