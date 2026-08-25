import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { withCardAdminEditHrefs } from '@/modules/shop/lib/card-template'
import { injectShopProductCardEmbed } from '@/modules/shop/lib/inject-part-context'
import { formatMoney } from '@/modules/shop/lib/money'
import { productHref, type ProductUrlStyle } from '@/modules/shop/lib/product-url'
import type { PuckData } from '@/modules/shop/lib/types'
import type { CardItem } from '@/modules/shop/lib/card-template'

// The card anchor here deliberately mirrors shop's own renderCards rather than
// calling it: the only difference is the data-flt-product tag the shell hangs
// its filtering and re-dressing on, and shop's helper has nowhere to hang it.
// Template resolution, context building and the injected embed all still come
// from shop, so a change to the card design lands here too.

//
// Lifted out of the block so the block and the server function behind on-demand
// paging stamp cards through the SAME code. Page one and page nine differing by
// a stray class would be a bug nobody notices until a shopper scrolls.
// `eagerCount` matches shop's renderCards: how many cards at the front of this
// list are above the fold, and so load their picture eagerly rather than lazily.
// Page one of a grid passes its column count; the on-demand pages pass nothing,
// because a page the shopper scrolled to is by definition already scrolled past.
export async function renderTaggedCards(template: PuckData | null, items: CardItem[], urlStyle: ProductUrlStyle, eagerCount = 0) {
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  const config = getModuleLayoutPuckRscConfig('shopProductCard')
  // Every block registered for the card layout type, exactly as shop's own
  // renderCards passes - without it a companion module's card part renders its
  // editor skeleton on the live grid.
  const partTypes = config.categories.blocks.components
  // The signed-in admin's shortcut into each product's editor, resolved once for
  // the whole grid by shop (lib/admin-edit.ts) and read by shop's own Card: Name
  // part. A shopper gets the items back untouched. Requires shop 0.1.295 - see
  // requiresModules in the manifest, which is what stops this grid being updated
  // ahead of the shop that carries the helper.
  const withEdit = await withCardAdminEditHrefs(items)
  return withEdit.map(({ product, ctx }, at) => (
    // Same wrapper shape as shop's renderCards: a div with a stretched link
    // sibling, so the carousel arrows and any overlay controls are real buttons
    // above the link rather than interactive content nested in an <a>.
    <div key={product.id} className="shop-card" data-flt-product={product.id}>
      {/* ctx.productHref carries the shop's chosen product URL style, resolved
          by shop's buildCardContext - same source of truth as shop's own grids.
          The fallback keeps this grid linking correctly beside a shop build old
          enough not to resolve it, and is built through the same helper so it
          cannot hand back an address a ROOT-style shop no longer serves. */}
      <a className="shop-card-link" href={ctx.productHref ?? productHref(product.slug, urlStyle)} aria-label={product.name} />
      {template ? (
        <Render config={config as any} data={injectShopProductCardEmbed(template, at < eagerCount ? { ...ctx, eager: true } : ctx, partTypes) as Data} />
      ) : (
        <>
          <div className="shop-card-img">
            {ctx.image && (
              // Lazy, matching shop's own card part. A grid is the one place a
              // card is drawn hundreds of times over, so the untemplated
              // fallback cannot be the eager one.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ctx.image.url} alt={ctx.image.alt} loading="lazy" decoding="async" />
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
