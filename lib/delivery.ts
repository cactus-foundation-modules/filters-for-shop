import { prisma } from '@/lib/db/prisma'
import { hasVariationsTables } from '@/modules/filters-for-shop/lib/variations-probe'
import type { FltDeliveryCalendar } from '@/modules/filters-for-shop/lib/lead-date'

// Delivery facts for DELIVERY rules: which services each listing can be bought
// with, and how many working days each of them takes.
//
// Read from whichever module publishes `shop.product-delivery-timing` -
// Advanced Shipping today - through core's generated extension-point registry,
// never by importing that module. It is an optional companion: a shop without
// one simply has no delivery facts, and its delivery filters match nothing (and
// so are culled from the panel like any other empty filter).
//
// Two answers. A listing with variations is never the thing bought, so its own
// row often resolves to no service at all; its enabled variations' child
// products are asked too. Their answers are rolled up onto the listing (it
// "offers Installation" when any variation does, and its lead time is the
// quickest any of them manages) AND kept per child product, so a variation's
// own delivery can sit in its combination beside its colour - see
// applyDeliveryRules in lib/grid-build.ts.
//
// The provider is asked for the WHOLE catalogue once and the answer held for
// ten minutes, rather than once per shelf. The counts it returns move only when
// the shop's delivery settings do (it is deliberately date-free - see the
// provider), every grid on the site wants the same answer, and one batched call
// over the catalogue costs about what one over a single big category does.
// On the live catalogue that is ~450 listings and ~23,000 variation children,
// a few seconds of resolver work - so an expired answer is served while the
// fresh one is fetched behind it, and only the very first request waits.

const POINT = 'shop.product-delivery-timing'
const TTL_MS = 10 * 60_000

/** The whole catalogue's answer: rolled up per listing (what a listing offers
 *  across all its variations), and per product asked (each variation's own
 *  child product, for the per-variation check - see lib/grid-build.ts). */
export type FltDeliveryCatalogue = {
  listings: Map<string, FltDeliveryFacts>
  products: Map<string, FltDeliveryFacts>
}

export type FltDeliveryFacts = {
  /** Every service label the listing (or any of its variations) is offered. */
  services: Set<string>
  /** Working days from order to doorstep, per service offered, quickest first. */
  leadDays: number[]
}

type TimingProvider = (productIds: string[]) => Promise<Map<string, unknown>>

async function timingProvider(): Promise<TimingProvider | null> {
  // Dynamic, so the registry (and every module's components behind it) is not
  // pulled into this module's graph at import time - see the delivery seam notes.
  const { modulePublicExtensionPointComponents } = await import('@/lib/modules/extension-points.public')
  const registered: Record<string, unknown> = modulePublicExtensionPointComponents[POINT] ?? {}
  return Object.values(registered).find((entry): entry is TimingProvider => typeof entry === 'function') ?? null
}

// One provider answer, checked rather than trusted: it crosses a registry seam
// with no shared types, so a drifted shape costs that product, not the grid.
function readOptions(value: unknown): { label: string; days: number }[] {
  if (typeof value !== 'object' || value === null) return []
  const options = (value as Record<string, unknown>).options
  if (!Array.isArray(options)) return []
  const out: { label: string; days: number }[] = []
  for (const entry of options) {
    if (typeof entry !== 'object' || entry === null) continue
    const row = entry as Record<string, unknown>
    const label = typeof row.label === 'string' ? row.label.trim() : ''
    const { handlingDays, transitDays } = row
    if (!label || !Number.isInteger(handlingDays) || !Number.isInteger(transitDays)) continue
    if ((handlingDays as number) < 0 || (transitDays as number) < 0) continue
    out.push({ label, days: (handlingDays as number) + (transitDays as number) })
  }
  return out
}

function emptyCatalogue(): FltDeliveryCatalogue {
  return { listings: new Map(), products: new Map() }
}

function addOptions(into: Map<string, FltDeliveryFacts>, id: string, options: { label: string; days: number }[]): void {
  const facts = into.get(id) ?? { services: new Set<string>(), leadDays: [] }
  for (const option of options) {
    facts.services.add(option.label)
    facts.leadDays.push(option.days)
  }
  into.set(id, facts)
}

async function loadCatalogue(): Promise<FltDeliveryCatalogue> {
  const result = emptyCatalogue()
  const out = result.listings
  const provider = await timingProvider()
  if (!provider) return result

  const listings = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "shp_products" WHERE "status" = 'ACTIVE'
  `
  // child product id -> its listing, for the roll-up.
  const listingOf = new Map<string, string>(listings.map((row) => [row.id, row.id]))
  if (await hasVariationsTables()) {
    const children = await prisma.$queryRaw<{ product_id: string; child_product_id: string }[]>`
      SELECT v."product_id", v."child_product_id"
      FROM "svr_variants" v
      JOIN "shp_products" p ON p."id" = v."product_id" AND p."status" = 'ACTIVE'
      WHERE v."enabled" = true AND v."child_product_id" IS NOT NULL
    `
    for (const row of children) listingOf.set(row.child_product_id, row.product_id)
  }
  if (listingOf.size === 0) return result

  const answered = await provider([...listingOf.keys()])
  if (!(answered instanceof Map)) return result
  for (const [productId, value] of answered) {
    const listingId = typeof productId === 'string' ? listingOf.get(productId) : undefined
    if (!listingId) continue
    const options = readOptions(value)
    if (options.length === 0) continue
    addOptions(out, listingId, options)
    addOptions(result.products, productId as string, options)
  }
  for (const map of [result.listings, result.products]) {
    for (const facts of map.values()) facts.leadDays = [...new Set(facts.leadDays)].sort((a, b) => a - b)
  }
  return result
}

let slot: { promise: Promise<FltDeliveryCatalogue>; at: number } | null = null
// The last answer that actually arrived, served while a refresh is in flight.
let lastGood: FltDeliveryCatalogue | null = null

/** Delivery facts for every active listing, keyed by listing id. Listings no
 *  service reaches are absent. Held for ten minutes, then refreshed behind the
 *  previous answer; a failed read clears the memo so the next request tries
 *  again rather than serving the failure. */
export function getDeliveryFacts(): Promise<FltDeliveryCatalogue> {
  const now = Date.now()
  if (slot && now - slot.at < TTL_MS) return slot.promise
  const promise = loadCatalogue()
  const mine = { promise, at: now }
  slot = mine
  promise.then(
    (facts) => { lastGood = facts },
    () => { if (slot === mine) slot = null },
  )
  return lastGood ? Promise.resolve(lastGood) : promise
}

// ---------------------------------------------------------------------------
// The shop's dispatch calendar, for turning a lead-time count into a date.
//
// Read from `shop.delivery-calendar` (Advanced Shipping): the cut-off, the zone
// and a list of upcoming working days with bank holidays and the shop's own
// closures already taken out. The date itself is worked out in the shopper's
// browser off this list (lib/lead-date.ts), so a cached page never shows
// yesterday's promise. Absent provider = no calendar = the panel keeps the
// filter's own "within N working days" label.
// ---------------------------------------------------------------------------

const CALENDAR_POINT = 'shop.delivery-calendar'
const DAY = /^\d{4}-\d{2}-\d{2}$/

function readCalendar(value: unknown): FltDeliveryCalendar | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const timezone = typeof row.timezone === 'string' ? row.timezone : ''
  const cutoffTime = typeof row.cutoffTime === 'string' && /^\d{2}:\d{2}$/.test(row.cutoffTime) ? row.cutoffTime : ''
  const days = Array.isArray(row.workingDays) ? row.workingDays.filter((d): d is string => typeof d === 'string' && DAY.test(d)) : []
  if (!timezone || !cutoffTime || days.length === 0) return null
  try {
    // A zone the runtime does not know would throw in the browser instead.
    new Intl.DateTimeFormat('en-GB', { timeZone: timezone })
  } catch {
    return null
  }
  return { timezone, cutoffTime, workingDays: days }
}

let calendarSlot: { promise: Promise<FltDeliveryCalendar | null>; at: number } | null = null
let lastCalendar: FltDeliveryCalendar | null = null

/** The dispatch calendar, or null where no module publishes one. Held for ten
 *  minutes and refreshed behind the previous answer, like the facts above. */
export function getDeliveryCalendar(): Promise<FltDeliveryCalendar | null> {
  const now = Date.now()
  if (calendarSlot && now - calendarSlot.at < TTL_MS) return calendarSlot.promise
  const promise = (async () => {
    const { modulePublicExtensionPointComponents } = await import('@/lib/modules/extension-points.public')
    const registered: Record<string, unknown> = modulePublicExtensionPointComponents[CALENDAR_POINT] ?? {}
    const provider = Object.values(registered).find((entry): entry is () => Promise<unknown> => typeof entry === 'function')
    return provider ? readCalendar(await provider()) : null
  })()
  const mine = { promise, at: now }
  calendarSlot = mine
  promise.then(
    (calendar) => { lastCalendar = calendar },
    () => { if (calendarSlot === mine) calendarSlot = null },
  )
  return lastCalendar ? Promise.resolve(lastCalendar) : promise
}

/** The calendar a grid hands its panel, and the moment it was handed over -
 *  only where a lead-time filter is on offer. Both undefined otherwise. */
export async function calendarForOffer(offered: { filters: { leadDays?: number }[] }[]): Promise<{ deliveryCalendar?: FltDeliveryCalendar; renderedAt?: number }> {
  if (!offered.some((g) => g.filters.some((f) => f.leadDays !== undefined))) return {}
  const deliveryCalendar = await getDeliveryCalendar()
  return deliveryCalendar ? { deliveryCalendar, renderedAt: Date.now() } : {}
}
