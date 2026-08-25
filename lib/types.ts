// Shared types for filters-for-shop. Groups hold filters, filters hold rules;
// a rule is a (name, label) pair matched against shop-variations option values
// (source OPTION) or product-attributes values (source ATTRIBUTE). PRICE-kind
// groups skip rules entirely: their filters carry a price band instead.

export type FltControlType = 'CHECKBOX' | 'SWATCH' | 'IMAGE' | 'DROPDOWN'
export type FltGroupKind = 'VALUES' | 'PRICE'
export type FltRuleSource = 'OPTION' | 'ATTRIBUTE'

export type FltRule = {
  id: string
  source: FltRuleSource
  optionName: string
  valueLabel: string
}

export type FltFilter = {
  id: string
  groupId: string
  label: string
  slug: string
  swatch: string | null
  // Shrunk copies of a picture swatch, made by core's resizer when the filter is
  // saved. The panel prefers the tiny one for its 14px dots and 56px tiles and
  // falls back through the small copy to `swatch`, so a filter with neither
  // draws exactly what it drew before the copies existed. Both null on a colour
  // swatch, which needs no shrinking.
  swatchSmall: string | null
  swatchTiny: string | null
  position: number
  // Band bounds for filters in a PRICE group: min inclusive, max exclusive,
  // null = open-ended. Always null on VALUES-group filters.
  priceMin: number | null
  priceMax: number | null
  rules: FltRule[]
}

export type FltGroup = {
  id: string
  name: string
  slug: string
  controlType: FltControlType
  kind: FltGroupKind
  position: number
  filters: FltFilter[]
}

export type FltSettings = {
  hideEmptyFilters: boolean
  swapCardImages: boolean
  preselectOnClick: boolean
}

// One distinct (name, label) pair across the whole catalogue, for the admin
// value picker. The swatch is whichever colour/image some product already
// carries for that label, offered as a starting point.
export type FltCatalogueValue = {
  label: string
  productCount: number
  swatch: string | null
}

export type FltCatalogueOption = {
  source: FltRuleSource
  optionName: string
  values: FltCatalogueValue[]
}

// A swatch beginning like a URL or data URI is a picture; anything else is
// treated as a CSS colour. Same convention as product-attributes-for-shop.
export function isImageSwatch(swatch: string): boolean {
  return /^(https?:)?\//.test(swatch) || swatch.startsWith('data:')
}

// Does a price fall inside a band filter? Shared by the storefront matrix
// builder and anything that wants to sanity-check band coverage.
export function priceInBand(price: number, min: number | null, max: number | null): boolean {
  if (min !== null && price < min) return false
  if (max !== null && price >= max) return false
  return true
}

// ---------------------------------------------------------------------------
// Filter collections: a saved page built out of the filters above.
//
// "Green Office Chairs" is the Office Chairs category with Colour=Green already
// ticked, at an address of its own with its own title, meta description and
// designed intro. The preselection is a starting point, not a lock: the panel is
// the same panel, and the shopper can untick green like any other filter.
// ---------------------------------------------------------------------------

export type FltCollectionStatus = 'DRAFT' | 'PUBLISHED'
export type FltCollectionSource = 'CATEGORY' | 'COLLECTION' | 'TAG' | 'ALL'

export type FltCollection = {
  id: string
  name: string
  slug: string
  status: FltCollectionStatus
  sourceType: FltCollectionSource
  // The shop category/collection/tag slug the source names; null on ALL.
  sourceSlug: string | null
  shortDescription: string | null
  // The designed intro document, built in the full-screen builder. Null until
  // someone opens the builder and saves something.
  introPuck: FltPuckData | null
  metaTitle: string | null
  metaDescription: string | null
  ogImage: string | null
  noindex: boolean
  position: number
  updatedAt: Date
  // The filters that arrive ticked, in the order they were picked.
  filterIds: string[]
}

// A Puck document, structurally - the same shape shop's own designed
// descriptions use, since it is the same builder writing it. Declared here
// rather than imported so the media hooks and the storefront page can name the
// shape without pulling a second module's type graph in for three fields.
export type FltPuckData = { root: { props?: Record<string, unknown> }; content: unknown[]; zones?: Record<string, unknown> }

// The layout type the whole set of filter collection pages is designed through -
// one template, stamped for every page, exactly as the shop's Category layout is
// one template stamped for every category. Declared in cactus.module.json's
// layoutTypes, so it appears in Design > Layouts on its own.
export const FILTER_COLLECTION_LAYOUT_TYPE = 'filterCollection'

// The layout type a single page's designed intro is built through. Deliberately
// NOT declared in layoutTypes: nothing registers blocks against it, so the
// builder offers core's shared content parts only (headings, text, images,
// columns, callouts) with a bare root - no page chrome inside a page. Same trick
// as shop's category description builder.
export const FILTER_COLLECTION_INTRO_LAYOUT_TYPE = 'filterCollectionIntro'

// A designed intro opened in the builder but never built in is an empty
// document, not a null one; treating that as "designed" would print an empty
// div where the plain blurb should be.
export function hasIntroContent(doc: FltPuckData | null): doc is FltPuckData {
  return !!doc && Array.isArray(doc.content) && doc.content.length > 0
}
