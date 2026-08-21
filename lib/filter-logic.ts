// Pure selection maths, shared by the storefront shell and its tests.
// Within a group ticks are OR'd (Blue or Green); across groups they are AND'd
// (a blue product in oak).  A group with nothing ticked doesn't constrain.
//
// The AND is answered by ONE variation where it can be. A listing sold in red
// fabric and in black leather is not a red leather chair, and before this it
// counted as one: the two ticks were checked against the listing as a whole,
// so any pair of variations between them could satisfy them. Ticks that a
// variation can carry now have to be carried by the same variation.
//
// Filters no variation resolves - a price band, a sub-category, a spec stamped
// on the parent product - stay listing-wide, because that is what they are.

export type FltSelection = Map<string, Set<string>> // group id -> filter ids

// What one enabled variation resolves: the filter ids it carries, through its
// own option values and through its child product's specs. A product's combos
// are deduplicated, so two variations differing only in something nobody
// filters on count once.
export type FltCombos = ReadonlyArray<ReadonlyArray<string>>

// A product's row in the shell's matrix: everything the listing matches, and
// the per-variation detail when there is any.
export type FltMatrixEntry = [productId: string, filterIds: string[], combos?: FltCombos]

export function matchesSelection(productFilterIds: string[], selection: FltSelection, combos?: FltCombos): boolean {
  if (selection.size === 0) return true
  const matched = new Set(productFilterIds)
  // Which ticked filters each group is answered by. A group answered by
  // nothing at all fails outright, exactly as it always did.
  const answered: string[][] = []
  for (const filterIds of selection.values()) {
    if (filterIds.size === 0) continue
    const hits: string[] = []
    for (const id of filterIds) if (matched.has(id)) hits.push(id)
    if (hits.length === 0) return false
    answered.push(hits)
  }
  // One group cannot contradict itself, and with no variation detail there is
  // nothing finer to check against.
  if (answered.length < 2 || !combos || combos.length === 0) return true

  const perVariation = new Set<string>()
  for (const combo of combos) for (const id of combo) perVariation.add(id)
  // A group answered by something outside the variation space is settled for
  // the whole listing and puts no constraint on which variation is chosen.
  const mustAgree = answered.filter((hits) => hits.every((id) => perVariation.has(id)))
  if (mustAgree.length < 2) return true

  for (const combo of combos) {
    let ok = true
    for (const hits of mustAgree) {
      if (!hits.some((id) => combo.includes(id))) { ok = false; break }
    }
    if (ok) return true
  }
  return false
}

// The count shown against a filter: how many products would be visible if it
// were the only tick in its own group, with every other group's ticks kept.
// Standard facet counting - a tick never advertises a dead end caused by its
// own siblings, only by other groups' choices.
export function facetCount(
  filterId: string,
  groupId: string,
  matrixEntries: FltMatrixEntry[],
  selection: FltSelection,
): number {
  const trial: FltSelection = new Map(selection)
  trial.set(groupId, new Set([filterId]))
  let n = 0
  for (const [, filterIds, combos] of matrixEntries) {
    if (matchesSelection(filterIds, trial, combos)) n++
  }
  return n
}

// Which single filter should restyle a product's card - the first ticked filter
// the product matches, walking groups and their filters in the owner's order.
// Deterministic, so ticking Blue then Oak always shows the blue card, and
// unticking Blue hands it to Oak.
export function pickSwapFilter(
  productFilterIds: string[],
  selection: FltSelection,
  orderedGroups: { id: string; filterIds: string[] }[],
): string | null {
  return pickSwapFilters(productFilterIds, selection, orderedGroups)[0] ?? null
}

// Every ticked filter the product matches, in the same owner's order. The
// card's carousel is constrained to exactly these filters' variation photos, so
// two ticked colours mean two pictures the arrows flick between - and the first
// is the one the single-swap pick above would have chosen.
export function pickSwapFilters(
  productFilterIds: string[],
  selection: FltSelection,
  orderedGroups: { id: string; filterIds: string[] }[],
): string[] {
  if (selection.size === 0) return []
  const matched = new Set(productFilterIds)
  const out: string[] = []
  for (const group of orderedGroups) {
    const ticked = selection.get(group.id)
    if (!ticked || ticked.size === 0) continue
    for (const filterId of group.filterIds) {
      if (ticked.has(filterId) && matched.has(filterId)) out.push(filterId)
    }
  }
  return out
}
