import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/db/prisma', () => ({ prisma: { $queryRaw: vi.fn(async () => []) } }))
vi.mock('@prisma/client', () => ({
  Prisma: { sql: () => ({}), join: () => ({}), empty: {} },
}))
vi.mock('@/modules/filters-for-shop/lib/variations-probe', () => ({ hasVariationsTables: async () => true }))
vi.mock('@/modules/filters-for-shop/lib/attributes-probe', () => ({ hasAttributeTables: async () => false }))

import { filterMatchCacheSize, getProductFilterMatches, invalidateFilterMatchCache } from '@/modules/filters-for-shop/lib/db/matching'
import { prisma } from '@/lib/db/prisma'
import type { FltGroup } from '@/modules/filters-for-shop/lib/types'

const groups = [{ filters: [{ id: 'f1', rules: [{ source: 'OPTION', optionName: 'Colour', valueLabel: 'Red' }] }] }] as unknown as FltGroup[]

describe('filter match cache', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    invalidateFilterMatchCache()
    vi.mocked(prisma.$queryRaw).mockClear()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('serves a repeat from memory inside the minute', async () => {
    await getProductFilterMatches(['a'], groups)
    await getProductFilterMatches(['a'], groups)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
  })

  it('drops every expired answer on the next miss rather than holding it until the limit', async () => {
    for (const id of ['a', 'b', 'c']) await getProductFilterMatches([id], groups)
    expect(filterMatchCacheSize()).toBe(3)
    vi.advanceTimersByTime(60_000)
    await getProductFilterMatches(['d'], groups)
    expect(filterMatchCacheSize()).toBe(1)
  })

  it('keeps answers still inside the minute', async () => {
    await getProductFilterMatches(['a'], groups)
    vi.advanceTimersByTime(30_000)
    await getProductFilterMatches(['b'], groups)
    vi.advanceTimersByTime(30_000)
    await getProductFilterMatches(['c'], groups)
    expect(filterMatchCacheSize()).toBe(2)
  })

  it('asks again once an answer has expired', async () => {
    await getProductFilterMatches(['a'], groups)
    vi.advanceTimersByTime(60_000)
    await getProductFilterMatches(['a'], groups)
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(2)
    expect(filterMatchCacheSize()).toBe(1)
  })
})
