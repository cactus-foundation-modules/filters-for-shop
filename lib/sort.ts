// The storefront sort order: the pure half, so the RSC grid and the client
// shell agree on the option list, the query-string values and the comparator
// without either owning it.
//
// Sorting happens over exactly the products the block rendered, same as
// filtering - the cards are server-stamped once and then shown, hidden and
// re-ordered in place. That keeps the card design the shop's own and the sort
// instant, at the cost of only ever ordering the (capped) result set. A shop
// with thousands of products wants a paginated, server-sorted grid instead.

export type FltSortValue = '' | 'best-selling' | 'price-asc' | 'price-desc' | 'name-asc' | 'name-desc' | 'newest' | 'oldest'

// Everything the comparator needs about one product, resolved server-side:
// `price` is the very figure the card prints (a companion module's from-price
// when there is one, else shop's own), so the order can never disagree with the
// numbers the shopper is reading. Null when there is no usable figure at all.
// `popularity` is shop's own blended best-seller figure - what this shop has
// sold, over whatever starting rank it was given. Higher is better. Null where
// nothing has ranked the product either way, which is not the same as ranking it
// badly, so those go last rather than at zero.
export type FltSortKey = { name: string; price: number | null; created: number; popularity: number | null }

export const FLT_SORT_OPTIONS: { value: FltSortValue; label: string }[] = [
  // The empty value is the shop's own order - the one the grid arrived in - so
  // an unsorted page carries no query string at all.
  { value: '', label: 'Recommended' },
  { value: 'best-selling', label: 'Best selling' },
  { value: 'price-asc', label: 'Price: low to high' },
  { value: 'price-desc', label: 'Price: high to low' },
  { value: 'name-asc', label: 'Name: A to Z' },
  { value: 'name-desc', label: 'Name: Z to A' },
  { value: 'newest', label: 'Newest first' },
  { value: 'oldest', label: 'Oldest first' },
]

export function isFltSortValue(value: string): value is FltSortValue {
  return FLT_SORT_OPTIONS.some((o) => o.value === value)
}

// The shop's own order has no query value of its own - an unsorted page carries
// no query string at all - which is fine until the grid STARTS on some other
// order. Then "Recommended" is a real choice away from the default and needs
// something to say so, or a refresh would land the shopper back on the starting
// order they had just left. This is that word, and it never reaches the
// comparator: it decodes to the empty value like any other spelling of it.
export const FLT_SORT_RECOMMENDED_PARAM = 'recommended'

/** The sort a query-string value asks for, or null where it asks for nothing at
 *  all - which is a missing parameter, an empty one, and any value naming an
 *  order this dropdown does not offer. All three mean "the shopper has not
 *  chosen", i.e. leave the grid on the order it started in.
 *
 *  The empty string is NOT the shop's own order here, however much it looks
 *  like it: an absent parameter reads as '' too, so honouring it would drag a
 *  grid that starts on Best selling back to Recommended the moment it mounted.
 *  Recommended asks for itself by name instead. */
export function sortValueFromParam(raw: string | null): FltSortValue | null {
  if (raw === FLT_SORT_RECOMMENDED_PARAM) return ''
  if (!raw) return null
  return isFltSortValue(raw) ? raw : null
}

// Names sort the way a shopper reads them: case-insensitive, and numbers inside
// them compared as numbers, so "1200mm Bench" follows "800mm Bench" rather than
// leading it.
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Re-order product ids for the chosen sort. `ids` is the server's own order,
 *  which is what the empty value returns and what ties fall back to (the sort
 *  is stable), so equal products never shuffle between renders. Products with
 *  no price go last in both directions - a POA product has no business leading
 *  the cheapest list or the dearest one. */
export function sortProductIds(ids: string[], keys: Record<string, FltSortKey>, sort: FltSortValue): string[] {
  if (!sort) return ids
  const priced = (id: string) => keys[id]?.price ?? null
  const byPrice = (a: string, b: string, dir: 1 | -1) => {
    const pa = priced(a)
    const pb = priced(b)
    if (pa === null && pb === null) return 0
    if (pa === null) return 1
    if (pb === null) return -1
    return (pa - pb) * dir
  }
  const byCreated = (a: string, b: string, dir: 1 | -1) =>
    ((keys[a]?.created ?? 0) - (keys[b]?.created ?? 0)) * dir
  const byName = (a: string, b: string, dir: 1 | -1) =>
    collator.compare(keys[a]?.name ?? '', keys[b]?.name ?? '') * dir
  // Unranked last in the same way an unpriced product is, and for the same
  // reason: no figure at all should never beat a real one, however small.
  const byPopularity = (a: string, b: string) => {
    const pa = keys[a]?.popularity ?? null
    const pb = keys[b]?.popularity ?? null
    if (pa === null && pb === null) return 0
    if (pa === null) return 1
    if (pb === null) return -1
    return pb - pa
  }

  const compare: Record<Exclude<FltSortValue, ''>, (a: string, b: string) => number> = {
    'best-selling': byPopularity,
    'price-asc': (a, b) => byPrice(a, b, 1),
    'price-desc': (a, b) => byPrice(a, b, -1),
    'name-asc': (a, b) => byName(a, b, 1),
    'name-desc': (a, b) => byName(a, b, -1),
    newest: (a, b) => byCreated(a, b, -1),
    oldest: (a, b) => byCreated(a, b, 1),
  }
  return [...ids].sort(compare[sort])
}
