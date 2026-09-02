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
import { CATEGORY_GROUP_ID, CATEGORY_GROUP_SLUG, CATEGORY_GROUP_NAME, buildBranchIndex, productBranchFilterIds, categoryFilterId } from '@/modules/filters-for-shop/lib/category-filter'
import { applyPriceBands, internVariations, offerGroups } from '@/modules/filters-for-shop/lib/grid-build'
import { sortProductIds, sortValueFromParam, type FltSortKey } from '@/modules/filters-for-shop/lib/sort'
import { FilterShell, type FltPublicGroup } from '@/modules/filters-for-shop/components/public/FilterShell'
import { shopFilterCss } from '@/modules/filters-for-shop/components/public/filter-css'
import { renderTaggedCards } from '@/modules/filters-for-shop/lib/tagged-cards'
import { loadFilterGridCards } from '@/modules/filters-for-shop/lib/grid-cards-action'
import { matchesSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import { preselectByGroup } from '@/modules/filters-for-shop/lib/preselect'
import { packSwaps } from '@/modules/filters-for-shop/lib/swap-pack'
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
      supplierSlug: props.supplierSlug || undefined,
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
  const [{ matrix, combos, swaps }, fromPrices, allCategories, categoryIdsByProduct] = await Promise.all([
    getProductFilterMatches(productIds, groups, config.productUrlStyle),
    resolveCardFromPrices(productIds),
    wantCategoryFilter ? listCategories() : Promise.resolve([]),
    wantCategoryFilter ? getProductCategoryIdsForProducts(productIds) : Promise.resolve(new Map<string, string[]>()),
  ])

  const { tagById, tagsById } = buildTagMaps(tags)

  // The figure the card would print, for every product on the shelf.
  //
  // Read out of a context built with no pictures, no tags and no contributed
  // extras, because the price never depends on any of them: priceView() reads
  // the product's own columns and the shop's tax display, and the "from" price
  // is handed in. What that buys is the right to fetch the pictures, tags and
  // contributed extras for the RENDERED cards only, further down - which on a
  // paged category page is two dozen products rather than several hundred.
  //
  // Measured on the live catalogue this matters for: a category of 217 listings
  // was pulling 7,900 variations, 23,000 variant values and 10,000 variation
  // photographs through this block on every uncached render, to draw 24 cards.
  const priceOf = new Map<string, number>()
  for (const product of products) {
    const ctx = buildCardContext(product, [], tagById, [], config.currencySymbol, config, fromPrices.get(product.id) ?? null, undefined, tagsById)
    priceOf.set(product.id, Number(ctx.fromPrice ?? ctx.prices.now))
  }

  // PRICE groups, matched against the same figure the card prints - see
  // lib/grid-build.ts.
  applyPriceBands(matrix, groups, priceOf)

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

  // The groups this page offers, culled by lib/grid-build.ts.
  const preselectedIds = new Set(props.preselectFilterIds ?? [])
  const adminGroups = offerGroups(groups, matrix, settings.hideEmptyFilters, preselectedIds)
  // Category leads the panel: it is the page's own structure, and the widest
  // cut a shopper can make before the finer admin-defined facets.
  const offered: FltPublicGroup[] = categoryGroup ? [categoryGroup, ...adminGroups] : adminGroups

  // Every preselected filter survives the culling above by construction, so all
  // this drops is an id naming no filter at all - a page still pointing at one
  // deleted since. Seeding the shell with it would tick a control that is not
  // there, which nothing could then clear.
  const offeredFilterIds = new Set(offered.flatMap((g) => g.filters.map((f) => f.id)))
  const preselect = [...preselectedIds].filter((id) => offeredFilterIds.has(id))

  // Interned for the wire - see lib/grid-build.ts. Price and sub-category ids
  // are deliberately absent from `combos` by construction: they were added to
  // the matrix above and belong to the listing, not to any one variation, so a
  // cross-group check must not hold a variation to them.
  const variationIndex = internVariations(combos)

  // Folded for the wire, exactly as the variation index above is, and for the
  // same reason - see lib/swap-pack.ts for what was in the 326 KB it replaces.
  const swapIndex = packSwaps(swaps)

  // What the sort dropdown orders on. The price is the same figure the PRICE
  // filters band on, and the same one the card prints - the companion module's
  // from-price when there is one, else shop's own - so a sorted grid can never
  // disagree with the numbers on screen.
  const sortKeys: Record<string, FltSortKey> = {}
  for (const product of products) {
    const price = priceOf.get(product.id) ?? Number.NaN
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
  const serverOrder = productIds
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
  // Which window of the shelf this render is. Page one unless the address said
  // otherwise; ignored when every card is going in anyway, because then every
  // product is already linked from page one.
  const page = onDemand ? Math.max(1, Math.floor(Number(props.page)) || 1) : 1
  const from = (page - 1) * pageSize
  const matchingOrdered = onDemand
    ? ordered.filter((id) => matchesSelection(matrix.get(id) ?? [], startSelection, combos.get(id)))
    : ordered
  const renderIds = onDemand ? matchingOrdered.slice(from, from + pageSize) : ordered
  // The pictures, tags and contributed extras - and ONLY for the cards this
  // render is going to draw. Everything above got by on the product rows and
  // the "from" prices, so a paged grid no longer reads the whole category's
  // variation graph to show its first two dozen tiles. Upfront rendering asks
  // for every product because it draws every product, which is the old
  // behaviour exactly.
  //
  // Slicing the PRODUCTS rather than finished cards, and fetching after the
  // slice rather than before: the per-product media and contributed-photo work
  // is most of the cost of a card, and doing it up front paid all of it for
  // cards nobody was going to see.
  const cardIds = onDemand ? renderIds : productIds
  const [cardExtras, mediaByProduct, tagIdsByProduct] = await Promise.all([
    resolveShopCardExtras(cardIds),
    getProductMediaForProducts(cardIds),
    getProductTagIdsForProducts(cardIds),
  ])
  const productById = new Map(products.map((product) => [product.id, product]))
  const renderItems: CardItem[] = renderIds
    .map((id) => productById.get(id))
    .filter((product): product is (typeof products)[number] => product != null)
    .map((product) => ({
      product,
      ctx: buildCardContext(product, mediaByProduct.get(product.id) ?? [], tagById, tagIdsByProduct.get(product.id) ?? [], config.currencySymbol, config, fromPrices.get(product.id) ?? null, cardExtras.get(product.id), tagsById),
    }))
  const sortedCards = await renderTaggedCards(
    template,
    renderItems,
    config.productUrlStyle,
    // The opening row loads its pictures eagerly; the rest of the shelf stays
    // lazy. Only on page one - a later page is one the shopper scrolled to.
    page === 1 ? columns : 0,
  )

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) + shopFilterCss(bp) }} />
      <FilterShell
        groups={offered}
        matrix={Object.fromEntries(matrix)}
        variations={variationIndex}
        swaps={swapIndex}
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
        page={page}
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
                supplierSlug: props.supplierSlug || undefined,
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
