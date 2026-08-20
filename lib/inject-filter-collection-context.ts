import type { FltPuckData } from '@/modules/filters-for-shop/lib/types'

// The blocks that resolve the page's record from its slug. The grid is not one
// of them - it is handed the source and the preselection outright below, and a
// slug it never reads would only be a prop to wonder about later.
const CONTEXT_BLOCKS = new Set(['FilterCollectionHeader', 'FilterCollectionIntro'])

type FilterCollectionContext = {
  // The collection's own slug. Every block resolves the record from it rather
  // than being handed a copy, so the injection stays a two-string write however
  // big the designed intro grows.
  filterPageSlug: string
  // What the grid starts from, resolved from the collection's source. Exactly
  // the three props the Filter Grid block already takes, so the block needs no
  // filter-collection knowledge to be pointed at the right products.
  categorySlug: string
  collectionSlug: string
  tagSlug: string
  // Which filters arrive ticked.
  preselectFilterIds: string[]
}

// The 'filterCollection' layout is one template stamped for every filter
// collection page, so its blocks carry no per-page slug of their own - the page
// writes the current one into each of these block types' props right before
// rendering. Mirrors shop's inject-category-context.ts, which does the same job
// for the Category layout.
function injectBlocks(blocks: unknown[], ctx: FilterCollectionContext): void {
  for (const item of blocks) {
    if (!item || typeof item !== 'object') continue
    const block = item as { type?: string; props?: Record<string, unknown> }
    if (block.type && CONTEXT_BLOCKS.has(block.type) && block.props) {
      block.props.filterPageSlug = ctx.filterPageSlug
    }
    if (block.type === 'ShopFilterGrid' && block.props) {
      // The source wins over whatever the block was saved with: a template
      // pointed at one category would otherwise show that category on every
      // filter page built from it.
      block.props.categorySlug = ctx.categorySlug
      block.props.collectionSlug = ctx.collectionSlug
      block.props.tagSlug = ctx.tagSlug
      block.props.preselectFilterIds = ctx.preselectFilterIds
    }
    if (block.props) {
      for (const value of Object.values(block.props)) {
        if (Array.isArray(value)) injectBlocks(value, ctx)
      }
    }
  }
}

export function injectFilterCollectionContext(data: FltPuckData, ctx: FilterCollectionContext): FltPuckData {
  const cloned = JSON.parse(JSON.stringify(data)) as FltPuckData
  const content = Array.isArray(cloned.content) ? cloned.content : []
  const zoneBlocks = Object.values(cloned.zones ?? {}).flatMap((z) => (Array.isArray(z) ? z : []))
  injectBlocks([...content, ...zoneBlocks], ctx)
  return cloned
}

// The three grid props a collection's source resolves to. ALL leaves all three
// empty, which is exactly how the Filter Grid block already spells "the whole
// catalogue".
export function sourceGridProps(sourceType: string, sourceSlug: string | null): { categorySlug: string; collectionSlug: string; tagSlug: string } {
  const slug = sourceSlug ?? ''
  return {
    categorySlug: sourceType === 'CATEGORY' ? slug : '',
    collectionSlug: sourceType === 'COLLECTION' ? slug : '',
    tagSlug: sourceType === 'TAG' ? slug : '',
  }
}
