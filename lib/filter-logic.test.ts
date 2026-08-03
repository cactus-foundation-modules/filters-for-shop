import { describe, expect, it } from 'vitest'
import { facetCount, matchesSelection, pickSwapFilter, pickSwapFilters, type FltSelection } from './filter-logic'

const sel = (entries: [string, string[]][]): FltSelection => new Map(entries.map(([g, ids]) => [g, new Set(ids)]))

describe('matchesSelection', () => {
  it('matches everything when nothing is ticked', () => {
    expect(matchesSelection([], sel([]))).toBe(true)
    expect(matchesSelection(['f1'], sel([]))).toBe(true)
  })

  it("OR's ticks within a group", () => {
    expect(matchesSelection(['blue'], sel([['colour', ['blue', 'green']]]))).toBe(true)
    expect(matchesSelection(['red'], sel([['colour', ['blue', 'green']]]))).toBe(false)
  })

  it("AND's across groups", () => {
    const selection = sel([['colour', ['blue']], ['finish', ['oak']]])
    expect(matchesSelection(['blue', 'oak'], selection)).toBe(true)
    expect(matchesSelection(['blue'], selection)).toBe(false)
    expect(matchesSelection(['oak'], selection)).toBe(false)
  })

  it('ignores a group whose tick set is empty', () => {
    expect(matchesSelection(['blue'], sel([['colour', ['blue']], ['finish', []]]))).toBe(true)
  })
})

describe('facetCount', () => {
  const matrix: [string, string[]][] = [
    ['p1', ['blue', 'oak']],
    ['p2', ['blue']],
    ['p3', ['green', 'oak']],
  ]

  it('counts as if the filter were the only tick in its group', () => {
    // Green ticked; Blue's count must not be strangled by its sibling Green.
    const selection = sel([['colour', ['green']]])
    expect(facetCount('blue', 'colour', matrix, selection)).toBe(2)
    expect(facetCount('green', 'colour', matrix, selection)).toBe(1)
  })

  it("respects other groups' ticks", () => {
    const selection = sel([['finish', ['oak']]])
    expect(facetCount('blue', 'colour', matrix, selection)).toBe(1) // only p1 is blue AND oak
    expect(facetCount('green', 'colour', matrix, selection)).toBe(1)
  })
})

describe('pickSwapFilter', () => {
  const groups = [
    { id: 'colour', filterIds: ['blue', 'green'] },
    { id: 'finish', filterIds: ['oak'] },
  ]

  it('returns null with nothing ticked', () => {
    expect(pickSwapFilter(['blue'], sel([]), groups)).toBe(null)
  })

  it('walks groups in order and picks the first ticked match', () => {
    const selection = sel([['colour', ['green']], ['finish', ['oak']]])
    expect(pickSwapFilter(['green', 'oak'], selection, groups)).toBe('green')
    expect(pickSwapFilter(['oak'], selection, groups)).toBe('oak')
  })

  it('returns null when the product matches none of the ticks', () => {
    expect(pickSwapFilter(['blue'], sel([['colour', ['green']]]), groups)).toBe(null)
  })
})

describe('pickSwapFilters', () => {
  const groups = [
    { id: 'colour', filterIds: ['blue', 'green'] },
    { id: 'finish', filterIds: ['oak'] },
  ]

  it('returns empty with nothing ticked', () => {
    expect(pickSwapFilters(['blue'], sel([]), groups)).toEqual([])
  })

  it('returns every ticked match in the owner order, across groups', () => {
    const selection = sel([['colour', ['green', 'blue']], ['finish', ['oak']]])
    expect(pickSwapFilters(['green', 'blue', 'oak'], selection, groups)).toEqual(['blue', 'green', 'oak'])
  })

  it('drops ticks the product does not match', () => {
    const selection = sel([['colour', ['green', 'blue']]])
    expect(pickSwapFilters(['blue'], selection, groups)).toEqual(['blue'])
    expect(pickSwapFilters(['oak'], selection, groups)).toEqual([])
  })

  it('agrees with pickSwapFilter on the first pick', () => {
    const selection = sel([['colour', ['green']], ['finish', ['oak']]])
    expect(pickSwapFilters(['green', 'oak'], selection, groups)[0]).toBe(pickSwapFilter(['green', 'oak'], selection, groups))
  })
})
