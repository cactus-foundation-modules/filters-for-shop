// How the per-filter variation swaps travel to the browser.
//
// `swaps` answers "if the shopper ticks Red, which variation should this card
// borrow its photo from, and which option should the click name" for every
// product on the shelf and every filter it can match. The shell needs the whole
// thing up front, because that is what makes filtering instant - no round trip,
// no re-render, just re-dressing cards that are already on screen. So it goes
// into the HTML, and on a real shelf it is not small.
//
// Measured on deskwell.co.uk's office-chairs category, August 2026: 900 swaps
// over 129 products, written out as 326 KB of flight payload. Almost none of it
// was information. Thirty distinct filter ids were spelled out 900 times as
// object keys. Every image url repeated its folder, which is the same folder for
// every swap on a product. And every swap named an option parameter -
// `upholstery-colour=rivet-forge` - that a shelf of chairs repeats over and over.
//
// So the wire shape names the repeated parts once: filter ids, image folders and
// option parameters all intern across the whole grid. The payload dropped to a
// third of what it was, for the same swaps in the same order, and the shell
// unfolds it once on mount.
//
// This is the same trick, and the same reasoning, as FltVariationIndex over in
// FilterShell and lib/card-media-pack.ts over in shop.

import type { FltSwap } from '@/modules/filters-for-shop/lib/db/matching'

// One swap: which filter it answers, where its photo lives, and which option
// parameter it picks.
//
// A folder index of -1 is a swap with no photo at all (a variation whose child
// product carries no media). It is a real case, not a missing value: the card
// keeps its own picture and only the link changes. A param index of -1 is the
// same kind of real case the other way about: a filter that matched no single
// option value, whose tick therefore names nothing on the product page.
export type FltPackedSwap = [filter: number, folder: number, file: string, param: number, sourceId: string]

export type FltSwapIndex = {
  // Interned filter ids.
  g: string[]
  // Interned image url folders, each INCLUDING its trailing slash, so that a url
  // with no slash in it rejoins to exactly itself.
  f: string[]
  // Interned option parameters, each a whole `key=value` fragment.
  q: string[]
  // product id -> its swaps
  p: Record<string, FltPackedSwap[]>
}

export const EMPTY_SWAP_INDEX: FltSwapIndex = { g: [], f: [], q: [], p: {} }

export function packSwaps(swaps: Map<string, Map<string, FltSwap>>): FltSwapIndex {
  const g: string[] = []
  const f: string[] = []
  const q: string[] = []
  const filterAt = new Map<string, number>()
  const folderAt = new Map<string, number>()
  const paramAt = new Map<string, number>()
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
    p[productId] = [...perFilter].map(([filterId, swap]): FltPackedSwap => {
      const filter = intern(filterId, g, filterAt)
      const param = swap.param === null ? -1 : intern(swap.param, q, paramAt)
      if (swap.image === null) return [filter, -1, '', param, swap.sourceId]
      // +1 keeps the slash on the folder - see the note on `f` above.
      const cut = swap.image.lastIndexOf('/') + 1
      const folder = intern(swap.image.slice(0, cut), f, folderAt)
      return [filter, folder, swap.image.slice(cut), param, swap.sourceId]
    })
  }
  return { g, f, q, p }
}

export function unpackSwaps(index: FltSwapIndex): Map<string, Map<string, FltSwap>> {
  const out = new Map<string, Map<string, FltSwap>>()
  for (const [productId, rows] of Object.entries(index.p)) {
    const perFilter = new Map<string, FltSwap>()
    for (const [filter, folder, file, param, sourceId] of rows) {
      const filterId = index.g[filter]
      if (filterId === undefined) continue
      perFilter.set(filterId, {
        image: folder < 0 ? null : (index.f[folder] ?? '') + file,
        param: param < 0 ? null : index.q[param] ?? null,
        sourceId,
      })
    }
    out.set(productId, perFilter)
  }
  return out
}
