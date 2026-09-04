import { describe, expect, it } from 'vitest'
import { packSwaps, unpackSwaps } from './swap-pack'
import type { FltSwap } from '@/modules/filters-for-shop/lib/db/matching'

// A swap that comes back wrong is not a visible bug: the card still draws, it
// just borrows the wrong photo or opens the product page on the wrong option. So
// the round trip is asserted rather than trusted.
const make = (rows: Array<[string, Array<[string, FltSwap]>]>) =>
  new Map(rows.map(([productId, entries]) => [productId, new Map(entries)]))

const roundTrip = (input: Map<string, Map<string, FltSwap>>) => unpackSwaps(packSwaps(input))

const swap = (image: string | null, param: string | null, sourceId: string): FltSwap => ({ image, param, sourceId })

describe('swap packing', () => {
  it('returns every swap unchanged', () => {
    const input = make([
      ['prod-1', [
        ['flt-red', swap('https://cdn/media/shop/sofa/red.webp', 'colour=red', 'var-1')],
        ['flt-blue', swap('https://cdn/media/shop/sofa/blue.webp', 'colour=blue', 'var-2')],
      ]],
      ['prod-2', [
        ['flt-red', swap('https://cdn/media/shop/chair/red.webp', 'colour=red', 'var-3')],
      ]],
    ])
    const out = roundTrip(input)
    expect(out.get('prod-1')?.get('flt-red')).toEqual(swap('https://cdn/media/shop/sofa/red.webp', 'colour=red', 'var-1'))
    expect(out.get('prod-1')?.get('flt-blue')).toEqual(swap('https://cdn/media/shop/sofa/blue.webp', 'colour=blue', 'var-2'))
    expect(out.get('prod-2')?.get('flt-red')).toEqual(swap('https://cdn/media/shop/chair/red.webp', 'colour=red', 'var-3'))
  })

  it('keeps a swap with no photo as no photo', () => {
    const out = roundTrip(make([['p', [['f', swap(null, 'colour=red', 'v')]]]]))
    expect(out.get('p')?.get('f')).toEqual(swap(null, 'colour=red', 'v'))
  })

  it('keeps a swap with no option parameter as no parameter', () => {
    // A filter that resolves no single option value - a price band, a spec on
    // the listing. Its tick dresses the card and names nothing on the link.
    const out = roundTrip(make([['p', [['f', swap('https://cdn/a/1.webp', null, 'v')]]]]))
    expect(out.get('p')?.get('f')).toEqual(swap('https://cdn/a/1.webp', null, 'v'))
  })

  it('names each filter id, image folder and parameter once across the grid', () => {
    const packed = packSwaps(make([
      ['p1', [['flt-red', swap('https://cdn/a/1.webp', 'colour=red', 'v1')]]],
      ['p2', [['flt-red', swap('https://cdn/a/2.webp', 'colour=red', 'v2')]]],
      ['p3', [['flt-red', swap('https://cdn/a/3.webp', 'colour=red', 'v3')]]],
    ]))
    expect(packed.g).toEqual(['flt-red'])
    expect(packed.f).toEqual(['https://cdn/a/'])
    expect(packed.q).toEqual(['colour=red'])
  })

  it('holds two parameters that share nothing', () => {
    const out = roundTrip(make([['p', [
      ['f1', swap(null, 'colour=red', 'v1')],
      ['f2', swap(null, 'finish=oak', 'v2')],
    ]]]))
    expect(out.get('p')?.get('f1')?.param).toBe('colour=red')
    expect(out.get('p')?.get('f2')?.param).toBe('finish=oak')
  })

  it('holds an image url with no slash in it', () => {
    const out = roundTrip(make([['p', [['f', swap('photo.webp', 'colour=red', 'v')]]]]))
    expect(out.get('p')?.get('f')?.image).toBe('photo.webp')
  })

  it('holds an empty grid', () => {
    expect(roundTrip(new Map())).toEqual(new Map())
  })
})
