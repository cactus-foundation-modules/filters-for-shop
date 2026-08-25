import { connection } from 'next/server'
import { listProducts, getProductMediaForProducts, getProductTagIdsForProducts, HARD_MAX_PER_PAGE } from '@/modules/shop/lib/db'
import { listTags, resolveCategoryProductFilter, listCategories, getProductCategoryIdsForProducts } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext, buildTagMaps } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import type { CardItem } from '@/modules/shop/lib/card-template'
import { listGroups } from '@/modules/filters-for-shop/lib/db/filters'
import { getSettings } from '@/modules/filters-for-shop/lib/db/settings'
import { getProductFilterMatches } from '@/modules/filters-for-shop/lib/db/matching'
import { priceInBand } from '@/modules/filters-for-shop/lib/types'
import { CATEGORY_GROUP_ID, CATEGORY_GROUP_SLUG, CATEGORY_GROUP_NAME, buildBranchIndex, productBranchFilterIds, categoryFilterId } from '@/modules/filters-for-shop/lib/category-filter'
import { sortProductIds, sortValueFromParam, type FltSortKey } from '@/modules/filters-for-shop/lib/sort'
import { FilterShell, type FltPublicGroup } from '@/modules/filters-for-shop/components/public/FilterShell'
import { shopFilterCss } from '@/modules/filters-for-shop/components/public/filter-css'
import { renderTaggedCards } from '@/modules/filters-for-shop/lib/tagged-cards'
import { loadFilterGridCards } from '@/modules/filters-for-shop/lib/grid-cards-action'
import { matchesSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import { preselectByGroup } from '@/modules/filters-for-shop/lib/preselect'
import { shopFilterGridPuckComponent, type ShopFilterGridProps } from './ShopFilterGrid'

// Server (RSC) half of Shop: Filters & Product Grid.
//
// Every matching product is rendered up front with the shop's own Product Card
// layout, then the client shell shows, hides and re-dresses them as filters are
// ticked. Cards stay pixel-identical to every other shop grid and filtering is
// instant, at the cost of rendering the whole (capped) result set once.
//
// That cost is real and was measured rather than guessed: a 432-product filter
// collection shipped 14.6 MB, three quarters of it the flight payload for cards
// nobody scrolled to. So `pageLoad: 'ondemand'` renders the FIRST PAGE only and
// leaves the rest to lib/grid-cards-action - the shell already holds the whole
// matrix (interned, and small), so it can work out its own window and ask for
// it. The filters stay instant because filtering never depended on the cards
// being present, only on the matrix being.
//
// Note what does NOT change under on-demand: every product's context is still
// built here, because the PRICE bands and the sort keys read the same figure the
// card prints and must know it for products no page has shown yet. It is the
// RENDERING of a card - stamping a Puck document per product and serialising it
// for the browser - that is skipped, and that is where the megabytes were.
//
export async function ShopFilterGridRsc(props: ShopFilterGridProps) {
  await connection()
  const columns = props.columns ?? 3
  // Paging off is this block exactly as it was: fetch `limit`, render `limit`,
  // no pager, and no raised ceiling. Only a paged grid reaches past the default
  // 100, and only because the shell now has somewhere to put the extra cards.
  const paginate = props.paginate === 'more' || props.paginate === 'pages' || props.paginate === 'scroll' ? props.paginate : 'none'
  const limit = props.limit ?? 24
  const pageSize = paginate === 'none' ? limit : Math.max(1, Math.floor(Number(props.pageSize)) || limit)
  const fetchCount = paginate === 'none' ? limit : HARD_MAX_PER_PAGE
  // Where the pages after the first come from. Meaningless without paging.
  //
  // ABSENT means the owner never chose, and since 0.1.39 that means on-demand.
  // A grid with paging switched on has already said there are more products than
  // fit; building every one of them into the page anyway is what makes such a
  // page unloadable, and no owner should have to know that to avoid it. Only an
  // explicit 'upfront' - a choice somebody actually made - keeps the old way.
  //
  // Measured on the live site this was written for: 51 grids across every
  // category, collection and filter-collection layout, every one of them
  // `paginate: 'scroll'` with `pageLoad` unset. One page was 7.2 MB.
  const onDemand = paginate !== 'none' && props.pageLoad !== 'upfront'
  const config = await getShopConfigCached()
  const categoryFilter = props.categorySlug
    ? await resolveCategoryProductFilter(props.categorySlug, config.categoryProductDisplayMode)
    : {}

  const [bp, tags, listed, template, groups, settings] = await Promise.all([
    getShopBreakpoints(),
    listTags(),
    listProducts({
      status: 'ACTIVE',
      ...categoryFilter,
      collectionSlug: props.collectionSlug || undefined,
      tagSlug: props.tagSlug || undefined,
      // Filtering happens over exactly what is rendered, so whatever comes back
      // here is the honest ceiling of this block. Unpaged that is `limit` and
      // the default 100 clamp; paged, it is the whole category up to
      // HARD_MAX_PER_PAGE, with the shell showing a page of it at a time.
      perPage: fetchCount,
      maxPerPage: fetchCount,
      excludeHidden: true,
      // Whatever the shop hides for being out of stock is gone before the
      // filters ever see it, so a filter cannot offer a colour whose only
      // product the category page next door refuses to list.
      storefront: true,
    }),
    resolveCardTemplate(props.layoutRef),
    listGroups(),
    getSettings(),
  ])

  const { products } = listed
  if (products.length === 0) {
    return <p style={{ color: 'var(--color-text-muted)' }}>No products to show yet.</p>
  }

  const productIds = products.map((p) => p.id)

  // The synthetic Category group: this page's sub-categories offered as a
  // filter, built from the tree rather than any admin-defined rules. Only on
  // category pages, and only when the category actually has children.
  const wantCategoryFilter = Boolean(props.categorySlug) && props.categoryFilter !== 'no'
  // Card extras resolved exactly as shop's own grids do (ShopProductGrid.rsc):
  // without them the cards here carry no contributed variation photos, so the
  // carousel island never mounts with anything the filter's sourceId constraint
  // could match - the very photos the swap borrows.
  const [{ matrix, combos, swaps }, fromPrices, cardExtras, allCategories, categoryIdsByProduct, mediaByProduct, tagIdsByProduct] = await Promise.all([
    getProductFilterMatches(productIds, groups, config.productUrlStyle),
    resolveCardFromPrices(productIds),
    resolveShopCardExtras(productIds),
    wantCategoryFilter ? listCategories() : Promise.resolve([]),
    wantCategoryFilter ? getProductCategoryIdsForProducts(productIds) : Promise.resolve(new Map<string, string[]>()),
    getProductMediaForProducts(productIds),
    getProductTagIdsForProducts(productIds),
  ])

  const { tagById, tagsById } = buildTagMaps(tags)
  const items: CardItem[] = products.map((product) => ({
    product,
    ctx: buildCardContext(product, mediaByProduct.get(product.id) ?? [], tagById, tagIdsByProduct.get(product.id) ?? [], config.currencySymbol, config, fromPrices.get(product.id) ?? null, cardExtras.get(product.id), tagsById),
  }))

  // PRICE groups are matched right here, not in SQL: the band compares against
  // the same figure the card prints - the companion module's from-price when
  // one exists, else shop's own price - so a filter can never disagree with
  // the number the shopper is looking at. Works for variation-less products
  // too, which the option matcher by design cannot see.
  const priceFilters = groups
    .filter((g) => g.kind === 'PRICE')
    .flatMap((g) => g.filters.filter((f) => f.priceMin !== null || f.priceMax !== null))
  if (priceFilters.length > 0) {
    for (const { product, ctx } of items) {
      const price = Number(ctx.fromPrice ?? ctx.prices.now)
      if (!Number.isFinite(price)) continue
      for (const f of priceFilters) {
        if (!priceInBand(price, f.priceMin, f.priceMax)) continue
        const list = matrix.get(product.id) ?? []
        list.push(f.id)
        matrix.set(product.id, list)
      }
    }
  }

  // Each product earns a filter id per sub-category branch it is filed on, so
  // the Category group behaves exactly like an admin-defined one - facet
  // counts, OR-within-group, the query string - with no shell changes at all.
  let categoryGroup: FltPublicGroup | null = null
  if (wantCategoryFilter) {
    const current = allCategories.find((c) => c.slug === props.categorySlug)
    const children = current ? allCategories.filter((c) => c.parentId === current.id) : []
    if (current && children.length > 0) {
      const branchOf = buildBranchIndex(allCategories, current.id)
      const matchedChildIds = new Set<string>()
      productIds.forEach((productId) => {
        const filterIds = productBranchFilterIds(categoryIdsByProduct.get(productId) ?? [], branchOf)
        if (filterIds.length === 0) return
        const list = matrix.get(productId) ?? []
        list.push(...filterIds)
        matrix.set(productId, list)
        for (const id of filterIds) matchedChildIds.add(id)
      })
      // Children nothing in the grid belongs to are dropped, same policy as
      // admin filters below: never offer a tick that always returns nothing.
      // And one surviving child is no choice at all - the group only appears
      // when there are at least two ways to cut the page.
      const offeredChildren = children.filter((c) => matchedChildIds.has(categoryFilterId(c.id)))
      if (offeredChildren.length >= 2) {
        categoryGroup = {
          id: CATEGORY_GROUP_ID,
          name: CATEGORY_GROUP_NAME,
          // An admin group already using ?category= keeps it; the synthetic
          // group steps aside rather than fighting over the query string.
          slug: groups.some((g) => g.slug === CATEGORY_GROUP_SLUG) ? 'sub-category' : CATEGORY_GROUP_SLUG,
          controlType: 'CHECKBOX',
          filters: offeredChildren.map((c) => ({ id: categoryFilterId(c.id), label: c.name, slug: c.slug, swatch: null })),
        }
      }
    }
  }

  // Drop filters nothing on this page can match, so a category page never
  // offers a tick that always returns nothing - and drop groups left with
  // fewer than two filters: a heading with one tick under it is not a choice
  // (on a page of sit-stand desks, "Height adjustable: Yes" filters nothing).
  //
  // Both rules step aside for a filter this page arrives with ticked. They are
  // about not offering a pointless CHOICE, and a preselected filter is not a
  // choice, it is what the page IS - culled away, "Chairs Under £200" would
  // quietly drop its own price band and show the lot at any price. It stays
  // offered so the shopper can still clear it, and if it happens to match
  // nothing the grid comes back empty, which is the honest answer.
  const preselectedIds = new Set(props.preselectFilterIds ?? [])
  const matchedFilterIds = new Set([...matrix.values()].flat())
  const adminGroups: FltPublicGroup[] = groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      controlType: group.controlType,
      filters: group.filters
        .filter((f) => (group.kind === 'PRICE' ? f.priceMin !== null || f.priceMax !== null : f.rules.length > 0))
        .filter((f) => !settings.hideEmptyFilters || matchedFilterIds.has(f.id) || preselectedIds.has(f.id))
        .map((f) => ({ id: f.id, label: f.label, slug: f.slug, swatch: f.swatch })),
    }))
    .filter((group) => group.filters.length >= 2 || group.filters.some((f) => preselectedIds.has(f.id)))
  // Category leads the panel: it is the page's own structure, and the widest
  // cut a shopper can make before the finer admin-defined facets.
  const offered: FltPublicGroup[] = categoryGroup ? [categoryGroup, ...adminGroups] : adminGroups

  // Every preselected filter survives the culling above by construction, so all
  // this drops is an id naming no filter at all - a page still pointing at one
  // deleted since. Seeding the shell with it would tick a control that is not
  // there, which nothing could then clear.
  const offeredFilterIds = new Set(offered.flatMap((g) => g.filters.map((f) => f.id)))
  const preselect = [...preselectedIds].filter((id) => offeredFilterIds.has(id))

  // Intern the per-variation detail for the wire. Every distinct combination is
  // written once and named by index afterwards - see FltVariationIndex, and the
  // note there on why the spelled-out version is too big to send.
  //
  // Price and sub-category ids are deliberately not in here. They were added to
  // the matrix above and belong to the listing, not to any one variation, so a
  // cross-group check must not hold a variation to them.
  const variationFilterIds: string[] = []
  const indexOfFilter = new Map<string, number>()
  const indexOfCombo = new Map<string, number>()
  const comboTable: number[][] = []
  const combosByProduct: Record<string, number[]> = {}
  for (const [productId, list] of combos) {
    const seenHere = new Set<number>()
    for (const combo of list) {
      const encoded = combo
        .map((filterId) => {
          let at = indexOfFilter.get(filterId)
          if (at === undefined) {
            at = variationFilterIds.push(filterId) - 1
            indexOfFilter.set(filterId, at)
          }
          return at
        })
        .sort((a, b) => a - b)
      const key = encoded.join(',')
      let row = indexOfCombo.get(key)
      if (row === undefined) {
        row = comboTable.push(encoded) - 1
        indexOfCombo.set(key, row)
      }
      seenHere.add(row)
    }
    if (seenHere.size > 0) combosByProduct[productId] = [...seenHere]
  }

  const swapsRecord: Record<string, Record<string, { image: string | null; href: string; sourceId: string }>> = {}
  for (const [productId, perFilter] of swaps) swapsRecord[productId] = Object.fromEntries(perFilter)

  // What the sort dropdown orders on. The price is the same figure the PRICE
  // filters band on, and the same one the card prints - the companion module's
  // from-price when there is one, else shop's own - so a sorted grid can never
  // disagree with the numbers on screen.
  const sortKeys: Record<string, FltSortKey> = {}
  for (const { product, ctx } of items) {
    const price = Number(ctx.fromPrice ?? ctx.prices.now)
    sortKeys[product.id] = {
      name: product.name,
      price: Number.isFinite(price) ? price : null,
      created: new Date(product.createdAt).getTime(),
      popularity: product.popularity,
    }
  }

  // The order the grid opens in, applied HERE rather than left to the shell:
  // the cards are server-rendered, so a starting sort the client had to perform
  // would be a page that paints in one order and rearranges itself a moment
  // later. Blank on a layout saved before the field existed, which means best
  // selling - see the note on the field.
  //
  // An order this build does not offer is ignored rather than guessed at, the
  // same way the dropdown ignores an unknown query string.
  // Blank (or absent) is a layout saved before the field existed, not a request
  // for the shop's own order - Recommended says its own name, `recommended`.
  const defaultSort = sortValueFromParam(props.defaultSort || 'best-selling') ?? ''
  const serverOrder = items.map(({ product }) => product.id)
  const ordered = defaultSort ? sortProductIds(serverOrder, sortKeys, defaultSort) : serverOrder

  // Which products get a card rendered into the page. Upfront, all of them, as
  // this block has always done. On-demand, the FIRST PAGE - and the first page
  // of a filter collection is the first page of what it arrives ticked with,
  // not the first page of the raw list. "White Office Furniture" rendering
  // twenty-four cards of which three are white would look like a broken page,
  // and it is precisely the page this mode exists for.
  //
  // Worked out with the shell's own predicate over the shell's own starting
  // selection, so the server's first page and the shell's first window are the
  // same twenty-four products rather than two answers that nearly agree.
  const startSelection = preselectByGroup(offered, preselect)
  const renderIds = onDemand
    ? ordered.filter((id) => matchesSelection(matrix.get(id) ?? [], startSelection, combos.get(id))).slice(0, pageSize)
    : ordered
  // Re-ordering the products, not finished cards: the per-product media, price
  // and contributed-photo work inside the context build is most of the cost of a
  // card, and slicing after the fact would have paid all of it.
  const itemById = new Map(items.map((item) => [item.product.id, item]))
  const sortedCards = await renderTaggedCards(
    template,
    renderIds.map((id) => itemById.get(id)).filter((item): item is CardItem => item != null),
    config.productUrlStyle,
  )

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) + shopFilterCss(bp) }} />
      <FilterShell
        groups={offered}
        matrix={Object.fromEntries(matrix)}
        variations={{ filterIds: variationFilterIds, combos: comboTable, byProduct: combosByProduct }}
        swaps={swapsRecord}
        sortKeys={sortKeys}
        showSort={props.showSort !== 'no'}
        defaultSort={defaultSort}
        serverOrder={serverOrder}
        columns={columns}
        position={props.filterPosition === 'top' ? 'top' : 'left'}
        showCounts={props.showCounts !== 'no'}
        preselect={preselect}
        swapImages={settings.swapCardImages}
        preselectOnClick={settings.preselectOnClick}
        tabletBp={bp.tabletBp}
        paginate={paginate}
        pageSize={pageSize}
        moreLabel={props.moreLabel}
        renderedIds={onDemand ? renderIds : undefined}
        // Bound here, so what the browser may ask for is a list of ids off a
        // list the server drew up - which products this grid is over, which card
        // design, and how many at a time are decided in this render and
        // encrypted by Next on the way out. Re-validated server-side regardless.
        loadCards={onDemand
          ? loadFilterGridCards.bind(null, {
              scope: {
                categorySlug: props.categorySlug || undefined,
                collectionSlug: props.collectionSlug || undefined,
                tagSlug: props.tagSlug || undefined,
                fetchCount,
              },
              layoutRef: props.layoutRef,
              maxCards: pageSize,
            })
          : undefined}
      >
        {sortedCards}
      </FilterShell>
    </>
  )
}

export const shopFilterGridPuckRscComponent = {
  ...shopFilterGridPuckComponent,
  render: ShopFilterGridRsc,
}
