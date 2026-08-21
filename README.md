<p align="center">
  <img src="module-art.webp" alt="Filters for Shop" width="640" />
</p>

# Filters for Shop

Grouped storefront filters for the Cactus shop, designed for catalogues where the
interesting differences live on product variations rather than the products
themselves.

## What it does

- **Filter groups and filters.** A group is a heading on the filter panel
  (Colour, Finish, Width); a filter is one tick under it (Blue, Oak). Groups can
  render as colour swatches, picture swatches, tick lists or dropdowns.
- **One filter, many real values.** Each filter stands for any number of
  (option, value) pairs from shop-variations - "Blue" can cover Blue, Stevia
  Blue, Sky Blue and Powder Blue across every product, and automatically covers
  new products that use those values. Built from a searchable catalogue of every
  option value in the shop, with product counts.
- **Spec-based filters too.** A rule can equally match a product-attributes
  value ("Recommended Usage: 24 hours", "Shape: Wave"), read from the product
  itself or any of its variations, so filters work for differences that never
  made it onto a variation option.
- **Ticks that agree with each other.** Ticking Red and Leather asks for a red
  leather chair, not a chair that happens to be sold in red and, separately, in
  black leather. Where both ticks are carried by variations, one variation has
  to carry both. Ticks that belong to the listing rather than to a variation - a
  price band, a sub-category, a spec on the parent product - stay listing-wide.
- **Price bands.** A group can be a set of price bands (Under £100, £100 - £250,
  ...) matched against the same figure the product card shows - including
  products with no variations at all.
- **A panel that keeps up.** On desktop the filter panel is sticky, scrolling
  with the shopper down the grid (offset adjustable via `--flt-sticky-top`,
  default 7rem).
- **Variation-aware product cards.** While Blue is ticked, a matching product's
  card swaps to its blue variation's own photo, and clicking it opens the
  product with the blue options already pre-selected (via the variation's own
  deep link - no shop changes needed).
- **A proper filter panel.** Live product counts (facet-style: a tick never
  counts against its own siblings), active-filter chips, clear all, collapsible
  groups with per-group selection badges, long tick lists folded behind
  "Show all", an empty state, and the selection mirrored into the URL so a
  filtered view can be shared. A group that would surface fewer than two
  choices on a page is dropped entirely - one tick under a heading is not a
  choice (this covers the automatic Category group too).
- **A real filter sheet on small screens.** At or below the site's tablet
  breakpoint the panel becomes an overlay sheet - sliding in from the right on
  tablets, up from the bottom edge on phones - opened by a floating "Filter"
  pill that stays reachable however far the grid is scrolled. The sheet has a
  sticky "Show N products" apply footer with a clear-all beside it, a scrim,
  page scroll locking, Escape/scrim-tap to close, focus trapping and dialog
  semantics; motion respects `prefers-reduced-motion`.

- **Filter collections.** Any filtered view can become a page of its own:
  "Green Office Chairs" is the Office Chairs category with Colour=Green ticked
  on arrival, answering at `/green-office-chairs` with its own page title, meta
  description, sharing picture and designed intro. It starts from a category,
  collection, tag or the whole shop; the preselection is a starting point, not a
  lock, so the panel is the ordinary panel and every tick can be cleared.
  Published pages are added to the site's sitemap automatically. All of them are
  stamped through one shared `filterCollection` layout, so forty SEO pages do
  not mean forty layouts.

## Where things live

- **Admin > Shop > Catalogue > Filters** - build groups, filters and their value
  rules.
- **Admin > Shop > Catalogue > Filter Collections** - build filter pages: name,
  address, source, the filters ticked on arrival, the SEO fields, and a link out
  to the full-screen intro builder.
- **Settings > Shop > Filters** - hide empty filters, card photo swapping,
  pre-selection on click.
- **Page builder** - the `Shop: Filters & Product Grid` block, available on the
  shop index, category, collection and filter-collection layouts. Set the
  category/collection slug per page (or leave blank on a page whose products you
  scope by tag); on a filter collection page the source and the preselection are
  injected, so the block needs no settings there.
- **Design > Layouts > Filters > Filter collection page** - the one layout every
  filter collection page is stamped through, built from `Filter Page: Heading`,
  `Filter Page: Intro` and the grid. Without one, the pages fall back to a plain
  built-in shell so they work the day they are created.

## Requirements

- `shop` >= 0.1.129
- `shop-variations` >= 0.1.107 (filters match against its option values; the
  module sits idle but harmless if the tables are absent)
- `product-attributes-for-shop` is optional: when its tables are present the
  admin picker also offers spec values (as "Spec: ..." sections) for
  ATTRIBUTE-sourced rules.

## Data

Tables: `flt_groups`, `flt_filters`, `flt_filter_rules`, `flt_settings`,
`flt_collections`, `flt_collection_filters`.
Rules match by option **name** + value **label** (with a `source` marking
variation options apart from spec attributes), so they survive re-imports that
recreate per-product option rows, and a renamed option value simply drops out
of the filter until re-ticked. Price-band groups have `kind = 'PRICE'` and
carry `price_min`/`price_max` on each filter instead of rules.

A filter collection stores its source as a plain **slug**, not a foreign key:
shop owns those tables, and a dependent module has no business constraining the
module it depends on. A renamed category therefore leaves a page pointing at
nothing, which the admin screen reports rather than the database refusing a
rename it should never have had a say in. The preselected filters *are* a real
reference - those rows are this module's own, so a deleted filter takes its
preselection with it.

Filter collection pages answer at a bare top-level slug via the manifest's
`publicRootSlug` claim. Core asks that claim last, after info pages, module
indexes and the shop's own products, so a collection's slug is checked against
those owners when it is saved.
