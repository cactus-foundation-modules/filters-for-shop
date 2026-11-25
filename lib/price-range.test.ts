import { describe, expect, it } from 'vitest'
import { describeRange, formatRangeParam, niceStep, normaliseRange, parseRangeParam, priceInRange, sliderScale } from '@/modules/filters-for-shop/lib/price-range'

describe('price range', () => {
  it('picks a round step for the span', () => {
    expect(niceStep(900)).toBe(10)
    expect(niceStep(1700)).toBe(20)
    expect(niceStep(40)).toBe(1)
    expect(niceStep(0)).toBe(1)
  })

  it('bounds the slider around every price on the shelf', () => {
    expect(sliderScale([111, 193, 371, 945])).toEqual({ lo: 110, hi: 950, step: 10 })
    expect(sliderScale([null, 50])).toBeNull()
    expect(sliderScale([])).toBeNull()
  })

  it('keeps both ends inclusive and drops priceless products only when a range is on', () => {
    const range = { min: 100, max: 500 }
    expect(priceInRange(100, range)).toBe(true)
    expect(priceInRange(500, range)).toBe(true)
    expect(priceInRange(500.01, range)).toBe(false)
    expect(priceInRange(null, range)).toBe(false)
    expect(priceInRange(null, { min: null, max: null })).toBe(true)
  })

  it('drops an end resting on the slider edge and orders the ends', () => {
    const scale = { lo: 100, hi: 1000, step: 10 }
    expect(normaliseRange({ min: 100, max: 1000 }, scale)).toEqual({ min: null, max: null })
    expect(normaliseRange({ min: 600, max: 200 }, scale)).toEqual({ min: 200, max: 600 })
  })

  it('reads and writes the query string', () => {
    expect(parseRangeParam('100-500')).toEqual({ min: 100, max: 500 })
    expect(parseRangeParam('-500')).toEqual({ min: null, max: 500 })
    expect(parseRangeParam('100-')).toEqual({ min: 100, max: null })
    expect(parseRangeParam('-')).toBeNull()
    expect(parseRangeParam('cheap')).toBeNull()
    expect(parseRangeParam(null)).toBeNull()
    expect(formatRangeParam({ min: 100, max: null })).toBe('100-')
  })

  it('words the chip', () => {
    expect(describeRange({ min: 100, max: 500 }, '£')).toBe('£100 - £500')
    expect(describeRange({ min: null, max: 1500 }, '£')).toBe('Up to £1,500')
    expect(describeRange({ min: 250, max: null }, '£')).toBe('£250 and over')
  })
})
