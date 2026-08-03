// Pure selection maths, shared by the storefront shell and its tests.
// Within a group ticks are OR'd (Blue or Green); across groups they are AND'd
// (a blue product in oak). A group with nothing ticked doesn't constrain.

export type FltSelection = Map<string, Set<string>> // group id -> filter ids

export function matchesSelection(productFilterIds: string[], selection: FltSelection): boolean {
  if (selection.size === 0) return true
  const matched = new Set(productFilterIds)
  for (const filterIds of selection.values()) {
    if (filterIds.size === 0) continue
    let hit = false
    for (const id of filterIds) {
      if (matched.has(id)) { hit = true; break }
    }
    if (!hit) return false
  }
  return true
}

// The count shown against a filter: how many products would be visible if it
// were the only tick in its own group, with every other group's ticks kept.
// Standard facet counting - a tick never advertises a dead end caused by its
// own siblings, only by other groups' choices.
export function facetCount(
  filterId: string,
  groupId: string,
  matrixEntries: [string, string[]][],
  selection: FltSelection,
): number {
  const trial: FltSelection = new Map(selection)
  trial.set(groupId, new Set([filterId]))
  let n = 0
  for (const [, filterIds] of matrixEntries) {
    if (matchesSelection(filterIds, trial)) n++
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
  if (selection.size === 0) return null
  const matched = new Set(productFilterIds)
  for (const group of orderedGroups) {
    const ticked = selection.get(group.id)
    if (!ticked || ticked.size === 0) continue
    for (const filterId of group.filterIds) {
      if (ticked.has(filterId) && matched.has(filterId)) return filterId
    }
  }
  return null
}
