// How the per-filter variation swaps travel to the browser.
//
// `swaps` answers "if the shopper ticks Red, which variation should this card
// borrow its photo and its link from" for every product on the shelf and every
// filter it can match. The shell needs the whole thing up front, because that is
// what makes filtering instant - no round trip, no re-render, just re-dressing
// cards that are already on screen. So it goes into the HTML, and on a real
// shelf it is not small.
//
// Measured on deskwell.co.uk's office-chairs category, August 2026: 900 swaps
// over 129 products, written out as 326 KB of flight payload. Almost none of it
// was information. Thirty distinct filter ids were spelled out 900 times as
// object keys. Every image url repeated its folder, which is the same folder for
// every swap on a product. Every href repeated the product's own slug before the
// bit that differed:
//
//   /brixworth-uk-crafted-2-and-3-seater-office-sofa-2-seater-rivet-burnish-white
//   /brixworth-uk-crafted-2-and-3-seater-office-sofa-2-seater-rivet-burnish-black
//
// So the wire shape names the repeated parts once. Filter ids and image folders
// intern across the whole grid; the href prefix is per product, because that is
// the scope it actually repeats over. 326 KB becomes 110 KB, for the same swaps
// in the same order, and the shell unfolds it once on mount.
//
// This is the same trick, and the same reasoning, as FltVariationIndex over in
// FilterShell and lib/card-media-pack.ts over in shop.

import type { FltSwap } from '@/modules/filters-for-shop/lib/db/matching'

// One swap: which filter it answers, where its photo lives, and the tail of its
// href after the product's shared prefix.
//
// A folder index of -1 is a swap with no photo at all (a variation whose child
// product carries no media). It is a real case, not a missing value: the card
// keeps its own picture and only the link swaps.
export type FltPackedSwap = [filter: number, folder: number, file: string, hrefTail: string, sourceId: string]

export type FltSwapIndex = {
  // Interned filter ids.
  g: string[]
  // Interned image url folders, each INCLUDING its trailing slash, so that a url
  // with no slash in it rejoins to exactly itself.
  f: string[]
  // product id -> [the href prefix its swaps share, its swaps]
  p: Record<string, [hrefPrefix: string, swaps: FltPackedSwap[]]>
}

export const EMPTY_SWAP_INDEX: FltSwapIndex = { g: [], f: [], p: {} }

// The longest start every one of these shares. One href is entirely its own
// prefix, which is lossless and costs a byte or two.
function commonPrefix(values: string[]): string {
  if (values.length === 0) return ''
  let prefix = values[0] ?? ''
  for (const value of values.slice(1)) {
    let at = 0
    while (at < prefix.length && at < value.length && prefix[at] === value[at]) at++
    prefix = prefix.slice(0, at)
    if (prefix === '') break
  }
  return prefix
}

export function packSwaps(swaps: Map<string, Map<string, FltSwap>>): FltSwapIndex {
  const g: string[] = []
  const f: string[] = []
  const filterAt = new Map<string, number>()
  const folderAt = new Map<string, number>()
  const intern = (value: string, table: string[], index: Map<string, number>) => {
    let at = index.get(value)
    if (at === undefined) {
      at = table.push(value) - 1
      index.set(value, at)
    }
    return at
  }

  const p: FltSwapIndex['p'] = {}
  for (const [productId, perFilter] of swaps) {
    const entries = [...perFilter]
    const prefix = commonPrefix(entries.map(([, swap]) => swap.href))
    p[productId] = [
      prefix,
      entries.map(([filterId, swap]): FltPackedSwap => {
        const filter = intern(filterId, g, filterAt)
        if (swap.image === null) return [filter, -1, '', swap.href.slice(prefix.length), swap.sourceId]
        // +1 keeps the slash on the folder - see the note on `f` above.
        const cut = swap.image.lastIndexOf('/') + 1
        const folder = intern(swap.image.slice(0, cut), f, folderAt)
        return [filter, folder, swap.image.slice(cut), swap.href.slice(prefix.length), swap.sourceId]
      }),
    ]
  }
  return { g, f, p }
}

export function unpackSwaps(index: FltSwapIndex): Map<string, Map<string, FltSwap>> {
  const out = new Map<string, Map<string, FltSwap>>()
  for (const [productId, [prefix, rows]] of Object.entries(index.p)) {
    const perFilter = new Map<string, FltSwap>()
    for (const [filter, folder, file, hrefTail, sourceId] of rows) {
      const filterId = index.g[filter]
      if (filterId === undefined) continue
      perFilter.set(filterId, {
        image: folder < 0 ? null : (index.f[folder] ?? '') + file,
        href: prefix + hrefTail,
        sourceId,
      })
    }
    out.set(productId, perFilter)
  }
  return out
}
