// Turning a lead-time filter's working-day count into the date a shopper would
// actually get it: "within 6 working days" -> "By Friday" / "By Friday the
// 27th" / "By Tuesday the 7th of Dec", depending on how far off it is.
//
// Pure and DOM-free so it runs in the browser (where it has to, see
// lib/delivery.ts) and in tests alike. The arithmetic matches Advanced
// Shipping's date engine: an order before the cut-off on a working day clears
// that day, otherwise the next working day; the lead is then counted in working
// days from there, off a list that already has bank holidays and the shop's
// closures taken out.

export type FltDeliveryCalendar = {
  timezone: string
  /** "HH:MM" wall-clock in `timezone`. */
  cutoffTime: string
  /** Upcoming working days, ascending, "YYYY-MM-DD". */
  workingDays: string[]
}

/** The date and wall-clock time of an instant in a zone. */
function wallClock(now: Date, timezone: string): { day: string; time: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? ''
  return { day: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` }
}

/** The day an order placed `now` would arrive with a `leadDays` working-day
 *  lead, or null where the calendar does not reach that far (a page served from
 *  a cache long past its list). */
export function leadDate(calendar: FltDeliveryCalendar, leadDays: number, now: Date): string | null {
  const { day: today, time } = wallClock(now, calendar.timezone)
  const days = calendar.workingDays
  // The first working day on or after today; today only counts while its
  // cut-off has not passed.
  let base = days.findIndex((d) => d >= today)
  if (base < 0) return null
  if (days[base] === today && time >= calendar.cutoffTime) base += 1
  return days[base + Math.max(0, Math.floor(leadDays))] ?? null
}

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
// Short month names: a tick label has little room, and the weekday and day
// already carry the date. Chris's call for these labels.
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function ordinal(n: number): string {
  const tens = n % 100
  if (tens >= 11 && tens <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

// Calendar days from one "YYYY-MM-DD" to another.
function daysBetween(from: string, to: string): number {
  const at = (day: string) => {
    const [y, m, d] = day.split('-').map(Number)
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1)
  }
  return Math.round((at(to) - at(from)) / 86_400_000)
}

/** The date, only as long as it needs to be:
 *  - within the next six days, the weekday alone: "Friday" (it can only mean
 *    one day, and a shopper reads it at a glance);
 *  - later this month, the weekday and the day: "Friday the 27th";
 *  - in another month, the lot: "Tuesday the 7th of Dec", plus the year
 *    when it is not this one ("Monday the 4th of Jan 2027"). */
export function formatLeadDate(day: string, today: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1))
  const weekday = WEEKDAYS[date.getUTCDay()] ?? ''
  const ahead = daysBetween(today, day)
  if (ahead <= 0) return 'today'
  if (ahead <= 6) return weekday
  if (day.slice(0, 7) === today.slice(0, 7)) return `${weekday} the ${ordinal(d ?? 1)}`
  const words = `${weekday} the ${ordinal(d ?? 1)} of ${MONTHS[(m ?? 1) - 1]}`
  return day.slice(0, 4) === today.slice(0, 4) ? words : `${words} ${y}`
}

/** The label a lead-time filter shows: "By Friday", "By Friday the 27th",
 *  "By Tuesday the 7th of Dec" (see formatLeadDate), or
 *  null to keep its own label. */
export function leadDateLabel(calendar: FltDeliveryCalendar | null | undefined, leadDays: number | undefined, now: Date): string | null {
  if (!calendar || leadDays === undefined) return null
  const day = leadDate(calendar, leadDays, now)
  if (!day) return null
  return `By ${formatLeadDate(day, wallClock(now, calendar.timezone).day)}`
}
