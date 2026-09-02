import type { ReactNode } from 'react'

// Provider for the search module's `search.product-filters` extension point.
//
// Deliberately a stub: the work is a whole file of grid building that ends in
// FilterShell, a client component. This file is reached from core's PUBLIC
// extension-point map, which every public page imports, so a static import of
// the shell here would put the filter panel's javascript into the bundle of
// every page on the site. The dynamic import keeps it in a chunk of its own,
// fetched only when a search results page actually asks for a grid.
export const filtersSearchGridProvider = {
  async renderFilteredProductCards(
    productIds: string[],
    opts?: { columns?: number; pageSize?: number },
  ): Promise<ReactNode | null> {
    if (productIds.length === 0) return null
    const { renderSearchFilterGrid } = await import('@/modules/filters-for-shop/lib/search-filter-grid.impl')
    return renderSearchFilterGrid(productIds, opts)
  },
}
