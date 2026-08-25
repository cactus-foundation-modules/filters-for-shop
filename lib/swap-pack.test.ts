import { describe, expect, it } from 'vitest'
import { packSwaps, unpackSwaps } from './swap-pack'
import type { FltSwap } from '@/modules/filters-for-shop/lib/db/matching'

// A swap that comes back wrong is not a visible bug: the card still draws, it
// just borrows the wrong photo or links to the wrong variation. So the round
// trip is asserted rather than trusted.
const make = (rows: Array<[string, Array<[string, FltSwap]>]>) =>
  new Map(rows.map(([productId, entries]) => [productId, new Map(entries)]))

const roundTrip = (input: Map<string, Map<string, FltSwap>>) => unpackSwaps(packSwaps(input))

const swap = (image: string | null, href: string, sourceId: string): FltSwap => ({ image, href, sourceId })

describe('swap packing', () => {
  it('returns every swap unchanged', () => {
    const input = make([
      ['prod-1', [
        ['flt-red', swap('https://cdn/media/shop/sofa/red.webp', '/office-sofa-2-seater-red', 'var-1')],
        ['flt-blue', swap('https://cdn/media/shop/sofa/blue.webp', '/office-sofa-2-seater-blue', 'var-2')],
      ]],
      ['prod-2', [
        ['flt-red', swap('https://cdn/media/shop/chair/red.webp', '/task-chair-red', 'var-3')],
      ]],
    ])
    const out = roundTrip(input)
    expect(out.get('prod-1')?.get('flt-red')).toEqual(swap('https://cdn/media/shop/sofa/red.webp', '/office-sofa-2-seater-red', 'var-1'))
    expect(out.get('prod-1')?.get('flt-blue')).toEqual(swap('https://cdn/media/shop/sofa/blue.webp', '/office-sofa-2-seater-blue', 'var-2'))
    expect(out.get('prod-2')?.get('flt-red')).toEqual(swap('https://cdn/media/shop/chair/red.webp', '/task-chair-red', 'var-3'))
  })

  it('keeps a swap with no photo as no photo', () => {
    const out = roundTrip(make([['p', [['f', swap(null, '/chair-red', 'v')]]]]))
    expect(out.get('p')?.get('f')).toEqual(swap(null, '/chair-red', 'v'))
  })

  it('names each filter id and image folder once across the grid', () => {
    const packed = packSwaps(make([
      ['p1', [['flt-red', swap('https://cdn/a/1.webp', '/one-red', 'v1')]]],
      ['p2', [['flt-red', swap('https://cdn/a/2.webp', '/two-red', 'v2')]]],
      ['p3', [['flt-red', swap('https://cdn/a/3.webp', '/three-red', 'v3')]]],
    ]))
    expect(packed.g).toEqual(['flt-red'])
    expect(packed.f).toEqual(['https://cdn/a/'])
  })

  it('holds hrefs that share nothing', () => {
    const out = roundTrip(make([['p', [
      ['f1', swap(null, '/aaa', 'v1')],
      ['f2', swap(null, '/bbb', 'v2')],
    ]]]))
    expect(out.get('p')?.get('f1')?.href).toBe('/aaa')
    expect(out.get('p')?.get('f2')?.href).toBe('/bbb')
  })

  it('holds a single swap, whose href is entirely its own prefix', () => {
    const out = roundTrip(make([['p', [['f', swap(null, '/only-one', 'v')]]]]))
    expect(out.get('p')?.get('f')?.href).toBe('/only-one')
  })

  it('holds an image url with no slash in it', () => {
    const out = roundTrip(make([['p', [['f', swap('photo.webp', '/x', 'v')]]]]))
    expect(out.get('p')?.get('f')?.image).toBe('photo.webp')
  })

  it('holds an empty grid', () => {
    expect(roundTrip(new Map())).toEqual(new Map())
  })
})
