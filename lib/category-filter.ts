// The synthetic Category group: the filter panel offers the page's own
// sub-categories as a filter, so a shopper can narrow the rolled-up grid to one
// branch without leaving the page. No admin setup involved - the group is built
// per page from the shop's category tree, its "filters" are the direct children
// of the category being viewed, and a product matches a child when it is filed
// anywhere on that child's branch.
//
// A page with no category of its own - a tag page, a collection, a filter page
// over the whole catalogue - takes the shop's TOP-LEVEL categories as its
// children instead. Same arithmetic, one rung higher: "Office Desks, Office
// Tables, Office Seating" is the widest cut a shopper can make on a shelf that
// spans the lot, and without it such a page opens on everything with no way to
// say which half of the shop they came for.
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

// The key the top of the tree is filed under. A category id can never collide
// with it: ids are cuid/uuid text, and this is not text any of them can be.
const ROOT_KEY = '\u0000root'

// descendant category id -> the direct child (of parentId) whose branch it is
// on. The children themselves are included, mapped to themselves. Cycle-safe:
// a node already claimed by a branch is never re-walked.
//
// `parentId` null asks for the top of the tree, whose "children" are the
// categories with no parent of their own.
export function buildBranchIndex(all: FltCategoryNode[], parentId: string | null): Map<string, string> {
  const childrenByParent = new Map<string, FltCategoryNode[]>()
  for (const node of all) {
    const key = node.parentId ?? ROOT_KEY
    const list = childrenByParent.get(key) ?? []
    list.push(node)
    childrenByParent.set(key, list)
  }
  const branchOf = new Map<string, string>()
  for (const child of childrenByParent.get(parentId ?? ROOT_KEY) ?? []) {
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
