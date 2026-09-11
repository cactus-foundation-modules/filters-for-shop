import { connection } from 'next/server'
import { getCollectionBySlug } from '@/modules/filters-for-shop/lib/db/collections'
import { FaqAccordion } from '@/modules/shop/components/public/FaqAccordion'
import { getShopBreakpoints } from '@/modules/shop/lib/breakpoints'
import { getShopConfigCached } from '@/modules/shop/lib/config'
import { normaliseFaqItems, resolveCategoryFaqs, type ShpFaqItem } from '@/modules/shop/lib/faq'
import { filterCollectionFaqsPuckComponent, type FilterCollectionFaqsProps } from './FilterCollectionFaqs'

// Server (RSC) half of Filter Page: FAQs. Kept out of the client editor bundle -
// see FilterCollectionFaqs.tsx.
//
// The questions are this module's own (flt_collections.faqs); everything about
// how they are DRAWN comes from shop - the accordion markup, the FAQPage
// structured data, the merge rules and the shop-wide switch. That import is what
// stops a site publishing two different FAQ shapes off one domain, and it is why
// the manifest's requiresModules pins a shop version that actually has them.
//
// Nothing renders when there is nothing to render: no questions written, or FAQs
// switched off shop-wide. A block left in the shared layout therefore costs a
// page nobody has written up exactly nothing - no gap, no heading, and no
// structured data claiming it answers questions it does not.

// Matches shop's own category-page block (ShopCategoryFaqs.rsc.tsx) rule for
// rule, class for class. A grid rather than CSS columns: a multi-column list
// moves its items between columns as one is opened, so the question just clicked
// jumps elsewhere on the page. The breakpoint is the shop's own tablet one.
const faqsCss = ({ tabletBp }: { tabletBp: string }) => `
.shop-faqs-title{font-family:var(--display-family,Georgia,serif);font-weight:600;font-size:24px;margin:0 0 14px;color:var(--color-fg)}
.shop-faqs{display:grid;grid-template-columns:1fr;column-gap:40px}
.shop-faqs-2{grid-template-columns:1fr 1fr}
@media (max-width:${tabletBp}){.shop-faqs-2{grid-template-columns:1fr}}
.shop-faq{border-bottom:1px solid var(--color-border);padding:12px 0}
.shop-faq > summary{cursor:pointer;font-weight:600;color:var(--color-fg)}
.shop-faq p{margin:8px 0 0;color:var(--color-text);white-space:pre-wrap}
`

export async function FilterCollectionFaqsRsc(props: FilterCollectionFaqsProps) {
  await connection()
  if (!props.filterPageSlug) return null

  const [collection, config, bp] = await Promise.all([
    getCollectionBySlug(props.filterPageSlug),
    getShopConfigCached(),
    getShopBreakpoints(),
  ])
  if (!collection) return null
  // One switch for the feature, wherever it appears. An owner who has turned
  // FAQs off shop-wide should not find them still being answered here.
  if (!config.productFaqsEnabled) return null

  // One rung and no chain - a filter page has no parent - so `scope` chooses
  // between its own questions alone and its own followed by the shop-wide ones,
  // and a page that says it does not inherit keeps the shop's off it either way.
  const shopWide = normaliseFaqItems(config.productFaqs)
  const items: ShpFaqItem[] =
    props.scope === 'inherited' ? resolveCategoryFaqs([collection.faqs], shopWide) : collection.faqs.items

  if (items.length === 0) return null
  const title = props.title?.trim()
  const wrapper = props.columns === '1' ? 'shop-faqs' : 'shop-faqs shop-faqs-2'

  return (
    <section className="shop-faqs-block">
      <style dangerouslySetInnerHTML={{ __html: faqsCss(bp) }} />
      {title ? <h2 className="shop-faqs-title">{title}</h2> : null}
      <FaqAccordion items={items} wrapperClassName={wrapper} itemClassName="shop-faq" />
    </section>
  )
}

export const filterCollectionFaqsPuckRscComponent = {
  ...filterCollectionFaqsPuckComponent,
  render: FilterCollectionFaqsRsc,
}
