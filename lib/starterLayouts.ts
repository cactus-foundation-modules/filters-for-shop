// Starter templates this module contributes to layout types it does NOT own,
// collected by scripts/generate-module-layout-types.mjs through the
// `layoutStarters` key in cactus.module.json.
//
// Why here rather than in shop: the whole point of a supplier page is a filtered
// grid, but the block that draws one belongs to this module. Shop cannot put
// `ShopFilterGrid` in a starter of its own - a shop without filters installed
// would be offered a template made of a block it has not got. Contributed from
// this side, the starter simply is not there unless this module is, which is the
// case `layoutStarters` was built for.
//
// The blocks are named as strings, the same way shop's inject-supplier-context
// names this one. No import crosses between the two modules in either direction.

const block = (type: string, id: string, props: Record<string, unknown> = {}) => ({ type, props: { id, ...props } })

// Deliberately no `supplierSlug` on the grid: one layout serves every supplier,
// and shop's supplier page injects the slug of whichever one is being shown.
// Deliberately no `categoryFilter` either - that setting offers a page's
// sub-categories, and a supplier has none; left at its default it simply finds
// nothing to offer and the section does not appear.
export function shopSupplierFilterStarters() {
  return [
    {
      id: 'starter-shop-supplier-filtered',
      // The one a site is seeded with, so a supplier page arrives WITH its filter
      // panel rather than as a plain grid somebody has to go and rebuild. Beats
      // shop's own unflagged supplier starters in planModuleSeedTemplates; a shop
      // without this module installed still gets shop's plain one.
      publishByDefault: true,
      name: 'Header, Write-up and Filtered Grid',
      description: 'The supplier\'s name, whatever you have written about them, then their whole range with the filter panel down the side.',
      data: {
        content: [
          block('ShopSupplierHeader', 'header-1'),
          block('ShopSupplierDescription', 'description-1'),
          block('ShopFilterGrid', 'grid-1', {
            columns: 3,
            limit: 12,
            filterPosition: 'left',
            showCounts: 'yes',
            showSort: 'yes',
            defaultSort: 'best-selling',
            // A supplier's whole range is the one page most likely to run long,
            // so this starter arrives paged and fetching its later pages rather
            // than building four hundred cards into the document.
            paginate: 'scroll',
            pageLoad: 'ondemand',
          }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
    {
      id: 'starter-shop-supplier-filtered-plain',
      name: 'Header and Filtered Grid',
      description: 'Straight to the range, with the filter panel and no write-up above it.',
      data: {
        content: [
          block('ShopSupplierHeader', 'header-1'),
          block('ShopFilterGrid', 'grid-1', {
            columns: 3,
            limit: 12,
            filterPosition: 'left',
            showCounts: 'yes',
            showSort: 'yes',
            defaultSort: 'best-selling',
            paginate: 'scroll',
            pageLoad: 'ondemand',
          }),
        ],
        root: { props: {} },
        zones: {},
      },
    },
  ]
}
