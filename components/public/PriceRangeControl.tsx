'use client'

import { useEffect, useRef, useState } from 'react'
import { normaliseRange, type FltPriceRange, type FltSliderScale } from '@/modules/filters-for-shop/lib/price-range'

// The price group's control when the owner has picked "Range slider": two
// handles on one track, and a min and a max box underneath for anyone who would
// rather type a figure than drag one.
//
// Two native range inputs stacked on one track rather than a hand-built widget:
// each is keyboard-operable, announced with its own label and value by a screen
// reader, and works on touch with no extra code. Only their thumbs take the
// pointer (see filter-css.ts), so either handle can be grabbed wherever it sits.
//
// The handles move a local draft at full speed and the grid follows a moment
// after the hand stops, so dragging never stutters while hundreds of cards are
// shown and hidden underneath it. The boxes commit on Enter or on leaving them.

type Props = {
  groupName: string
  scale: FltSliderScale
  value: FltPriceRange
  currencySymbol: string
  onChange: (next: FltPriceRange) => void
}

const SETTLE_MS = 180

export function PriceRangeControl({ groupName, scale, value, currencySymbol, onChange }: Props) {
  const lowOf = (range: FltPriceRange) => Math.min(scale.hi, Math.max(scale.lo, range.min ?? scale.lo))
  const highOf = (range: FltPriceRange) => Math.max(scale.lo, Math.min(scale.hi, range.max ?? scale.hi))

  // The handles' draft, re-seeded whenever the committed value changes from
  // outside (a chip removed, Clear all, the back button).
  const [low, setLow] = useState(() => lowOf(value))
  const [high, setHigh] = useState(() => highOf(value))
  const [seen, setSeen] = useState(value)
  if (seen.min !== value.min || seen.max !== value.max) {
    setSeen(value)
    setLow(lowOf(value))
    setHigh(highOf(value))
  }
  const [lowText, setLowText] = useState(String(low))
  const [highText, setHighText] = useState(String(high))
  const [textSeen, setTextSeen] = useState(`${low}|${high}`)
  if (textSeen !== `${low}|${high}`) {
    setTextSeen(`${low}|${high}`)
    setLowText(String(low))
    setHighText(String(high))
  }

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const commit = (nextLow: number, nextHigh: number, settle: boolean) => {
    const next = normaliseRange({ min: nextLow, max: nextHigh }, scale)
    if (timer.current) clearTimeout(timer.current)
    if (!settle) {
      onChange(next)
      return
    }
    timer.current = setTimeout(() => onChange(next), SETTLE_MS)
  }

  const dragLow = (raw: number) => {
    const nextLow = Math.min(raw, high)
    setLow(nextLow)
    commit(nextLow, high, true)
  }
  const dragHigh = (raw: number) => {
    const nextHigh = Math.max(raw, low)
    setHigh(nextHigh)
    commit(low, nextHigh, true)
  }

  // A typed figure is clamped to the track and kept on its own side of the
  // other end; anything unreadable puts the box back to where the handle is.
  const typed = (which: 'low' | 'high') => {
    const text = which === 'low' ? lowText : highText
    const figure = Number(text.replace(/[^\d.]/g, ''))
    if (text.trim() === '' || !Number.isFinite(figure)) {
      setLowText(String(low))
      setHighText(String(high))
      return
    }
    const clamped = Math.min(scale.hi, Math.max(scale.lo, figure))
    if (which === 'low') {
      const nextLow = Math.min(clamped, high)
      setLow(nextLow)
      setLowText(String(nextLow))
      commit(nextLow, high, false)
    } else {
      const nextHigh = Math.max(clamped, low)
      setHigh(nextHigh)
      setHighText(String(nextHigh))
      commit(low, nextHigh, false)
    }
  }

  const span = scale.hi - scale.lo || 1
  const fillLeft = ((low - scale.lo) / span) * 100
  const fillRight = 100 - ((high - scale.lo) / span) * 100

  return (
    <div className="flt-range">
      <div className="flt-range-track">
        <span className="flt-range-rail" aria-hidden />
        <span className="flt-range-fill" style={{ left: `${fillLeft}%`, right: `${fillRight}%` }} aria-hidden />
        <input
          type="range"
          className="flt-range-input"
          min={scale.lo}
          max={scale.hi}
          step={scale.step}
          value={low}
          onChange={(e) => dragLow(Number(e.target.value))}
          aria-label={`${groupName}: minimum`}
          aria-valuetext={`${currencySymbol}${low}`}
          // The low thumb sits above the high one once both are pushed to the
          // top, or it could never be dragged back down off the end.
          style={low >= scale.hi - scale.step ? { zIndex: 3 } : undefined}
        />
        <input
          type="range"
          className="flt-range-input"
          min={scale.lo}
          max={scale.hi}
          step={scale.step}
          value={high}
          onChange={(e) => dragHigh(Number(e.target.value))}
          aria-label={`${groupName}: maximum`}
          aria-valuetext={`${currencySymbol}${high}`}
        />
      </div>
      <div className="flt-range-boxes">
        <label className="flt-range-box">
          <span className="flt-range-box-label">Min</span>
          <span className="flt-range-box-field">
            <span className="flt-range-cur" aria-hidden>{currencySymbol}</span>
            <input
              type="text"
              inputMode="decimal"
              value={lowText}
              onChange={(e) => setLowText(e.target.value)}
              onBlur={() => typed('low')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); typed('low') } }}
              aria-label={`${groupName}: type a minimum`}
            />
          </span>
        </label>
        <span className="flt-range-to" aria-hidden>to</span>
        <label className="flt-range-box">
          <span className="flt-range-box-label">Max</span>
          <span className="flt-range-box-field">
            <span className="flt-range-cur" aria-hidden>{currencySymbol}</span>
            <input
              type="text"
              inputMode="decimal"
              value={highText}
              onChange={(e) => setHighText(e.target.value)}
              onBlur={() => typed('high')}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); typed('high') } }}
              aria-label={`${groupName}: type a maximum`}
            />
          </span>
        </label>
      </div>
    </div>
  )
}
