import type { ReactNode } from 'react'
import { getProductsByIds } from '@/modules/shop/lib/db'
import { filterHiddenOutOfStock } from '@/modules/shop/lib/stock-visibility'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate } from '@/modules/shop/lib/card-template'
import { buildGridCardItems } from '@/modules/shop/lib/grid-page'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import { listGroups } from '@/modules/filters-for-shop/lib/db/filters'
import { getSettings } from '@/modules/filters-for-shop/lib/db/settings'
import { getProductFilterMatches } from '@/modules/filters-for-shop/lib/db/matching'
import { applyPriceBands, internVariations, offerGroups } from '@/modules/filters-for-shop/lib/grid-build'
import { packSwaps } from '@/modules/filters-for-shop/lib/swap-pack'
import { renderTaggedCards } from '@/modules/filters-for-shop/lib/tagged-cards'
import { FilterShell } from '@/modules/filters-for-shop/components/public/FilterShell'
import { shopFilterCss } from '@/modules/filters-for-shop/components/public/filter-css'
import type { FltSortKey } from '@/modules/filters-for-shop/lib/sort'

// The filter panel over a set of search results.
//
// Same shell, same culling and the same server-stamped Product Card design as
// every category page, but scoped to whatever the search index turned up rather
// than to a category, collection or tag. Which is the whole point: the filters
// offered are the ones the RESULTS can actually be cut by, because offerGroups
// drops every filter nothing in the set matches and every group left with fewer
// than two ways to cut.
//
// Two things a category grid does are deliberately left out:
//
//  * On-demand paging. The set here is not a query anything can re-run - it is
//    a list of ids off a relevance ranking - so there is no authorising query
//    for a server function to re-run, and naming ids without one would be a
//    hole. Every matching card is rendered up front instead, which is why the
//    set is capped.
//  * The sort dropdown. A search results page owns `?sort=` for its own
//    relevance/newest control, and two controls fighting over one parameter is
//    worse than one control.
const MAX_PRODUCTS = 120

export async function renderSearchFilterGrid(
  productIds: string[],
  opts?: { columns?: number; pageSize?: number },
): Promise<ReactNode | null> {
  const config = await getShopConfigCached()
  if (config.shopStatus === 'CLOSED') return null

  const productById = await getProductsByIds(productIds.slice(0, MAX_PRODUCTS))
  // Relevance order kept, and anything the storefront would not list dropped -
  // including whatever the shop hides for being out of stock. A search page
  // that turns up what the category page next door refuses to is no use.
  const products = await filterHiddenOutOfStock(
    productIds
      .map((id) => productById.get(id))
      .filter((p): p is NonNullable<typeof p> => Boolean(p && p.status === 'ACTIVE' && !p.catalogueHidden)),
  )
  // One product is not a set to filter, and no products is not a grid at all.
  // Either way the caller falls back to its plain cards.
  if (products.length < 2) return null

  const ids = products.map((p) => p.id)
  const [bp, template, groups, settings] = await Promise.all([
    getShopBreakpoints(),
    resolveCardTemplate(null),
    listGroups(),
    getSettings(),
  ])

  const [{ matrix, combos, swaps }, items] = await Promise.all([
    getProductFilterMatches(ids, groups),
    buildGridCardItems(products),
  ])

  // The figure the card prints, read back off the context that printed it, so a
  // price band can never disagree with the number on screen.
  const priceOf = new Map<string, number>()
  const sortKeys: Record<string, FltSortKey> = {}
  for (const item of items) {
    const price = Number(item.ctx.fromPrice ?? item.ctx.prices.now)
    priceOf.set(item.product.id, price)
    sortKeys[item.product.id] = {
      name: item.product.name,
      price: Number.isFinite(price) ? price : null,
      created: new Date(item.product.createdAt).getTime(),
      popularity: item.product.popularity,
    }
  }
  applyPriceBands(matrix, groups, priceOf)

  const offered = offerGroups(groups, matrix, settings.hideEmptyFilters, new Set<string>())
  // Nothing here can be cut by anything: hand the caller back its plain cards
  // rather than an empty panel taking up a third of the page.
  if (offered.length === 0) return null

  const columns = Math.max(2, Math.min(4, opts?.columns ?? 3))
  const pageSize = Math.max(1, Math.floor(Number(opts?.pageSize)) || 24)
  const cards = await renderTaggedCards(template, items, config.productUrlStyle, columns)

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) + shopFilterCss(bp) }} />
      <FilterShell
        groups={offered}
        matrix={Object.fromEntries(matrix)}
        variations={internVariations(combos)}
        swaps={packSwaps(swaps)}
        sortKeys={sortKeys}
        showSort={false}
        serverOrder={ids}
        columns={columns}
        position="left"
        showCounts
        swapImages={settings.swapCardImages}
        preselectOnClick={settings.preselectOnClick}
        tabletBp={bp.tabletBp}
        paginate="more"
        pageSize={pageSize}
        moreLabel="Show more products"
      >
        {cards}
      </FilterShell>
    </>
  )
}
