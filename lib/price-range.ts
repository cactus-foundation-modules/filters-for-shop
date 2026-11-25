// The price slider's pure half: its bounds, its step, how a chosen range reads
// and writes the query string, and whether a price falls inside it. Out of
// FilterShell.tsx so the arithmetic can be tested without a DOM.
//
// A range is two optional ends. Null on either end means "no limit that way",
// which is also what an end dragged all the way to the slider's edge means - so
// a shopper who drags the top handle back to the top has asked for nothing, and
// the URL says nothing about it.

export type FltPriceRange = { min: number | null; max: number | null }

export const NO_PRICE_RANGE: FltPriceRange = { min: null, max: null }

export type FltSliderScale = { lo: number; hi: number; step: number }

export function isRangeActive(range: FltPriceRange): boolean {
  return range.min !== null || range.max !== null
}

/** A round step for a span: about a hundred stops end to end, landing on 1, 2,
 *  5, 10, 20, 50... so the boxes show figures a person would type. */
export function niceStep(span: number): number {
  if (!Number.isFinite(span) || span <= 0) return 1
  const raw = span / 100
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  for (const factor of [1, 2, 5, 10]) {
    if (raw <= factor * magnitude) return Math.max(1, factor * magnitude)
  }
  return Math.max(1, 10 * magnitude)
}

/** The slider's ends and step for the prices on the shelf: the cheapest rounded
 *  down and the dearest rounded up to the step, so every product sits inside the
 *  track. Null where there is nothing to slide between - no prices at all, or
 *  every product at the same one. */
export function sliderScale(prices: Iterable<number | null>): FltSliderScale | null {
  let lo = Infinity
  let hi = -Infinity
  for (const price of prices) {
    if (price === null || !Number.isFinite(price)) continue
    if (price < lo) lo = price
    if (price > hi) hi = price
  }
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi - lo < 1) return null
  const step = niceStep(hi - lo)
  return { lo: Math.floor(lo / step) * step, hi: Math.ceil(hi / step) * step, step }
}

/** Does a price fall inside the range? Both ends inclusive: the top handle at
 *  £500 must keep the £500 desk. A product with no price never matches an
 *  active range - there is nothing to compare - and always matches no range. */
export function priceInRange(price: number | null | undefined, range: FltPriceRange): boolean {
  if (!isRangeActive(range)) return true
  if (price === null || price === undefined || !Number.isFinite(price)) return false
  if (range.min !== null && price < range.min) return false
  if (range.max !== null && price > range.max) return false
  return true
}

/** A range clamped to the scale, with an end sitting on the slider's edge (or
 *  beyond it) dropped to null, and the two ends kept in order. */
export function normaliseRange(range: FltPriceRange, scale: FltSliderScale | null): FltPriceRange {
  let { min, max } = range
  if (min !== null && max !== null && min > max) [min, max] = [max, min]
  if (scale) {
    if (min !== null && min <= scale.lo) min = null
    if (max !== null && max >= scale.hi) max = null
  }
  if (min !== null && min < 0) min = null
  return { min, max }
}

/** `?price=100-500`, `?price=100-`, `?price=-500`. Null where the parameter
 *  names no usable range. */
export function parseRangeParam(raw: string | null): FltPriceRange | null {
  if (raw === null) return null
  const match = /^\s*(\d+(?:\.\d+)?)?\s*-\s*(\d+(?:\.\d+)?)?\s*$/.exec(raw)
  if (!match) return null
  const min = match[1] !== undefined ? Number(match[1]) : null
  const max = match[2] !== undefined ? Number(match[2]) : null
  if (min === null && max === null) return null
  return { min, max }
}

export function formatRangeParam(range: FltPriceRange): string {
  return `${range.min ?? ''}-${range.max ?? ''}`
}

export function sameRange(a: FltPriceRange, b: FltPriceRange): boolean {
  return a.min === b.min && a.max === b.max
}

/** The range a filter page's starting band stands for. A band's top is
 *  exclusive (lib/types.ts priceInBand) and the slider's is inclusive, a penny
 *  apart; the slider shows the band's own figure, which is what its label says. */
export function rangeFromBand(band: [number | null, number | null] | undefined): FltPriceRange {
  if (!band) return NO_PRICE_RANGE
  return { min: band[0], max: band[1] }
}

/** "£100 - £500", "£100 and over", "Up to £500" - the chip's words. */
export function describeRange(range: FltPriceRange, symbol: string): string {
  const money = (n: number) => `${symbol}${n.toLocaleString('en-GB', { maximumFractionDigits: 2 })}`
  if (range.min !== null && range.max !== null) return `${money(range.min)} - ${money(range.max)}`
  if (range.min !== null) return `${money(range.min)} and over`
  if (range.max !== null) return `Up to ${money(range.max)}`
  return 'Any price'
}
