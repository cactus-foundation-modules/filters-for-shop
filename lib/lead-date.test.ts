import { describe, expect, it } from 'vitest'
import { formatLeadDate, leadDate, leadDateLabel, type FltDeliveryCalendar } from '@/modules/filters-for-shop/lib/lead-date'

// Wed 25 Nov 2026 onward, weekends out, Christmas and Boxing Day (bank holiday
// on Mon 28 Dec) out, as Advanced Shipping would hand it over.
const calendar: FltDeliveryCalendar = {
  timezone: 'Europe/London',
  cutoffTime: '12:00',
  workingDays: [
    '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-30', '2026-12-01', '2026-12-02', '2026-12-03', '2026-12-04',
    '2026-12-07', '2026-12-08', '2026-12-21', '2026-12-22', '2026-12-23', '2026-12-24', '2026-12-29', '2026-12-30',
  ],
}

describe('lead date', () => {
  it('clears today before the cut-off and tomorrow after it', () => {
    expect(leadDate(calendar, 3, new Date('2026-11-25T11:59:00Z'))).toBe('2026-11-30')
    expect(leadDate(calendar, 3, new Date('2026-11-25T12:00:00Z'))).toBe('2026-12-01')
  })

  it('rolls a weekend order to Monday', () => {
    expect(leadDate(calendar, 1, new Date('2026-11-28T10:00:00Z'))).toBe('2026-12-01')
  })

  it('skips the holidays the calendar leaves out', () => {
    expect(leadDate(calendar, 2, new Date('2026-12-23T09:00:00Z'))).toBe('2026-12-29')
  })

  it('gives up past the end of the list', () => {
    expect(leadDate(calendar, 40, new Date('2026-11-25T09:00:00Z'))).toBeNull()
  })

  it('says only as much of the date as it needs to', () => {
    // Within six days: the weekday alone, even across a month end.
    expect(formatLeadDate('2026-11-27', '2026-11-25')).toBe('Friday')
    expect(formatLeadDate('2026-12-01', '2026-11-25')).toBe('Tuesday')
    // Later the same month: weekday and day.
    expect(formatLeadDate('2026-12-11', '2026-12-01')).toBe('Friday the 11th')
    expect(formatLeadDate('2026-12-22', '2026-12-01')).toBe('Tuesday the 22nd')
    // Another month: the lot, with the year only when it changes.
    expect(formatLeadDate('2026-12-07', '2026-11-25')).toBe('Monday the 7th of Dec')
    expect(formatLeadDate('2026-12-13', '2026-11-25')).toBe('Sunday the 13th of Dec')
    expect(formatLeadDate('2027-01-04', '2026-12-23')).toBe('Monday the 4th of Jan 2027')
    expect(formatLeadDate('2026-11-25', '2026-11-25')).toBe('today')
  })

  it('labels a lead-time filter, or leaves it alone', () => {
    expect(leadDateLabel(calendar, 3, new Date('2026-11-25T09:00:00Z'))).toBe('By Monday')
    expect(leadDateLabel(null, 3, new Date())).toBeNull()
    expect(leadDateLabel(calendar, undefined, new Date())).toBeNull()
  })
})
