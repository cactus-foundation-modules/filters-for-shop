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
- **Variation-aware product cards.** While Blue is ticked, a matching product's
  card swaps to its blue variation's own photo, and clicking it opens the
  product with the blue options already pre-selected (via the variation's own
  deep link - no shop changes needed).
- **A proper filter panel.** Live product counts (facet-style: a tick never
  counts against its own siblings), active-filter chips, clear all, collapsible
  groups, a mobile filter drawer, an empty state, and the selection mirrored
  into the URL so a filtered view can be shared.

## Where things live

- **Admin > Shop > Filters** - build groups, filters and their value rules.
- **Settings > Shop > Filters** - hide empty filters, card photo swapping,
  pre-selection on click.
- **Page builder** - the `Shop: Filters & Product Grid` block, available on the
  shop index, category and collection layouts. Set the category/collection slug
  per page (or leave blank on a page whose products you scope by tag).

## Requirements

- `shop` >= 0.1.129
- `shop-variations` >= 0.1.107 (filters match against its option values; the
  module sits idle but harmless if the tables are absent)

## Data

Tables: `flt_groups`, `flt_filters`, `flt_filter_rules`, `flt_settings`.
Rules match by option **name** + value **label**, so they survive re-imports
that recreate per-product option rows, and a renamed option value simply drops
out of the filter until re-ticked.
