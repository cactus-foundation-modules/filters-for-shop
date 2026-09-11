// [ANCHOR] - filterPageSlug is injected by the filter collection page
// (lib/inject-filter-collection-context.ts).
//
// EDITOR half only. The server render lives in FilterCollectionFaqs.rsc.tsx,
// wired by `rscImport` in the manifest.
//
// The questions themselves are this page's own (flt_collections.faqs, migration
// 005), but the markup and the FAQPage structured data come from shop, so a site
// carrying FAQs on a product page, a category page and one of these publishes
// one shape rather than three.
export type FilterCollectionFaqsProps = {
  filterPageSlug?: string
  title?: string
  columns?: string
  scope?: string
}

export function FilterCollectionFaqs() {
  return (
    <div style={{ opacity: 0.6, display: 'grid', gap: '0.75rem', maxWidth: '60ch' }}>
      <div style={{ height: 20, width: '42%', background: 'var(--color-border)', borderRadius: 4 }} />
      {[0, 1, 2].map((i) => (
        <div key={i} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: '0.625rem' }}>
          <div style={{ height: 14, width: `${72 - i * 9}%`, background: 'var(--color-border)', borderRadius: 4 }} />
        </div>
      ))}
    </div>
  )
}

export const filterCollectionFaqsPuckComponent = {
  label: 'Filter Page: FAQs [Anchor]',
  fields: {
    title: { type: 'text' as const, label: 'Heading (blank hides it)' },
    scope: {
      type: 'select' as const,
      label: 'Questions to show',
      options: [
        { value: 'own', label: "This page's own questions" },
        { value: 'inherited', label: "Those, plus the shop's" },
      ],
    },
    columns: {
      type: 'select' as const,
      label: 'Columns on desktop',
      options: [
        { value: '2', label: 'Two' },
        { value: '1', label: 'One' },
      ],
    },
  },
  // 'own' by default, on the same reasoning as shop's category block: the
  // shop-wide answers are already on every product this page lists, and printing
  // them here as well puts identical FAQPage markup on both.
  defaultProps: { title: 'Frequently asked questions', scope: 'own', columns: '2' },
  render: FilterCollectionFaqs,
}
