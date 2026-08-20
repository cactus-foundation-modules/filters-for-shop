import type { FltSelection } from '@/modules/filters-for-shop/lib/filter-logic'

// How a filter collection page's starting selection meets the query string.
//
// A filter page ("Green Office Chairs") arrives with filters already ticked, and
// the shopper can untick them. That leaves three states per group to tell apart,
// and only two of them can be spelled with a plain parameter:
//
//   * still on what the page started it on  -> no parameter at all
//   * changed to something else             -> the group's own parameter
//   * cleared entirely                      -> an EMPTY parameter
//
// The empty parameter is what makes clearing survive a refresh. Without it a
// cleared group is indistinguishable from a group nobody has touched, so the
// page's own starting tick goes straight back on the next load.
//
// On an ordinary category, collection or tag page the preselection is empty and
// every rule here collapses to what the panel always did: write what is ticked,
// read back what is written.
//
// Pure, and out of FilterShell.tsx, because getting it wrong is invisible until
// someone shares a link - see filter-shell-url.test.ts.

// The minimum a group has to look like for any of this: an id, the query-string
// key it owns, and the filters in it. FltPublicGroup satisfies it.
export type PreselectGroup = { id: string; slug: string; filters: { id: string; slug: string }[] }

/** The page's starting selection, split by group. Empty when there is none. */
export function preselectByGroup(groups: PreselectGroup[], preselect: string[]): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>()
  if (preselect.length === 0) return out
  const wanted = new Set(preselect)
  for (const group of groups) {
    const ids = group.filters.filter((f) => wanted.has(f.id)).map((f) => f.id)
    if (ids.length > 0) out.set(group.id, new Set(ids))
  }
  return out
}

/** Do two tick sets hold the same filters? Absent counts as empty. */
export function sameSelection(a: Set<string> | undefined, b: Set<string> | undefined): boolean {
  const left = a ?? new Set<string>()
  const right = b ?? new Set<string>()
  if (left.size !== right.size) return false
  for (const id of left) if (!right.has(id)) return false
  return true
}

/**
 * What is ticked on arrival: whatever the query string says, and where it says
 * nothing about a group, whatever the page preselects for it.
 *
 * PRESENCE of the parameter decides, not its content - `?colour=` means Colour
 * was deliberately emptied, which is a different answer from Colour being absent.
 */
export function selectionFromParams(
  groups: PreselectGroup[],
  params: URLSearchParams,
  preselected: Map<string, Set<string>>,
): FltSelection {
  const selected: FltSelection = new Map()
  for (const group of groups) {
    const raw = params.get(group.slug)
    if (raw === null) {
      const pre = preselected.get(group.id)
      if (pre && pre.size > 0) selected.set(group.id, new Set(pre))
      continue
    }
    const slugs = new Set(raw.split(',').filter(Boolean))
    const ids = group.filters.filter((f) => slugs.has(f.slug)).map((f) => f.id)
    if (ids.length > 0) selected.set(group.id, new Set(ids))
  }
  return selected
}

/**
 * Write the selection back over `params`, in place. Every group's key is cleared
 * first, so a group that has nothing to say leaves no trace behind.
 */
export function applySelectionToParams(
  groups: PreselectGroup[],
  selected: FltSelection,
  preselected: Map<string, Set<string>>,
  params: URLSearchParams,
): void {
  for (const group of groups) params.delete(group.slug)
  for (const group of groups) {
    const filterIds = selected.get(group.id) ?? new Set<string>()
    const pre = preselected.get(group.id)
    // Still on what the page started it on: left out entirely, so a filter page
    // keeps its own clean address until the shopper changes something.
    if (sameSelection(filterIds, pre)) continue
    const slugs = group.filters.filter((f) => filterIds.has(f.id)).map((f) => f.slug)
    if (slugs.length > 0) params.set(group.slug, slugs.join(','))
    else if (pre && pre.size > 0) params.set(group.slug, '')
  }
}
