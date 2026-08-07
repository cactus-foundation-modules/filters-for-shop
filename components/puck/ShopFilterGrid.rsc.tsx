import { connection } from 'next/server'
import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { listProducts, getProductMedia, getProductTagIds } from '@/modules/shop/lib/db'
import { listTags, resolveCategoryProductFilter, listCategories, getProductCategoryIds } from '@/modules/shop/lib/db'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { resolveCardTemplate, buildCardContext } from '@/modules/shop/lib/card-template'
import { resolveCardFromPrices } from '@/modules/shop/lib/card-price'
import { resolveShopCardExtras } from '@/modules/shop/lib/card-media'
import { injectShopProductCardEmbed } from '@/modules/shop/lib/inject-part-context'
import { formatMoney } from '@/modules/shop/lib/money'
import { shopCardCss } from '@/modules/shop/components/puck/parts/card-parts'
import type { PuckData } from '@/modules/shop/lib/types'
import type { CardItem } from '@/modules/shop/lib/card-template'
import { listGroups } from '@/modules/filters-for-shop/lib/db/filters'
import { getSettings } from '@/modules/filters-for-shop/lib/db/settings'
import { getProductFilterMatches } from '@/modules/filters-for-shop/lib/db/matching'
import { priceInBand } from '@/modules/filters-for-shop/lib/types'
import { CATEGORY_GROUP_ID, CATEGORY_GROUP_SLUG, CATEGORY_GROUP_NAME, buildBranchIndex, productBranchFilterIds, categoryFilterId } from '@/modules/filters-for-shop/lib/category-filter'
import type { FltSortKey } from '@/modules/filters-for-shop/lib/sort'
import { FilterShell, type FltPublicGroup } from '@/modules/filters-for-shop/components/public/FilterShell'
import { shopFilterCss } from '@/modules/filters-for-shop/components/public/filter-css'
import { shopFilterGridPuckComponent, type ShopFilterGridProps } from './ShopFilterGrid'

// Server (RSC) half of Shop: Filters & Product Grid.
//
// Every matching product is rendered up front with the shop's own Product Card
// layout, then the client shell shows, hides and re-dresses them as filters are
// ticked. Cards stay pixel-identical to every other shop grid and filtering is
// instant, at the cost of rendering the whole (capped) result set once. Suits
// the catalogue sizes this platform is aimed at; a shop with thousands of
// products wants a paginated, server-filtered grid instead.
//
// The card anchor below deliberately mirrors shop's own renderCards rather than
// calling it: the only difference is the data-flt-product tag the shell hangs
// its filtering and re-dressing on, and shop's helper has nowhere to hang it.
// Template resolution, context building and the injected embed all still come
// from shop, so a change to the card design lands here too.

async function renderTaggedCards(template: PuckData | null, items: CardItem[]) {
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  const config = getModuleLayoutPuckRscConfig('shopProductCard')
  // Every block registered for the card layout type, exactly as shop's own
  // renderCards passes - without it a companion module's card part renders its
  // editor skeleton on the live grid.
  const partTypes = config.categories.blocks.components
  return items.map(({ product, ctx }) => (
    // Same wrapper shape as shop's renderCards: a div with a stretched link
    // sibling, so the carousel arrows and any overlay controls are real buttons
    // above the link rather than interactive content nested in an <a>.
    <div key={product.id} className="shop-card" data-flt-product={product.id}>
      <a className="shop-card-link" href={`/shop/products/${product.slug}`} aria-label={product.name} />
      {template ? (
        <Render config={config as any} data={injectShopProductCardEmbed(template, ctx, partTypes) as Data} />
      ) : (
        <>
          <div className="shop-card-img">
            {ctx.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.image.url} alt={ctx.image.alt} />
            )}
          </div>
          <h3 className="shop-card-name">{product.name}</h3>
          <div className="shop-card-pricerow">
            {ctx.fromPrice != null ? (
              <span className="shop-card-price">{ctx.fromPriceVaries ? 'From ' : ''}{formatMoney(ctx.fromPrice, ctx.currencySymbol)}</span>
            ) : (
              <>
                <span className="shop-card-price">{formatMoney(ctx.prices.now, ctx.currencySymbol)}</span>
                {ctx.prices.was && <span className="shop-card-compare">{formatMoney(ctx.prices.was, ctx.currencySymbol)}</span>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  ))
}

export async function ShopFilterGridRsc(props: ShopFilterGridProps) {
  await connection()
  const columns = props.columns ?? 3
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
      // listProducts clamps perPage to 100. Filtering happens over exactly what
      // is rendered, so the cap is the honest ceiling of this block.
      perPage: props.limit ?? 24,
      excludeHidden: true,
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
  const [{ matrix, swaps }, fromPrices, cardExtras, allCategories, productCategoryIds] = await Promise.all([
    getProductFilterMatches(productIds, groups),
    resolveCardFromPrices(productIds),
    resolveShopCardExtras(productIds),
    wantCategoryFilter ? listCategories() : Promise.resolve([]),
    wantCategoryFilter ? Promise.all(productIds.map((id) => getProductCategoryIds(id))) : Promise.resolve([]),
  ])

  const tagById = new Map(tags.map((t) => [t.id, t.slug]))
  const items: CardItem[] = await Promise.all(
    products.map(async (product) => {
      const [media, tagIds] = await Promise.all([getProductMedia(product.id), getProductTagIds(product.id)])
      return { product, ctx: buildCardContext(product, media, tagById, tagIds, config.currencySymbol, config, fromPrices.get(product.id) ?? null, cardExtras.get(product.id)) }
    }),
  )

  const cards = await renderTaggedCards(template, items)

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
      productIds.forEach((productId, i) => {
        const filterIds = productBranchFilterIds(productCategoryIds[i] ?? [], branchOf)
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
  const matchedFilterIds = new Set([...matrix.values()].flat())
  const adminGroups: FltPublicGroup[] = groups
    .map((group) => ({
      id: group.id,
      name: group.name,
      slug: group.slug,
      controlType: group.controlType,
      filters: group.filters
        .filter((f) => (group.kind === 'PRICE' ? f.priceMin !== null || f.priceMax !== null : f.rules.length > 0))
        .filter((f) => !settings.hideEmptyFilters || matchedFilterIds.has(f.id))
        .map((f) => ({ id: f.id, label: f.label, slug: f.slug, swatch: f.swatch })),
    }))
    .filter((group) => group.filters.length >= 2)
  // Category leads the panel: it is the page's own structure, and the widest
  // cut a shopper can make before the finer admin-defined facets.
  const offered: FltPublicGroup[] = categoryGroup ? [categoryGroup, ...adminGroups] : adminGroups

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
    }
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: shopCardCss(bp) + shopFilterCss(bp) }} />
      <FilterShell
        groups={offered}
        matrix={Object.fromEntries(matrix)}
        swaps={swapsRecord}
        sortKeys={sortKeys}
        showSort={props.showSort !== 'no'}
        columns={columns}
        position={props.filterPosition === 'top' ? 'top' : 'left'}
        showCounts={props.showCounts !== 'no'}
        swapImages={settings.swapCardImages}
        preselectOnClick={settings.preselectOnClick}
        tabletBp={bp.tabletBp}
      >
        {cards}
      </FilterShell>
    </>
  )
}

export const shopFilterGridPuckRscComponent = {
  ...shopFilterGridPuckComponent,
  render: ShopFilterGridRsc,
}
