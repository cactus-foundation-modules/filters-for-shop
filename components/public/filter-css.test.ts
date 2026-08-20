import { describe, it, expect } from 'vitest'
import { shopFilterCss } from '@/modules/filters-for-shop/components/public/filter-css'

// The filter sheet shares a phone's bottom edge with whatever else the site
// floats down there. A live-chat launcher parks itself at z-index 2147482000,
// which is fine for a launcher and ruinous for anything that lands underneath
// it: it covered most of the sheet's own "Show N products" button, and all but
// a sliver of the closed pill. Stacking-order bugs are invisible to types and
// to every other test, so they are pinned here.

const BP = { tabletBp: '1024px', mobileBp: '640px' }

// Neighbours whose z-index this has to sit between. Both are real values from
// other modules that may be installed alongside this one.
const CHAT_LAUNCHER = 2147482000
const QUOTE_LIGHTBOX = 2147483000

const css = shopFilterCss(BP)
const zIndexOf = (className: string): number => {
  const match = new RegExp(`\\.${className}\\{[^}]*z-index:(\\d+)`).exec(css)
  if (!match) throw new Error(`no z-index found for .${className}`)
  return Number(match[1])
}

describe('filter sheet stacking order', () => {
  it('puts the open sheet and its scrim above a chat launcher', () => {
    expect(zIndexOf('flt-scrim')).toBeGreaterThan(CHAT_LAUNCHER)
    expect(zIndexOf('flt-drawer')).toBeGreaterThan(zIndexOf('flt-scrim'))
  })

  it('still lets a quote lightbox open on top of the sheet', () => {
    expect(zIndexOf('flt-drawer')).toBeLessThan(QUOTE_LIGHTBOX)
  })

  it('leaves the closed pill down in ordinary page furniture', () => {
    // It is a launcher, not a modal. Outranking the chat bubble with it would
    // just move the same collision onto someone else.
    expect(zIndexOf('flt-fab')).toBeLessThan(CHAT_LAUNCHER)
  })
})

describe('the closed filter pill on a phone', () => {
  const mobileBlock = css.slice(css.indexOf(`@media (max-width:${BP.mobileBp})`))
  const tabletBlock = css.slice(
    css.indexOf(`@media (max-width:${BP.tabletBp})`),
    css.indexOf(`@media (max-width:${BP.mobileBp})`),
  )

  it('moves off centre, where a corner launcher cannot sit on it', () => {
    expect(mobileBlock).toMatch(/\.flt-fab\{left:16px;transform:none\}/)
  })

  it('keeps the centred pill on a tablet, where there is room for both', () => {
    expect(tabletBlock).toContain('left:50%')
    expect(tabletBlock).toContain('translateX(-50%)')
  })
})
