// How the filter grid's data travels to the browser.
//
// The shell filters and sorts in the browser, so it is handed the whole shelf
// up front: which filters every product matches, every variation's answer,
// every card photo a tick can swap in, and every figure the sort dropdown orders
// on. That has to be in the HTML, and measured on deskwell.co.uk's office-chairs
// category in September 2026 it was 283 KB of flight payload for 213 products -
// after lib/swap-pack.ts and the variation index had already folded the worst of
// it.
//
// What was left was mostly the same two kinds of string said over and over. The
// 213 product ids were written out up to five times each (the matrix, the sort
// keys, the swaps, the variation index and the shop's own order), and the 76
// filter ids 2,603 times in the matrix alone - nearly forty bytes a time, to say
// which of seventy-six things a product matched. The sort keys spelled out
// `"price"`, `"created"` and `"popularity"` for every product. The photo folders
// averaged 140 characters, eighty of them the same as the folder before.
//
// The same shelf packs to 112 KB here, and the round trip gives back every byte
// of the 283.
//
// So this wire shape says each product id and each filter id once, in two
// tables, and everything else points into them by position:
//
//  * Product-shaped data (matrix rows, sort keys, variation and swap entries)
//    is a column per field, lined up with the product table, so a product's id
//    is never written again at all. A product with no entry is a null in its
//    slot, never a missing one, because the shell treats "absent" and "empty"
//    differently in places (a product the matrix does not hold is not counted).
//  * The product table opens with the shop's own order, so that order costs a
//    single number rather than a second list of ids.
//  * The filter table opens with the groups' own filters, in panel order, so
//    the groups carry a count and their filters' labels ride in columns.
//  * Ids are folded to twenty-two characters - see lib/compact-id.ts.
//  * Photo folders are written as how much of the folder before they share.
//  * Creation times are written as the step from the product before, which on a
//    catalogue imported in batches is very often nothing - 196 times out of 213
//    on that shelf.
//
// Lossless by construction, and asserted rather than trusted in
// lib/grid-pack.test.ts: unpackFilterGrid hands the shell exactly the props it
// was built from, down to the order of the ids in a matrix row. The filter
// maths, the sort and the on-demand card fetch then run on the same values they
// always did, and the ids the shell asks the server for cards by are the same
// plain product ids the server function has always validated.

import type { FltGridData, FltVariationIndex } from '@/modules/filters-for-shop/components/public/FilterShell'
import type { FltPackedSwap, FltSwapIndex } from '@/modules/filters-for-shop/lib/swap-pack'
import type { FltSortKey } from '@/modules/filters-for-shop/lib/sort'
import type { FltControlType } from '@/modules/filters-for-shop/lib/types'
import { compactId, expandId } from '@/modules/filters-for-shop/lib/compact-id'

/** One group: what the panel prints for it, and how many entries of the filter
 *  table - taken in order, after the groups before it - are its filters. */
export type FltPackedGroup = [id: string, name: string, slug: string, controlType: FltControlType, filterCount: number]

/** A list of strings, each written as how many characters it shares with the
 *  string before it plus whatever follows. */
export type FltFrontCodedStrings = {
  sharedLengths: number[]
  suffixes: string[]
}

/** The variation index (FltVariationIndex) with its ids replaced. */
export type FltPackedVariations = {
  /** The index's own filter id list, as positions in the grid's filter table.
   *  Kept as a list of its own because `combos` count along it. */
  filterIds: number[]
  /** Untouched: already positions in the list above. */
  combos: number[][]
  /** Lined up with the product table: the product's combination positions, or
   *  null where the index holds nothing for it. */
  byProduct: (number[] | null)[]
}

/** The swap index (FltSwapIndex) with its ids replaced and its rows turned into
 *  columns. Every row keeps its own filter, folder and parameter positions, so
 *  the index it unpacks to is the one it was packed from. */
export type FltPackedSwaps = {
  /** The index's own filter list (`g`), as positions in the grid's filter table. */
  filterIds: number[]
  /** The index's photo folders (`f`), front coded. */
  folders: FltFrontCodedStrings
  /** The index's option parameters (`q`), untouched. */
  params: string[]
  /** Lined up with the product table: how many swap rows the product has, or -1
   *  where the index holds no entry for it at all. The rows themselves follow in
   *  product table order, one entry per row in each column below. */
  rowCounts: number[]
  rowFilters: number[]
  rowFolders: number[]
  rowFiles: string[]
  rowParams: number[]
  /** Folded - see lib/compact-id.ts. */
  rowSourceIds: string[]
}

/** The sort keys as columns lined up with the product table. */
export type FltPackedSortKeys = {
  /** Null where the product has no sort key at all; every other column then
   *  holds a placeholder in that slot. */
  names: (string | null)[]
  prices: (number | null)[]
  popularity: (number | null)[]
  /** Milliseconds since the epoch. When `createdAsSteps` is true, each product
   *  that has a sort key holds the difference from the last one before it that
   *  had one (the first holds its own value). False only when some figure is not
   *  a whole number a step could carry exactly, and then these are the figures
   *  themselves. */
  created: number[]
  createdAsSteps: boolean
}

/** The whole grid as it travels. */
export type FltPackedGrid = {
  /** Every product the grid names, each once, folded. */
  productIds: string[]
  /** The shop's own order: a count where it is simply the start of the product
   *  table (always, unless it named a product twice), otherwise positions in it.
   *  Absent where the shell was handed no order. */
  serverOrder?: number | number[]
  renderedIds?: number[]
  /** Every filter the grid names, each once, folded: first the groups' filters in
   *  panel order, then any other filter a product matches (a group culled for
   *  having only one way to cut still leaves its filter on the products). */
  filterIds: string[]
  groups: FltPackedGroup[]
  /** Lined up with the groups' stretch of the filter table. */
  filterLabels: string[]
  filterSlugs: string[]
  filterSwatches: (string | null)[]
  preselect?: number[]
  /** Lined up with the product table: filter table positions in the order the
   *  matrix row held them, or null where the matrix holds no row for it. */
  matrix: (number[] | null)[]
  variations?: FltPackedVariations
  swaps: FltPackedSwaps
  sortKeys: FltPackedSortKeys
}

/** Assigns each distinct string the position of its first appearance. */
class InternTable {
  readonly values: string[] = []
  private readonly positionOf = new Map<string, number>()

  intern(value: string): number {
    const existing = this.positionOf.get(value)
    if (existing !== undefined) return existing
    const position = this.values.push(value) - 1
    this.positionOf.set(value, position)
    return position
  }

  /** Appends a value in its own slot even if it is already present - the groups'
   *  filters keep their positions whatever repeats - while lookups still find
   *  the first. */
  appendInPlace(value: string): void {
    const position = this.values.push(value) - 1
    if (!this.positionOf.has(value)) this.positionOf.set(value, position)
  }
}

/** Front coding: each string as its shared prefix length with the one before
 *  it, and the rest. A shared prefix never ends halfway through a surrogate
 *  pair, so every suffix is well-formed text on its own. */
export function frontCodeStrings(values: readonly string[]): FltFrontCodedStrings {
  const sharedLengths: number[] = []
  const suffixes: string[] = []
  let previous = ''
  for (const value of values) {
    const limit = Math.min(previous.length, value.length)
    let shared = 0
    while (shared < limit && previous.charCodeAt(shared) === value.charCodeAt(shared)) shared++
    const lastShared = value.charCodeAt(shared - 1)
    if (shared > 0 && lastShared >= 0xd800 && lastShared <= 0xdbff) shared--
    sharedLengths.push(shared)
    suffixes.push(value.slice(shared))
    previous = value
  }
  return { sharedLengths, suffixes }
}

export function expandFrontCodedStrings(coded: FltFrontCodedStrings): string[] {
  const values: string[] = []
  let previous = ''
  coded.suffixes.forEach((suffix, at) => {
    previous = previous.slice(0, coded.sharedLengths[at] ?? 0) + suffix
    values.push(previous)
  })
  return values
}

/** Pack the shell's data for the wire - see the note at the top of this file. */
export function packFilterGrid(data: FltGridData): FltPackedGrid {
  // Every product id first, so the columns below can all be lined up with one
  // finished table. The shop's own order goes in first of all: that is what lets
  // it travel as a count.
  const products = new InternTable()
  for (const id of data.serverOrder ?? []) products.intern(id)
  for (const id of Object.keys(data.matrix)) products.intern(id)
  for (const id of Object.keys(data.sortKeys)) products.intern(id)
  for (const id of Object.keys(data.variations?.byProduct ?? {})) products.intern(id)
  for (const id of Object.keys(data.swaps.p)) products.intern(id)
  for (const id of data.renderedIds ?? []) products.intern(id)
  const productIds = products.values

  const filters = new InternTable()
  const groups: FltPackedGroup[] = []
  const filterLabels: string[] = []
  const filterSlugs: string[] = []
  const filterSwatches: (string | null)[] = []
  for (const group of data.groups) {
    groups.push([group.id, group.name, group.slug, group.controlType, group.filters.length])
    for (const filter of group.filters) {
      filters.appendInPlace(filter.id)
      filterLabels.push(filter.label)
      filterSlugs.push(filter.slug)
      filterSwatches.push(filter.swatch)
    }
  }
  const filterPosition = (id: string) => filters.intern(id)

  // Lined up with the product table: the product's value, or null where the
  // record holds nothing for it.
  const column = <Value, Packed>(record: Record<string, Value>, pack: (value: Value) => Packed): (Packed | null)[] =>
    productIds.map((id) => {
      const value = Object.hasOwn(record, id) ? record[id] : undefined
      return value === undefined ? null : pack(value)
    })

  const matrix = column(data.matrix, (row) => row.map(filterPosition))

  let variations: FltPackedVariations | undefined
  if (data.variations) {
    variations = {
      filterIds: data.variations.filterIds.map(filterPosition),
      combos: data.variations.combos,
      byProduct: column(data.variations.byProduct, (positions) => positions),
    }
  }

  const swaps: FltPackedSwaps = {
    filterIds: data.swaps.g.map(filterPosition),
    folders: frontCodeStrings(data.swaps.f),
    params: data.swaps.q,
    rowCounts: [],
    rowFilters: [],
    rowFolders: [],
    rowFiles: [],
    rowParams: [],
    rowSourceIds: [],
  }
  for (const id of productIds) {
    const rows = Object.hasOwn(data.swaps.p, id) ? data.swaps.p[id] : undefined
    swaps.rowCounts.push(rows ? rows.length : -1)
    for (const [filter, folder, file, param, sourceId] of rows ?? []) {
      swaps.rowFilters.push(filter)
      swaps.rowFolders.push(folder)
      swaps.rowFiles.push(file)
      swaps.rowParams.push(param)
      swaps.rowSourceIds.push(compactId(sourceId))
    }
  }

  const sortKeys = packSortKeys(productIds, data.sortKeys)

  const packed: FltPackedGrid = {
    productIds: productIds.map(compactId),
    filterIds: [],
    groups,
    filterLabels,
    filterSlugs,
    filterSwatches,
    matrix,
    swaps,
    sortKeys,
  }
  // Optional keys are left off rather than set to undefined, which the flight
  // format would otherwise spell out in full.
  if (data.serverOrder) {
    const isTablePrefix = data.serverOrder.every((id, at) => productIds[at] === id)
    packed.serverOrder = isTablePrefix ? data.serverOrder.length : data.serverOrder.map((id) => products.intern(id))
  }
  if (data.renderedIds) packed.renderedIds = data.renderedIds.map((id) => products.intern(id))
  if (data.preselect) packed.preselect = data.preselect.map(filterPosition)
  if (variations) packed.variations = variations
  // Last, because everything above may have added a filter the groups do not offer.
  packed.filterIds = filters.values.map(compactId)
  return packed
}

function packSortKeys(productIds: readonly string[], sortKeys: Record<string, FltSortKey>): FltPackedSortKeys {
  const names: (string | null)[] = []
  const prices: (number | null)[] = []
  const popularity: (number | null)[] = []
  const createdFigures: number[] = []
  for (const id of productIds) {
    const key = Object.hasOwn(sortKeys, id) ? sortKeys[id] : undefined
    names.push(key ? key.name : null)
    prices.push(key ? key.price : null)
    popularity.push(key ? key.popularity : null)
    createdFigures.push(key ? key.created : 0)
  }
  // Steps only where every step, and every running total rebuilt from them, is
  // a whole number JavaScript holds exactly. An invalid date (NaN) or anything
  // fractional travels as the figure itself instead.
  const steps: number[] = []
  let previous = 0
  let createdAsSteps = true
  names.forEach((name, at) => {
    const figure = createdFigures[at] ?? 0
    if (name === null) {
      steps.push(0)
      return
    }
    const step = figure - previous
    if (!Number.isSafeInteger(figure) || !Number.isSafeInteger(step)) createdAsSteps = false
    steps.push(step)
    previous = figure
  })
  return { names, prices, popularity, created: createdAsSteps ? steps : createdFigures, createdAsSteps }
}

/** The shell's data back out of the wire shape: exactly what packFilterGrid was
 *  handed. */
export function unpackFilterGrid(packed: FltPackedGrid): FltGridData {
  const productIds = packed.productIds.map(expandId)
  const filterIds = packed.filterIds.map(expandId)
  const productAt = (position: number) => productIds[position] ?? ''
  const filterAt = (position: number) => filterIds[position] ?? ''

  // A record back out of a column lined up with the product table. Built with
  // Object.fromEntries so that no id, however it is spelled, can land anywhere
  // but as a key of its own.
  const record = <Packed, Value>(column: readonly (Packed | null)[], unpack: (packedValue: Packed) => Value): Record<string, Value> =>
    Object.fromEntries(
      productIds.flatMap((id, at): [string, Value][] => {
        const packedValue = column[at]
        return packedValue === null || packedValue === undefined ? [] : [[id, unpack(packedValue)]]
      }),
    )

  let groupFilterStart = 0
  const groups = packed.groups.map(([id, name, slug, controlType, filterCount]) => {
    const start = groupFilterStart
    groupFilterStart += filterCount
    return {
      id,
      name,
      slug,
      controlType,
      filters: Array.from({ length: filterCount }, (_, offset) => ({
        id: filterAt(start + offset),
        label: packed.filterLabels[start + offset] ?? '',
        slug: packed.filterSlugs[start + offset] ?? '',
        swatch: packed.filterSwatches[start + offset] ?? null,
      })),
    }
  })

  const swapFolders = expandFrontCodedStrings(packed.swaps.folders)
  const swapRows: [string, FltPackedSwap[]][] = []
  let row = 0
  packed.swaps.rowCounts.forEach((count, at) => {
    if (count < 0) return
    const rows: FltPackedSwap[] = []
    for (let taken = 0; taken < count; taken++, row++) {
      rows.push([
        packed.swaps.rowFilters[row] ?? 0,
        packed.swaps.rowFolders[row] ?? -1,
        packed.swaps.rowFiles[row] ?? '',
        packed.swaps.rowParams[row] ?? -1,
        expandId(packed.swaps.rowSourceIds[row] ?? ''),
      ])
    }
    swapRows.push([productAt(at), rows])
  })
  const swaps: FltSwapIndex = {
    g: packed.swaps.filterIds.map(filterAt),
    f: swapFolders,
    q: packed.swaps.params,
    p: Object.fromEntries(swapRows),
  }

  const sortKeyEntries: [string, FltSortKey][] = []
  let created = 0
  packed.sortKeys.names.forEach((name, at) => {
    if (name === null) return
    const figure = packed.sortKeys.created[at] ?? 0
    created = packed.sortKeys.createdAsSteps ? created + figure : figure
    sortKeyEntries.push([productAt(at), {
      name,
      price: packed.sortKeys.prices[at] ?? null,
      created,
      popularity: packed.sortKeys.popularity[at] ?? null,
    }])
  })

  const data: FltGridData = {
    groups,
    matrix: record(packed.matrix, (positions) => positions.map(filterAt)),
    swaps,
    sortKeys: Object.fromEntries(sortKeyEntries),
  }
  if (packed.variations) {
    const variations: FltVariationIndex = {
      filterIds: packed.variations.filterIds.map(filterAt),
      combos: packed.variations.combos,
      byProduct: record(packed.variations.byProduct, (positions) => positions),
    }
    data.variations = variations
  }
  if (packed.serverOrder !== undefined) {
    data.serverOrder = typeof packed.serverOrder === 'number'
      ? productIds.slice(0, packed.serverOrder)
      : packed.serverOrder.map(productAt)
  }
  if (packed.renderedIds) data.renderedIds = packed.renderedIds.map(productAt)
  if (packed.preselect) data.preselect = packed.preselect.map(filterAt)
  return data
}
