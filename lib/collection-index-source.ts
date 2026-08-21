import type { ShopCollectionIndexItem, ShopCollectionIndexSource } from '@/modules/shop/lib/collection-index-sources-shared'
import { listPublishedCollectionsForIndex } from '@/modules/filters-for-shop/lib/db/collections'

// Filter collections, offered to shop's Collection Browser block through the
// generic `shop.collection-index-sources` point. Shop lends the tile and the
// grid; everything about what these pages are stays here.
//
// Only published rows: a draft is staff-only on its own address, and an index
// that listed one would hand the public a link to a 404. Noindex rows are still
// listed - noindex is about a crawler's opinion of the page, not about whether
// the shop is allowed to link to it.

export const filtersCollectionIndexSource: ShopCollectionIndexSource = {
  async list(): Promise<ShopCollectionIndexItem[]> {
    const rows = await listPublishedCollectionsForIndex()
    return rows.map((row) => ({
      id: `filters-for-shop:${row.id}`,
      name: row.name,
      // The bare top-level address the page owns - see the note on `slug` in
      // migration 003. Not a /shop/ path, which is why the item carries an href
      // rather than leaving shop to build one from a slug.
      href: `/${row.slug}`,
      description: row.shortDescription,
      coverUrl: row.ogImage,
    }))
  },
}
