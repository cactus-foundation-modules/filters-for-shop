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
