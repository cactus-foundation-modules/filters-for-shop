import { FLT_SORT_OPTIONS, FLT_SORT_RECOMMENDED_PARAM } from '@/modules/filters-for-shop/lib/sort'
import type { LayoutRef } from '@/lib/puck/LayoutPickerField'
import { ShopLayoutPicker } from '@/modules/shop/components/public/ShopLayoutPicker'

// EDITOR half only: placeholder + Puck field config. The server render (db
// access, matching, card stamping, filter panel) lives in ShopFilterGrid.rsc.tsx,
// wired by `rscImport` in the manifest so it never lands in the client editor
// bundle. Mirrors shop's own ShopProductGrid split for the same reason:
// lib/card-template dynamically imports lib/puck/config.rsc, which is tainted
// by next/headers.
export type ShopFilterGridProps = {
  categorySlug?: string
  collectionSlug?: string
  tagSlug?: string
  limit?: number
  columns?: number
  filterPosition?: string
  showCounts?: string
  categoryFilter?: string
  showSort?: string
  // Which order the grid starts in. Blank (an older saved layout, from before
  // this field existed) means best selling, which is the order a shop wants a
  // category page to open on far more often than the order the products happen
  // to be listed in.
  defaultSort?: string
  layoutRef?: LayoutRef | null
  // Paging. 'none' is what this block did before, and stays the default: every
  // matching product on screen at once. Switched on, "Number of products" stops
  // being the ceiling on the whole list and becomes the page size, with the
  // grid fetching up to shop's HARD_MAX_PER_PAGE behind it.
  paginate?: string
  pageSize?: number
  moreLabel?: string
  // Filter ids that arrive already ticked. Injected by a filter collection page
  // (lib/inject-filter-collection-context.ts) and never an editor field: which
  // filters a page starts on is a property of that page, not of the block, so
  // the one shared layout can be stamped for every filter collection.
  //
  // Preselection is a starting point, not a lock - the panel is the same panel
  // and every tick can be cleared, so the page behaves exactly as arriving at
  // the category with ?colour=green in the address.
  preselectFilterIds?: string[]
}

function FilterGridSkeleton({ columns, position }: { columns: number; position: string }) {
  const bar = (width: string, height = 11) => (
    <div style={{ height, width, background: 'var(--color-border)', borderRadius: 4 }} />
  )
  const dot = (bg: string) => (
    <span style={{ width: 16, height: 16, borderRadius: 999, background: bg, border: '1px solid var(--color-border)', display: 'inline-block' }} />
  )
  const filters = (
    <div style={{ display: 'flex', flexDirection: position === 'top' ? 'row' : 'column', gap: position === 'top' ? 24 : 18, flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
        {bar('4rem', 12)}
        <div style={{ display: 'flex', gap: 6 }}>
          {dot('#5b7fae')}{dot('#7d8a6f')}{dot('#a0a0a0')}{dot('#4a4a4a')}
        </div>
      </div>
      {['Finish', 'Width'].map((name) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
          {bar('4.5rem', 12)}
          {bar('6rem')}
          {bar('5rem')}
          {bar('5.5rem')}
        </div>
      ))}
    </div>
  )
  return (
    <div style={{ display: 'grid', gap: 28, gridTemplateColumns: position === 'left' ? 'minmax(200px,240px) 1fr' : '1fr', alignItems: 'start', opacity: 0.6 }}>
      {filters}
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, minmax(0,1fr))`, gap: 24 }}>
        {Array.from({ length: columns * 2 }).map((_, i) => (
          <div key={i} style={{ border: '1px solid var(--color-border)', borderRadius: 12, overflow: 'hidden', background: 'var(--color-surface)' }}>
            <div style={{ aspectRatio: '4/3', background: 'var(--color-bg-subtle)' }} />
            <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {bar('70%', 14)}
              {bar('35%', 14)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Editor canvas: static skeleton, no fetch during render (Gazette pattern).
export function ShopFilterGrid(props: ShopFilterGridProps) {
  return <FilterGridSkeleton columns={props.columns ?? 3} position={props.filterPosition ?? 'left'} />
}

const layoutField = {
  type: 'custom' as const,
  label: 'Card layout',
  render: ({ value, onChange }: any) => <ShopLayoutPicker type="shopProductCard" value={value} onChange={onChange} />,
}

export const shopFilterGridPuckComponent = {
  label: 'Shop: Filters & Product Grid',
  fields: {
    categorySlug: { type: 'text' as const, label: 'Category slug (optional)' },
    collectionSlug: { type: 'text' as const, label: 'Collection slug (optional)' },
    tagSlug: { type: 'text' as const, label: 'Tag slug (optional)' },
    limit: { type: 'number' as const, label: 'Number of products' },
    columns: { type: 'number' as const, label: 'Columns' },
    filterPosition: {
      type: 'select' as const,
      label: 'Filters',
      options: [
        { value: 'left', label: 'Down the left' },
        { value: 'top', label: 'Across the top' },
      ],
    },
    showCounts: {
      type: 'select' as const,
      label: 'Show product counts',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
    categoryFilter: {
      type: 'select' as const,
      label: 'Category filter (category pages)',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
    showSort: {
      type: 'select' as const,
      label: 'Sort by dropdown',
      options: [
        { value: 'yes', label: 'Yes' },
        { value: 'no', label: 'No' },
      ],
    },
    // The same list the dropdown itself offers, so the two can never drift.
    // 'recommended' stands in for the empty value here: a Puck select with a
    // blank value reads as "nothing chosen".
    defaultSort: {
      type: 'select' as const,
      label: 'Products start sorted by',
      options: FLT_SORT_OPTIONS.map((o) => ({ value: o.value || FLT_SORT_RECOMMENDED_PARAM, label: o.label })),
    },
    // Paged over whatever the filters have left, not over the raw list - see
    // FilterShell. Off by default so a saved layout renders as it always did.
    paginate: {
      type: 'select' as const,
      label: 'When there are more products than fit',
      options: [
        { value: 'none', label: 'Show them all on one page' },
      { value: 'scroll', label: 'Load more as the shopper scrolls' },
        { value: 'more', label: 'A "Show more" button' },
        { value: 'pages', label: 'Numbered pages' },
      ],
    },
    pageSize: { type: 'number' as const, label: 'Products per page (blank uses the number above)', min: 1, max: 100 },
    moreLabel: { type: 'text' as const, label: '"Show more" button label' },
    layoutRef: layoutField,
  },
  defaultProps: {
    categorySlug: '',
    collectionSlug: '',
    tagSlug: '',
    limit: 24,
    columns: 3,
    filterPosition: 'left',
    showCounts: 'yes',
    categoryFilter: 'yes',
    showSort: 'yes',
    defaultSort: 'best-selling',
    paginate: 'none',
    pageSize: undefined,
    moreLabel: 'Show more',
    layoutRef: null,
  },
  render: ShopFilterGrid,
}
