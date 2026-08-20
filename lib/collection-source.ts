import { getCategoryBySlug, getCollectionBySlug as getShopCollectionBySlug, getTagBySlug } from '@/modules/shop/lib/db/catalogue'
import type { FltCollectionSource } from '@/modules/filters-for-shop/lib/types'

// Where a filter collection's products come from, expressed as the one
// breadcrumb between "Shop" and the page's own name, and as the answer to
// "does that thing still exist?".
//
// Only the slug is stored (see the note on source_slug in migration 003), so
// renaming a category leaves a page pointing at nothing rather than the database
// refusing a rename it should have had no say in. Both callers below treat a
// missing source as "no crumb" rather than an error; the admin screen is where
// it is reported.

export type FltSourceCrumb = { name: string; href: string }

export async function resolveSourceCrumb(sourceType: FltCollectionSource, sourceSlug: string | null): Promise<FltSourceCrumb | null> {
  if (!sourceSlug) return null
  if (sourceType === 'CATEGORY') {
    const category = await getCategoryBySlug(sourceSlug)
    return category ? { name: category.name, href: `/shop/categories/${category.slug}` } : null
  }
  if (sourceType === 'COLLECTION') {
    const collection = await getShopCollectionBySlug(sourceSlug)
    return collection ? { name: collection.name, href: `/shop/collections/${collection.slug}` } : null
  }
  if (sourceType === 'TAG') {
    const tag = await getTagBySlug(sourceSlug)
    return tag ? { name: tag.name, href: `/shop/tag/${tag.slug}` } : null
  }
  return null
}

/** Does the category/collection/tag a page is built on still exist? ALL always does. */
export async function sourceExists(sourceType: FltCollectionSource, sourceSlug: string | null): Promise<boolean> {
  if (sourceType === 'ALL') return true
  if (!sourceSlug) return false
  return (await resolveSourceCrumb(sourceType, sourceSlug)) !== null
}
