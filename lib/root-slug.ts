import { collectionSlugExists } from '@/modules/filters-for-shop/lib/db/collections'

// Answers core's "does any module own this bare slug?" question, registered
// through publicRootSlug in cactus.module.json.
//
// Core asks only after it has failed to find an info page or a module index at
// the slug, so core content always wins a collision. It asks the MODULES in
// registry order, which is alphabetical - and "filters-for-shop" sorts ahead of
// "gazette" and "shop", so this claim is asked first of the three. A yes here
// therefore outranks a product or a post at the same address, which is why a
// collection's slug is checked against both when it is saved (see
// ensureUniqueCollectionSlug) rather than left to lose gracefully at read time.
//
// Deliberately matches a DRAFT row as well as a PUBLISHED one: the page itself
// decides what an unpublished collection does, and claiming only published ones
// would 404 staff out of their own preview.
export async function filtersClaimsRootSlug(slug: string): Promise<boolean> {
  return collectionSlugExists(slug)
}
