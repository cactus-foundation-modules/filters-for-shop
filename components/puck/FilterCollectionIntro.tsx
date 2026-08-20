// [ANCHOR] - filterPageSlug is injected by the filter collection page
// (lib/inject-filter-collection-context.ts).
//
// EDITOR half only. The server render lives in FilterCollectionIntro.rsc.tsx,
// wired by `rscImport` in the manifest.
export type FilterCollectionIntroProps = { filterPageSlug?: string }

export function FilterCollectionIntro() {
  const bar = (width: string, height = 12) => (
    <div style={{ height, width, background: 'var(--color-border)', borderRadius: 4 }} />
  )
  return (
    <div style={{ opacity: 0.6, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {bar('30%', 18)}
      {bar('100%')}
      {bar('92%')}
      {bar('64%')}
    </div>
  )
}

export const filterCollectionIntroPuckComponent = {
  label: 'Filter Page: Intro [Anchor]',
  fields: {},
  defaultProps: {},
  permissions: { delete: false, duplicate: false },
  render: FilterCollectionIntro,
}
