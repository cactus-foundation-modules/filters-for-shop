import { priceInBand, type FltGroup } from '@/modules/filters-for-shop/lib/types'
import type { FltPublicGroup, FltVariationIndex } from '@/modules/filters-for-shop/components/public/FilterShell'

// The three passes every filter grid does between "which products" and "what the
// shell gets handed", pulled out of ShopFilterGrid.rsc so a second grid over a
// different set of products (search results) answers them identically rather
// than nearly identically. Pure - no database, no React - so they are the same
// three answers wherever the products came from.

/** Band the listing prices into the PRICE groups' filters, in place.
 *
 *  Matched here rather than in SQL: the band compares against the same figure
 *  the card prints - the variations module's from-price when one exists, else
 *  shop's own - so a filter can never disagree with the number on screen. Works
 *  for variation-less products too, which the option matcher cannot see. */
export function applyPriceBands(
  matrix: Map<string, string[]>,
  groups: FltGroup[],
  priceOf: Map<string, number>,
): void {
  const priceFilters = groups
    .filter((g) => g.kind === 'PRICE')
    .flatMap((g) => g.filters.filter((f) => f.priceMin !== null || f.priceMax !== null))
  if (priceFilters.length === 0) return
  for (const [productId, price] of priceOf) {
    if (!Number.isFinite(price)) continue
    for (const f of priceFilters) {
      if (!priceInBand(price, f.priceMin, f.priceMax)) continue
      const list = matrix.get(productId) ?? []
      list.push(f.id)
      matrix.set(productId, list)
    }
  }
}

/** Intern the per-variation detail for the wire: every filter id written once,
 *  every distinct combination once, and a product naming its combinations by
 *  index. Spelled out instead, a whole-catalogue page carries about a megabyte
 *  of repeated UUIDs - see FltVariationIndex. */
export function internVariations(combos: Map<string, string[][]>): FltVariationIndex {
  const filterIds: string[] = []
  const indexOfFilter = new Map<string, number>()
  const indexOfCombo = new Map<string, number>()
  const comboTable: number[][] = []
  const byProduct: Record<string, number[]> = {}
  for (const [productId, list] of combos) {
    const seenHere = new Set<number>()
    for (const combo of list) {
      const encoded = combo
        .map((filterId) => {
          let at = indexOfFilter.get(filterId)
          if (at === undefined) {
            at = filterIds.push(filterId) - 1
            indexOfFilter.set(filterId, at)
          }
          return at
        })
        .sort((a, b) => a - b)
      const key = encoded.join(',')
      let row = indexOfCombo.get(key)
      if (row === undefined) {
        row = comboTable.push(encoded) - 1
        indexOfCombo.set(key, row)
      }
      seenHere.add(row)
    }
    if (seenHere.size > 0) byProduct[productId] = [...seenHere]
  }
  return { filterIds, combos: comboTable, byProduct }
}

/** The groups this page actually offers.
 *
 *  Drop filters nothing here can match, so a page never offers a tick that
 *  always returns nothing - and drop groups left with fewer than two filters: a
 *  heading with one tick under it is not a choice (on a page of sit-stand desks,
 *  "Height adjustable: Yes" filters nothing).
 *
 *  Both rules step aside for a filter the page arrives with ticked. They are
 *  about not offering a pointless CHOICE, and a preselected filter is not a
 *  choice, it is what the page IS - culled away, "Chairs Under £200" would
 *  quietly drop its own price band and show the lot at any price. */
export function offerGroups(
  groups: FltGroup[],
  matrix: Map<string, string[]>,
  hideEmptyFilters: boolean,
  preselectedIds: Set<string>,
): FltPublicGroup[] {
  const matchedFilterIds = new Set([...matrix.values()].flat())
  return groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      controlType: group.controlType,
      filters: group.filters
        .filter((f) => (group.kind === 'PRICE' ? f.priceMin !== null || f.priceMax !== null : f.rules.length > 0))
        .filter((f) => !hideEmptyFilters || matchedFilterIds.has(f.id) || preselectedIds.has(f.id))
        // Collapsed to one url here rather than shipping all three: a picture
        // swatch is drawn as a 14px dot or a 56px tile in this panel, so the
        // tiny copy is the right file and the full-size photograph exists for
        // the 3D module, not for this.
        .map((f) => ({ id: f.id, label: f.label, slug: f.slug, swatch: f.swatchTiny ?? f.swatchSmall ?? f.swatch })),
    }))
    .filter((group) => group.filters.length >= 2 || group.filters.some((f) => preselectedIds.has(f.id)))
}
