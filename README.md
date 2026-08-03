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
- `product-attributes-for-shop` is optional: when its tables are present the
  admin picker also offers spec values (as "Spec: ..." sections) for
  ATTRIBUTE-sourced rules.

## Data

Tables: `flt_groups`, `flt_filters`, `flt_filter_rules`, `flt_settings`.
Rules match by option **name** + value **label** (with a `source` marking
variation options apart from spec attributes), so they survive re-imports that
recreate per-product option rows, and a renamed option value simply drops out
of the filter until re-ticked. Price-band groups have `kind = 'PRICE'` and
carry `price_min`/`price_max` on each filter instead of rules.
