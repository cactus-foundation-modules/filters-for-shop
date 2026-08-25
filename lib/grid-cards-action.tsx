'use server'

import { getShopConfigCached } from '@/modules/shop/lib/config'
import { resolveCardTemplate } from '@/modules/shop/lib/card-template'
import { listGridProducts, buildGridCardItems } from '@/modules/shop/lib/grid-page'
import { pickWindow } from '@/modules/shop/lib/grid-window'
import type { ShopGridBinding } from '@/modules/shop/lib/grid-page-types'
import { renderTaggedCards } from '@/modules/filters-for-shop/lib/tagged-cards'

// The server function behind the filter grid's on-demand paging.
//
// It takes IDS rather than an offset, and that is the difference between this
// and shop's own grid: what is on screen here is whatever the shopper's ticks
// have left, in whatever order they sorted it, and only the browser knows that.
// The shell holds the whole matrix - which is small, interned, and was always
// going to be sent - so it can work out its own window and name it.
//
// Naming ids does NOT mean trusting them. listGridProducts re-runs the block's
// own authorising query and pickWindow keeps only the ids that came back, in the
// order asked for, so an invented id fetches nothing and says nothing about why.
// `binding` itself is bound at render time and encrypted by Next on the way out.
export async function loadFilterGridCards(
  binding: ShopGridBinding,
  ids: string[],
): Promise<React.ReactNode[]> {
  const products = await listGridProducts(binding.scope)
  const wanted = pickWindow(products, { ids }, binding.maxCards)
  if (wanted.length === 0) return []
  const [items, template, config] = await Promise.all([
    buildGridCardItems(wanted),
    resolveCardTemplate(binding.layoutRef),
    getShopConfigCached(),
  ])
  return renderTaggedCards(template, items, config.productUrlStyle)
}
