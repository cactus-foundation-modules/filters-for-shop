// The synthetic Category group: on a category page the filter panel offers the
// page's own sub-categories as a filter, so a shopper can narrow the rolled-up
// grid to one branch without leaving the page. No admin setup involved - the
// group is built per page from the shop's category tree, its "filters" are the
// direct children of the category being viewed, and a product matches a child
// when it is filed anywhere on that child's branch.
//
// Everything here is pure tree arithmetic so it can be unit-tested without a
// database; the RSC half feeds it shop's listCategories() rows.

export const CATEGORY_GROUP_ID = 'flt-category-group'
export const CATEGORY_GROUP_SLUG = 'category'
export const CATEGORY_GROUP_NAME = 'Category'

export type FltCategoryNode = { id: string; name: string; slug: string; parentId: string | null }

export function categoryFilterId(childId: string): string {
  return `cat:${childId}`
}

// descendant category id -> the direct child (of parentId) whose branch it is
// on. The children themselves are included, mapped to themselves. Cycle-safe:
// a node already claimed by a branch is never re-walked.
export function buildBranchIndex(all: FltCategoryNode[], parentId: string): Map<string, string> {
  const childrenByParent = new Map<string, FltCategoryNode[]>()
  for (const node of all) {
    if (node.parentId === null) continue
    const list = childrenByParent.get(node.parentId) ?? []
    list.push(node)
    childrenByParent.set(node.parentId, list)
  }
  const branchOf = new Map<string, string>()
  for (const child of childrenByParent.get(parentId) ?? []) {
    const queue = [child.id]
    while (queue.length > 0) {
      const id = queue.pop()!
      if (branchOf.has(id)) continue
      branchOf.set(id, child.id)
      for (const grandchild of childrenByParent.get(id) ?? []) queue.push(grandchild.id)
    }
  }
  return branchOf
}

// The child filter ids a product earns from the categories it is filed under.
// Deduped: two categories on the same branch still yield one filter id.
export function productBranchFilterIds(productCategoryIds: string[], branchOf: Map<string, string>): string[] {
  const childIds = new Set<string>()
  for (const categoryId of productCategoryIds) {
    const childId = branchOf.get(categoryId)
    if (childId) childIds.add(childId)
  }
  return [...childIds].map(categoryFilterId)
}
