import { describe, expect, it } from 'vitest'
import { applySelectionToParams, preselectByGroup, sameSelection, selectionFromParams } from './preselect'
import type { FltSelection } from './filter-logic'

// Colour holds green and blue; Finish holds oak. A filter page built on green
// preselects 'c-green'.
const GROUPS = [
  { id: 'g-colour', slug: 'colour', filters: [{ id: 'c-green', slug: 'green' }, { id: 'c-blue', slug: 'blue' }] },
  { id: 'g-finish', slug: 'finish', filters: [{ id: 'f-oak', slug: 'oak' }] },
]

const NONE = new Map<string, Set<string>>()
const GREEN = preselectByGroup(GROUPS, ['c-green'])

function selection(entries: Record<string, string[]>): FltSelection {
  return new Map(Object.entries(entries).map(([k, v]) => [k, new Set(v)]))
}

function query(selected: FltSelection, preselected: Map<string, Set<string>>, from = ''): string {
  const params = new URLSearchParams(from)
  applySelectionToParams(GROUPS, selected, preselected, params)
  return params.toString()
}

describe('preselectByGroup', () => {
  it('splits a flat list of filter ids by the group each one belongs to', () => {
    const split = preselectByGroup(GROUPS, ['c-green', 'f-oak'])
    expect([...(split.get('g-colour') ?? [])]).toEqual(['c-green'])
    expect([...(split.get('g-finish') ?? [])]).toEqual(['f-oak'])
  })

  it('ignores an id belonging to no group on this page', () => {
    expect(preselectByGroup(GROUPS, ['c-gone']).size).toBe(0)
  })
})

describe('sameSelection', () => {
  it('counts absent and empty as the same thing', () => {
    expect(sameSelection(undefined, new Set())).toBe(true)
  })
  it('is order-independent but size-sensitive', () => {
    expect(sameSelection(new Set(['a', 'b']), new Set(['b', 'a']))).toBe(true)
    expect(sameSelection(new Set(['a']), new Set(['a', 'b']))).toBe(false)
  })
})

describe('selectionFromParams', () => {
  it('reads the query string on a page with no preselection, exactly as it always did', () => {
    const got = selectionFromParams(GROUPS, new URLSearchParams('colour=blue'), NONE)
    expect([...(got.get('g-colour') ?? [])]).toEqual(['c-blue'])
    expect(got.has('g-finish')).toBe(false)
  })

  it('ticks the page preselection when the query string says nothing', () => {
    const got = selectionFromParams(GROUPS, new URLSearchParams(''), GREEN)
    expect([...(got.get('g-colour') ?? [])]).toEqual(['c-green'])
  })

  it('lets the query string overrule the preselection', () => {
    const got = selectionFromParams(GROUPS, new URLSearchParams('colour=blue'), GREEN)
    expect([...(got.get('g-colour') ?? [])]).toEqual(['c-blue'])
  })

  // The whole point of the empty parameter: an untick that survives a refresh.
  it('honours an empty parameter as a deliberate clearing, not as silence', () => {
    const got = selectionFromParams(GROUPS, new URLSearchParams('colour='), GREEN)
    expect(got.has('g-colour')).toBe(false)
  })

  it('leaves an unrelated group on its own preselection when another is cleared', () => {
    const both = preselectByGroup(GROUPS, ['c-green', 'f-oak'])
    const got = selectionFromParams(GROUPS, new URLSearchParams('colour='), both)
    expect(got.has('g-colour')).toBe(false)
    expect([...(got.get('g-finish') ?? [])]).toEqual(['f-oak'])
  })
})

describe('applySelectionToParams', () => {
  it('writes what is ticked on a page with no preselection', () => {
    expect(query(selection({ 'g-colour': ['c-blue'] }), NONE)).toBe('colour=blue')
    expect(query(selection({}), NONE)).toBe('')
  })

  it('leaves a filter page at its own clean address while nothing has changed', () => {
    expect(query(selection({ 'g-colour': ['c-green'] }), GREEN)).toBe('')
  })

  it('writes the whole group once the shopper adds to the preselection', () => {
    expect(query(selection({ 'g-colour': ['c-green', 'c-blue'] }), GREEN)).toBe('colour=green%2Cblue')
  })

  it('writes an empty parameter when a preselected group is cleared', () => {
    expect(query(selection({}), GREEN)).toBe('colour=')
  })

  it('does not write an empty parameter for a group the page never preselected', () => {
    expect(query(selection({}), NONE, 'colour=blue')).toBe('')
  })

  it('leaves parameters it does not own alone', () => {
    expect(query(selection({ 'g-colour': ['c-blue'] }), GREEN, 'sort=price-asc')).toBe('sort=price-asc&colour=blue')
  })

  // Read and write have to agree, or a refresh means something different from
  // the click that produced the url.
  it('round-trips every state back to the selection it came from', () => {
    for (const selected of [
      selection({ 'g-colour': ['c-green'] }),
      selection({ 'g-colour': ['c-blue'] }),
      selection({ 'g-colour': ['c-green', 'c-blue'] }),
      selection({}),
      selection({ 'g-finish': ['f-oak'] }),
    ]) {
      const params = new URLSearchParams(query(selected, GREEN))
      const back = selectionFromParams(GROUPS, params, GREEN)
      for (const group of GROUPS) {
        expect(sameSelection(back.get(group.id), selected.get(group.id))).toBe(true)
      }
    }
  })
})
