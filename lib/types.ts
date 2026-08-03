// Shared types for filters-for-shop. Groups hold filters, filters hold rules;
// a rule is a (option name, value label) pair matched against shop-variations.

export type FltControlType = 'CHECKBOX' | 'SWATCH' | 'IMAGE' | 'DROPDOWN'

export type FltRule = {
  id: string
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
  rules: FltRule[]
}

export type FltGroup = {
  id: string
  name: string
  slug: string
  controlType: FltControlType
  position: number
  filters: FltFilter[]
}

export type FltSettings = {
  hideEmptyFilters: boolean
  swapCardImages: boolean
  preselectOnClick: boolean
}

// One distinct (option name, value label) pair across the whole catalogue, for
// the admin value picker. The swatch is whichever colour/image some product
// already carries for that label, offered as a starting point.
export type FltCatalogueValue = {
  label: string
  productCount: number
  swatch: string | null
}

export type FltCatalogueOption = {
  optionName: string
  values: FltCatalogueValue[]
}

// A swatch beginning like a URL or data URI is a picture; anything else is
// treated as a CSS colour. Same convention as product-attributes-for-shop.
export function isImageSwatch(swatch: string): boolean {
  return /^(https?:)?\//.test(swatch) || swatch.startsWith('data:')
}
