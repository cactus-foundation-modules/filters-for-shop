import { describe, expect, it } from 'vitest'
import { applyPriceBands, internVariations, offerGroups } from './grid-build'
import type { FltFilter, FltGroup } from './types'

function filter(over: Partial<FltFilter> & { id: string }): FltFilter {
  return {
    groupId: 'g',
    label: over.id,
    slug: over.id,
    swatch: null,
    swatchSmall: null,
    swatchTiny: null,
    position: 0,
    priceMin: null,
    priceMax: null,
    rules: [{ id: 'r', source: 'OPTION', optionName: 'Colour', valueLabel: over.id }],
    ...over,
  }
}

function group(over: Partial<FltGroup> & { id: string; filters: FltFilter[] }): FltGroup {
  return {
    name: over.id,
    slug: over.id,
    controlType: 'CHECKBOX',
    kind: 'VALUES',
    position: 0,
    ...over,
  }
}

describe('applyPriceBands', () => {
  const groups = [
    group({
      id: 'price',
      kind: 'PRICE',
      filters: [
        filter({ id: 'under-200', priceMax: 200, rules: [] }),
        filter({ id: '200-plus', priceMin: 200, rules: [] }),
        filter({ id: 'no-band', rules: [] }),
      ],
    }),
  ]

  it('bands each product into the filters its own price falls in', () => {
    const matrix = new Map<string, string[]>([['a', ['blue']]])
    applyPriceBands(matrix, groups, new Map([['a', 150], ['b', 200]]))
    expect(matrix.get('a')).toEqual(['blue', 'under-200'])
    expect(matrix.get('b')).toEqual(['200-plus'])
  })

  it('leaves a product with no usable price alone', () => {
    const matrix = new Map<string, string[]>()
    applyPriceBands(matrix, groups, new Map([['a', Number.NaN]]))
    expect(matrix.size).toBe(0)
  })

  it('does nothing at all without a PRICE group', () => {
    const matrix = new Map<string, string[]>([['a', ['blue']]])
    applyPriceBands(matrix, [group({ id: 'colour', filters: [filter({ id: 'blue' })] })], new Map([['a', 150]]))
    expect(matrix.get('a')).toEqual(['blue'])
  })
})

describe('internVariations', () => {
  // One product's variations, in the owner's order.
  function combo(filterIds: string[]) {
    return { filterIds }
  }

  it('writes each filter id and each distinct combination once', () => {
    const index = internVariations(new Map([
      ['a', [combo(['blue', 'oak']), combo(['oak', 'blue']), combo(['green', 'oak'])]],
      ['b', [combo(['blue', 'oak'])]],
    ]))
    expect(index.filterIds).toEqual(['blue', 'oak', 'green'])
    expect(index.combos).toEqual([[0, 1], [1, 2]])
    // The two spellings of blue+oak collapse to the one row, for both products.
    expect(index.byProduct).toEqual({ a: [0, 1], b: [0] })
  })

  it('leaves a product with no variations out entirely', () => {
    const index = internVariations(new Map([['a', []]]))
    expect(index.byProduct).toEqual({})
  })
})

describe('offerGroups', () => {
  const groups = [
    group({ id: 'colour', filters: [filter({ id: 'blue' }), filter({ id: 'green' }), filter({ id: 'puce' })] }),
    group({ id: 'finish', filters: [filter({ id: 'oak' }), filter({ id: 'ash' })] }),
  ]
  const matrix = new Map<string, string[]>([['a', ['blue', 'oak']], ['b', ['green', 'oak']]])

  it('drops filters nothing here matches when the setting says so', () => {
    const offered = offerGroups(groups, matrix, true, new Set())
    expect(offered.map((g) => g.id)).toEqual(['colour'])
    expect(offered[0]?.filters.map((f) => f.id)).toEqual(['blue', 'green'])
  })

  it('keeps every filter when the setting is off', () => {
    const offered = offerGroups(groups, matrix, false, new Set())
    expect(offered.map((g) => g.id)).toEqual(['colour', 'finish'])
  })

  it('keeps a preselected filter, and its group, when nothing here matches it', () => {
    const offered = offerGroups(groups, matrix, true, new Set(['ash']))
    // Finish would have been dropped for having one matching filter; the ticked
    // 'ash' both survives the cull and carries the group back in with it.
    expect(offered.map((g) => g.id)).toEqual(['colour', 'finish'])
    expect(offered[1]?.filters.map((f) => f.id)).toEqual(['oak', 'ash'])
  })

  it('drops a filter with no rules and no band', () => {
    const ruleless = [group({ id: 'colour', filters: [filter({ id: 'blue' }), filter({ id: 'green', rules: [] })] })]
    expect(offerGroups(ruleless, matrix, false, new Set())).toEqual([])
  })

  it('prefers the tiny swatch copy, falling back through small to the original', () => {
    const swatched = [group({
      id: 'colour',
      filters: [
        filter({ id: 'blue', swatch: '/full.jpg', swatchSmall: '/small.jpg', swatchTiny: '/tiny.jpg' }),
        filter({ id: 'green', swatch: '/full.jpg', swatchSmall: '/small.jpg' }),
        filter({ id: 'puce', swatch: '#c0c' }),
      ],
    })]
    expect(offerGroups(swatched, matrix, false, new Set())[0]?.filters.map((f) => f.swatch))
      .toEqual(['/tiny.jpg', '/small.jpg', '#c0c'])
  })
})
