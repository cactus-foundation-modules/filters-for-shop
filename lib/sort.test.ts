import { describe, expect, it } from 'vitest'
import { isFltSortValue, sortProductIds, type FltSortKey } from './sort'

const keys: Record<string, FltSortKey> = {
  a: { name: '800mm Bench Desk', price: 320, created: 300 },
  b: { name: '1200mm Bench Desk', price: 210, created: 100 },
  c: { name: 'acoustic Screen', price: null, created: 200 },
  d: { name: 'Zephyr Pod', price: 210, created: 400 },
}
const server = ['a', 'b', 'c', 'd']

describe('sortProductIds', () => {
  it('leaves the server order alone when nothing is chosen', () => {
    expect(sortProductIds(server, keys, '')).toEqual(server)
  })

  it('does not mutate the order it was given', () => {
    const input = [...server]
    sortProductIds(input, keys, 'price-asc')
    expect(input).toEqual(server)
  })

  it('sorts by price, ties keeping the server order', () => {
    expect(sortProductIds(server, keys, 'price-asc')).toEqual(['b', 'd', 'a', 'c'])
  })

  it('puts priceless products last in both directions', () => {
    expect(sortProductIds(server, keys, 'price-asc').at(-1)).toBe('c')
    expect(sortProductIds(server, keys, 'price-desc').at(-1)).toBe('c')
  })

  it('sorts names case-insensitively and numerically', () => {
    expect(sortProductIds(server, keys, 'name-asc')).toEqual(['a', 'b', 'c', 'd'])
    expect(sortProductIds(server, keys, 'name-desc')).toEqual(['d', 'c', 'b', 'a'])
  })

  it('sorts by age both ways', () => {
    expect(sortProductIds(server, keys, 'newest')).toEqual(['d', 'a', 'c', 'b'])
    expect(sortProductIds(server, keys, 'oldest')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('survives a product with no sort key at all', () => {
    expect(sortProductIds([...server, 'gone'], keys, 'name-asc')).toEqual(['gone', 'a', 'b', 'c', 'd'])
    expect(sortProductIds([...server, 'gone'], keys, 'price-asc')).toEqual(['b', 'd', 'a', 'c', 'gone'])
  })
})

describe('isFltSortValue', () => {
  it('accepts the offered values, including the empty default', () => {
    expect(isFltSortValue('')).toBe(true)
    expect(isFltSortValue('price-desc')).toBe(true)
  })

  it('rejects anything else, so a hand-typed query string cannot pick a sort', () => {
    expect(isFltSortValue('stock-asc')).toBe(false)
    expect(isFltSortValue('drop table')).toBe(false)
  })
})
