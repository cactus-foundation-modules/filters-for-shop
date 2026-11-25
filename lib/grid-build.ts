import { FLT_DELIVERY_LEAD_TIME, FLT_DELIVERY_SERVICE, leadTimeDays, priceInBand, type FltGroup, type FltRule } from '@/modules/filters-for-shop/lib/types'
import type { FltDeliveryCatalogue, FltDeliveryFacts } from '@/modules/filters-for-shop/lib/delivery'
import type { FltCombo } from '@/modules/filters-for-shop/lib/db/matching'
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

/** Does any group carry a DELIVERY rule? The grids only pay for delivery facts
 *  when one does. */
export function wantsDeliveryFacts(groups: FltGroup[]): boolean {
  return groups.some((g) => g.kind === 'VALUES' && g.filters.some((f) => f.rules.some((r) => r.source === 'DELIVERY')))
}

/** Does one DELIVERY rule hold for a listing's delivery facts?
 *
 *  A service rule names a service label, matched exactly (case aside, so a
 *  service renamed "Flat-pack" from "Flat-Pack" does not silently empty the
 *  filter). A lead-time rule names a working-day count and holds when the
 *  listing can arrive WITHIN it - ticking "6 working days" must not hide the
 *  desk that can come in three. */
export function deliveryRuleMatches(rule: Pick<FltRule, 'optionName' | 'valueLabel'>, facts: FltDeliveryFacts): boolean {
  if (rule.optionName === FLT_DELIVERY_SERVICE) {
    const wanted = rule.valueLabel.trim().toLowerCase()
    for (const label of facts.services) if (label.toLowerCase() === wanted) return true
    return false
  }
  if (rule.optionName === FLT_DELIVERY_LEAD_TIME) {
    const days = leadTimeDays(rule.valueLabel)
    const quickest = facts.leadDays[0]
    return days !== null && quickest !== undefined && quickest <= days
  }
  return false
}

/** Add the DELIVERY-rule filters each listing matches, in place: to the matrix
 *  from the listing's rolled-up facts, and to each variation's combination from
 *  that variation's own child product.
 *
 *  The second half is what makes "Yellow" plus "Within 3 working days" honest. A
 *  chair sold in black from stock and in yellow made to order offers three days
 *  as a LISTING, but no yellow one arrives in three; with the delivery filters in
 *  the combinations the cross-group check (lib/filter-logic.ts) needs one
 *  variation to be both. A listing with no variations keeps the listing answer.
 *
 *  Combinations are replaced, never edited: their arrays are shared with the
 *  match cache (lib/db/matching.ts copyMatches). */
export function applyDeliveryRules(
  matrix: Map<string, string[]>,
  groups: FltGroup[],
  productIds: string[],
  catalogue: FltDeliveryCatalogue,
  combos?: Map<string, FltCombo[]>,
): void {
  const facts = catalogue.listings
  const deliveryFilters = groups
    .filter((g) => g.kind === 'VALUES')
    .flatMap((g) => g.filters)
    .map((f) => ({ id: f.id, rules: f.rules.filter((r) => r.source === 'DELIVERY') }))
    .filter((f) => f.rules.length > 0)
  if (deliveryFilters.length === 0 || facts.size === 0) return
  for (const productId of productIds) {
    const own = facts.get(productId)
    if (!own) continue
    for (const f of deliveryFilters) {
      if (!f.rules.some((rule) => deliveryRuleMatches(rule, own))) continue
      const list = matrix.get(productId) ?? []
      if (!list.includes(f.id)) list.push(f.id)
      matrix.set(productId, list)
    }
    const variations = combos?.get(productId)
    if (!variations) continue
    combos?.set(productId, variations.map((combo) => {
      const childFacts = combo.childId ? catalogue.products.get(combo.childId) : undefined
      if (!childFacts) return combo
      const extra = deliveryFilters.filter((f) => f.rules.some((rule) => deliveryRuleMatches(rule, childFacts))).map((f) => f.id)
      return extra.length > 0 ? { ...combo, filterIds: [...combo.filterIds, ...extra] } : combo
    }))
  }
}

/** Intern the per-variation detail for the wire: every filter id written once,
 *  every distinct combination once, and a product naming its combinations by
 *  index. Spelled out instead, a whole-catalogue page carries about a megabyte
 *  of repeated UUIDs - see FltVariationIndex. */
export function internVariations(combos: Map<string, FltCombo[]>): FltVariationIndex {
  const filterIds: string[] = []
  const indexOfFilter = new Map<string, number>()
  const indexOfCombo = new Map<string, number>()
  const comboTable: number[][] = []
  const byProduct: Record<string, number[]> = {}
  for (const [productId, list] of combos) {
    const seenHere = new Set<number>()
    for (const { filterIds: combo } of list) {
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
      // A combination this product already has is the same combination.
      seenHere.add(row)
    }
    if (seenHere.size === 0) continue
    byProduct[productId] = [...seenHere]
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
    // A slider is only a price control, and only drawn for a PRICE group: a
    // VALUES group saved as RANGE by hand falls back to ticks.
    .map((group) => ({ group, slider: group.controlType === 'RANGE' && group.kind === 'PRICE' }))
    .map(({ group, slider }) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      controlType: slider ? 'RANGE' as const : group.controlType === 'RANGE' ? 'CHECKBOX' as const : group.controlType,
      filters: group.filters
        .filter((f) => (group.kind === 'PRICE' ? f.priceMin !== null || f.priceMax !== null : f.rules.length > 0))
        // A slider keeps every band whether or not anything here falls in it:
        // the bands are never drawn, only used to open the slider on a filter
        // page's starting band, and the slider bounds itself from the prices.
        .filter((f) => slider || !hideEmptyFilters || matchedFilterIds.has(f.id) || preselectedIds.has(f.id))
        // Collapsed to one url here rather than shipping all three: a picture
        // swatch is drawn as a 14px dot or a 56px tile in this panel, so the
        // tiny copy is the right file and the full-size photograph exists for
        // the 3D module, not for this.
        .map((f) => {
          // A filter standing only for lead times shows as a date in the
          // panel ("By Tuesday the 1st of December"); this is the count it
          // stands for - the longest, where several were ticked.
          const leads = f.rules.map((r) => (r.source === 'DELIVERY' && r.optionName === FLT_DELIVERY_LEAD_TIME ? leadTimeDays(r.valueLabel) : null))
          const leadDays = leads.length > 0 && leads.every((d) => d !== null) ? Math.max(...(leads as number[])) : undefined
          return {
          id: f.id,
          label: f.label,
          slug: f.slug,
          swatch: f.swatchTiny ?? f.swatchSmall ?? f.swatch,
          ...(slider ? { band: [f.priceMin, f.priceMax] as [number | null, number | null] } : {}),
          ...(leadDays !== undefined ? { leadDays } : {}),
          }
        }),
    }))
    // A slider is a choice in itself, bands or none; the shell hides it when
    // the shelf's prices give it nowhere to slide.
    .filter((group) => group.controlType === 'RANGE' || group.filters.length >= 2 || group.filters.some((f) => preselectedIds.has(f.id)))
}
