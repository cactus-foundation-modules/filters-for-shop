import { listProducts, resolveCategoryProductFilter, HARD_MAX_PER_PAGE } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import type { ShpProduct } from '@/modules/shop/lib/types'
import type { ShopGridScope } from '@/modules/shop/lib/grid-page-types'
import { FLT_SHELF_CEILING, mergeShelfPages, planShelfPages } from '@/modules/filters-for-shop/lib/shelf-plan'

// The products a filter grid is over: THE authorising query, shared by the
// block's render and the server function that fetches its later pages, so the
// two can never disagree about which products a grid holds.
//
// Why this is not simply shop's listGridProducts: shop's product list hands over
// at most HARD_MAX_PER_PAGE (500) rows a call, and that ceiling is right for
// shop - it guards the public list, and it stops a grid that renders every card
// from rendering twenty thousand. A filter grid fetching on demand renders one
// page of cards whatever its shelf holds, so for it 500 was nothing but a silent
// cut: on a scope bigger than that, the 501st product was not in the matrix, so
// no tick found it, no count included it and no page ever drew it. Deskwell's
// whole-shop /shop grid was 66 listings short of it on 2026-09-26.
//
// So the shelf is read 500 at a time, through the same list with the same
// conditions, until it is all here or FLT_SHELF_CEILING says stop.
//
// Server-only: it reaches the database.

// How many further pages go to the database at once. Enough that a big shelf
// is not read one round trip at a time, few enough that one grid does not take
// every connection in the pool while it does it.
const PAGE_CONCURRENCY = 4

// What a filter grid is pointed at. Shop's scope, less the two fields a filter
// grid never sets - the order is the shell's to choose, and a browse-and-filter
// grid is not a showcase - so a caller cannot hand one in and have it ignored.
export type FltShelfScope = Pick<ShopGridScope, 'categorySlug' | 'collectionSlug' | 'tagSlug' | 'supplierSlug' | 'fetchCount'>

/** The scope's storefront products, in the scope's order, up to
 *  `scope.fetchCount` (itself held to FLT_SHELF_CEILING), with `total` saying
 *  how many the scope really holds - more than came back means the ceiling cut
 *  it. */
export async function listFilterShelf(scope: FltShelfScope): Promise<{ products: ShpProduct[]; total: number }> {
  const config = await getShopConfigCached()
  const categoryFilter = scope.categorySlug
    ? await resolveCategoryProductFilter(scope.categorySlug, config.categoryProductDisplayMode)
    : {}
  const want = Math.min(FLT_SHELF_CEILING, Math.max(1, Math.floor(Number(scope.fetchCount)) || 24))
  const perPage = Math.min(want, HARD_MAX_PER_PAGE)
  const readPage = (page: number) =>
    listProducts({
      status: 'ACTIVE',
      ...categoryFilter,
      collectionSlug: scope.collectionSlug || undefined,
      tagSlug: scope.tagSlug || undefined,
      supplierSlug: scope.supplierSlug || undefined,
      page,
      perPage,
      maxPerPage: perPage,
      excludeHidden: true,
      // Whatever the shop hides for being out of stock is gone before the
      // filters ever see it, so a filter cannot offer a colour whose only
      // product the category page next door refuses to list.
      storefront: true,
    })

  const first = await readPage(1)
  const { reach, pages } = planShelfPages(want, first.total, perPage)
  const read: ShpProduct[][] = [first.products]
  for (let at = 0; at < pages.length; at += PAGE_CONCURRENCY) {
    const batch = await Promise.all(pages.slice(at, at + PAGE_CONCURRENCY).map(readPage))
    for (const result of batch) read.push(result.products)
  }
  return { products: mergeShelfPages(read, reach), total: first.total }
}
