import { describe, expect, it } from 'vitest'
import { FLT_SHELF_CEILING, mergeShelfPages, planShelfPages } from '@/modules/filters-for-shop/lib/shelf-plan'

// The sums behind reading a shelf 500 rows at a time. Wrong, they drop products
// silently - the grid simply holds fewer than the scope does - which is the
// failure the shelf reader was written to end.

const products = (from: number, count: number) => Array.from({ length: count }, (_, i) => ({ id: `p${from + i}` }))

describe('planShelfPages', () => {
  it('asks for nothing more when the first page holds the whole shelf', () => {
    expect(planShelfPages(FLT_SHELF_CEILING, 434, 500)).toEqual({ reach: 434, pages: [] })
  })

  it('asks for every further page a shelf past 500 needs', () => {
    expect(planShelfPages(FLT_SHELF_CEILING, 1234, 500)).toEqual({ reach: 1234, pages: [2, 3] })
  })

  it('stops at the page holding the last product, not the one after', () => {
    expect(planShelfPages(FLT_SHELF_CEILING, 1000, 500).pages).toEqual([2])
    expect(planShelfPages(FLT_SHELF_CEILING, 1001, 500).pages).toEqual([2, 3])
  })

  it('holds the shelf to the ceiling however big the scope is', () => {
    const plan = planShelfPages(FLT_SHELF_CEILING, 23038, 500)
    expect(plan.reach).toBe(FLT_SHELF_CEILING)
    expect(plan.pages.at(-1)).toBe(FLT_SHELF_CEILING / 500)
  })

  it('reads an unpaged grid of `limit` in one page', () => {
    expect(planShelfPages(100, 434, 100)).toEqual({ reach: 100, pages: [] })
  })

  it('treats an empty scope and nonsense input as nothing to read', () => {
    expect(planShelfPages(FLT_SHELF_CEILING, 0, 500)).toEqual({ reach: 0, pages: [] })
    expect(planShelfPages(Number.NaN, 900, 500)).toEqual({ reach: 0, pages: [] })
    // A page size of nothing reads as one a page rather than dividing by zero.
    expect(planShelfPages(FLT_SHELF_CEILING, 3, 0)).toEqual({ reach: 3, pages: [2, 3] })
  })
})

describe('mergeShelfPages', () => {
  it('puts the pages back together in page order with nothing missing', () => {
    const shelf = mergeShelfPages([products(0, 500), products(500, 500), products(1000, 234)], 1234)
    expect(shelf).toHaveLength(1234)
    expect(shelf[0]?.id).toBe('p0')
    expect(shelf[500]?.id).toBe('p500')
    expect(shelf.at(-1)?.id).toBe('p1233')
  })

  it('drops the product a page boundary repeats, keeping the first sighting', () => {
    // A product added between two reads pushes page two along by one, so the
    // last product of page one is read again as the first of page two.
    const shelf = mergeShelfPages([products(0, 3), products(2, 3)], 10)
    expect(shelf.map((p) => p.id)).toEqual(['p0', 'p1', 'p2', 'p3', 'p4'])
  })

  it('cuts the shelf to its reach', () => {
    expect(mergeShelfPages([products(0, 500), products(500, 500)], 600)).toHaveLength(600)
    expect(mergeShelfPages([products(0, 5)], 0)).toEqual([])
  })
})
