import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { hasVariationsTables } from '@/modules/filters-for-shop/lib/variations-probe'
import { hasAttributeTables } from '@/modules/filters-for-shop/lib/attributes-probe'
import { optionParamFragment } from '@/modules/filters-for-shop/lib/option-param'
import type { FltGroup } from '@/modules/filters-for-shop/lib/types'

// For one filter on one product: which variation stands for it. The image is
// the variant child's own primary photo (every variation is a hidden product
// with its own media over in shop-variations), and the param is the query
// fragment that opens the product page on the option value this filter matched -
// `finish=oak`.
//
// The param, not the variation's own address: linking at the child product sent
// the shopper to the parent page opened on that variation's WHOLE combination,
// so ticking one filter answered every other question on the product page too.
// See lib/option-param.ts. Null where the filter resolves no single option value
// on this product.
export type FltSwap = {
  image: string | null
  param: string | null
  // The representative variation's child product id - the same id shop-variations
  // stamps as `sourceId` on the carousel photo it contributes to the card, so the
  // shell can constrain the card's carousel to the ticked variations' pictures
  // instead of overwriting the <img> behind the carousel's back.
  sourceId: string
}

// One enabled variation's own answer to the filters.
//
// Which variation, rather than which listing, is the whole point: the matrix
// flattens every variation into one list, so a chair sold in red fabric and in
// black leather matches Red and matches Leather and counted as a red leather
// chair. These are what let the shell insist a single variation carries both.
//
// No address rides along any more. A card's click goes to the parent product
// with the ticked options named as parameters (see lib/option-param.ts), which
// is built from the swaps above and needs nothing from here.
export type FltCombo = {
  filterIds: string[]
  // The variation's own child product, set only when a DELIVERY rule exists:
  // delivery is answered per child product (lib/delivery.ts), and this is how
  // a variation's own lead time and services join its combination.
  childId?: string
}

export type FltProductMatches = {
  // product id -> filter ids it matches (via any enabled variant).
  matrix: Map<string, string[]>
  // product id -> one entry per enabled variation, holding the filter ids THAT
  // variation resolves - its own option values, and its child product's specs.
  //
  // The matrix above cannot answer "is there a red leather one?", because it
  // flattens every variation into one list: a chair sold in red fabric and in
  // black leather matches Red and matches Leather, and the two ticks were being
  // checked separately. These are what let the shell insist a single variation
  // carries both. Deduplicated per product, so variations differing only in
  // something nobody filters on collapse into one entry, keeping the earliest
  // variation in the owner's order as the one whose page the combination links
  // to - the same tie-break the per-filter swap above uses.
  combos: Map<string, FltCombo[]>
  // product id -> filter id -> representative variant swap.
  swaps: Map<string, Map<string, FltSwap>>
}

// A fresh set every time, never one shared constant: callers add to what comes
// back (the price bands and the Category group both push onto the matrix), and a
// module-level empty set filled in by one request would hand the next request
// somebody else's products.
const emptyMatches = (): FltProductMatches => ({ matrix: new Map(), combos: new Map(), swaps: new Map() })

// How long one instance keeps an answer. The match depends on nothing about the
// shopper - only on the page's products, the filter rules and the catalogue - so
// every visitor to a shelf was asking Postgres the same question: on Deskwell's
// whole-catalogue shelf, 435 listings and ~105,000 (variation, filter) pairs, two
// seconds of database time per page view, on every Cloudflare miss and every
// Google Ads click (its tracking parameter makes each one a miss).
//
// The rules are part of the key, so editing a filter shows at once. What waits
// out the minute is a catalogue edit - a new option value, a variation switched
// off, a spec changed on a child product - and a minute is well inside what the
// page cache in front of this already holds pages for.
const MATCH_TTL_MS = 60_000
// Bounded: a site with many shelves and many filter pages must not grow this
// without limit. Oldest out first, which a Map's insertion order gives for free.
//
// Expired entries go as well (see dropExpiredMatches). Waiting for the size limit
// alone kept fifty shelves' worth of answers in memory for as long as the process
// ran, every one of them past the point it could ever be served again.
const MATCH_CACHE_MAX = 50

type CachedMatches = { at: number; value: Promise<FltProductMatches> }
const matchCache = new Map<string, CachedMatches>()

function matchKey(productIds: string[], filters: { id: string; rules: { source: string; optionName: string; valueLabel: string }[] }[]): string {
  const h = createHash('sha1')
  for (const id of [...productIds].sort()) h.update(id).update('\0')
  h.update('|')
  for (const f of [...filters].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))) {
    h.update(f.id).update('\0')
    for (const r of f.rules) h.update(r.source).update('\x01').update(r.optionName).update('\x01').update(r.valueLabel).update('\0')
  }
  return h.digest('hex')
}

// Entries are in insertion order, so the moment one is still fresh, so is the rest.
function dropExpiredMatches(now: number): void {
  for (const [key, entry] of matchCache) {
    if (now - entry.at < MATCH_TTL_MS) return
    matchCache.delete(key)
  }
}

/** How many answers are held, for the test that proves they do not linger. */
export function filterMatchCacheSize(): number {
  return matchCache.size
}

// Drops every cached answer on this instance. Other instances age theirs out
// within MATCH_TTL_MS.
export function invalidateFilterMatchCache(): void {
  matchCache.clear()
}

// One pass over the page's products against every configured rule.
//
// OPTION rules: a product matches when any of its enabled variations carries an
// option value whose (option name, label) pair is in the filter's rule set. The
// representative variation - the one whose photo and link the card borrows - is
// the first matching one in the owner's variant order.
//
// ATTRIBUTE rules: a product matches when the (attribute name, value label)
// pair sits on the product itself OR on any of its enabled variations' child
// products (specs are stamped per-variant over there). Attribute matches feed
// the matrix only - no card swap, because a spec like "24 hours" has no
// variation photo to borrow.
//
// Cached per instance (see MATCH_TTL_MS), and a request arriving while the same
// question is already in flight waits on that one rather than asking again - a
// burst of shoppers landing on a cold shelf costs one query, not one each.
export async function getProductFilterMatches(productIds: string[], groups: FltGroup[]): Promise<FltProductMatches> {
  const withRules = groups.flatMap((g) => g.filters.filter((f) => f.rules.length > 0))
  if (productIds.length === 0 || withRules.length === 0) return emptyMatches()

  const key = matchKey(productIds, withRules)
  const now = Date.now()
  const hit = matchCache.get(key)
  if (hit && now - hit.at < MATCH_TTL_MS) return copyMatches(await hit.value)

  dropExpiredMatches(now)
  const value = computeProductFilterMatches(productIds, withRules)
  matchCache.delete(key)
  matchCache.set(key, { at: now, value })
  while (matchCache.size > MATCH_CACHE_MAX) matchCache.delete(matchCache.keys().next().value as string)
  // A failed query must not be served to the next minute's shoppers.
  value.catch(() => {
    if (matchCache.get(key)?.value === value) matchCache.delete(key)
  })
  return copyMatches(await value)
}

// Callers add to what comes back (the price bands and the Category group push
// onto the matrix - see emptyMatches above), so each one gets its own copy of
// the containers. The leaf objects are never written to and are shared.
function copyMatches(m: FltProductMatches): FltProductMatches {
  const matrix = new Map<string, string[]>()
  for (const [k, v] of m.matrix) matrix.set(k, [...v])
  const combos = new Map<string, FltCombo[]>()
  for (const [k, v] of m.combos) combos.set(k, [...v])
  const swaps = new Map<string, Map<string, FltSwap>>()
  for (const [k, v] of m.swaps) swaps.set(k, new Map(v))
  return { matrix, combos, swaps }
}

type RuleFilter = FltGroup['filters'][number]

// The whole answer in ONE statement. It used to be three, and the two expensive
// joins each ran twice: the option join (51k rows on Deskwell) fed both the swap
// query and the combination query, and the variation-spec join (54k) fed both
// the attribute matrix and the combinations. Each is now a MATERIALIZED CTE built
// once and read by every part that needs it - the same rows, a third less
// database time, and one round trip instead of three (each of which PgBouncer's
// transaction mode turns into four).
//
// Rows come back tagged by kind: 'S' a card swap (and its matrix entry), 'M' an
// attribute match for the matrix, 'C' one distinct combination, already in the
// owner's variant order.
async function computeProductFilterMatches(productIds: string[], withRules: RuleFilter[]): Promise<FltProductMatches> {
  const optionFilterIds = withRules.filter((f) => f.rules.some((r) => r.source === 'OPTION')).map((f) => f.id)
  const attributeFilterIds = withRules.filter((f) => f.rules.some((r) => r.source === 'ATTRIBUTE')).map((f) => f.id)

  const variationsPresent = await hasVariationsTables()
  const useOptions = optionFilterIds.length > 0 && variationsPresent
  const useAttributes = attributeFilterIds.length > 0 && (await hasAttributeTables())
  const useChildSpecs = useAttributes && variationsPresent
  if (!useOptions && !useAttributes) return emptyMatches()

  // With a delivery filter about, every variation keeps its own combination
  // rather than folding into the first one with the same answers: two yellow
  // chairs can share every option filter and still differ in lead time, and the
  // fold would let the quick one answer for the slow one. The delivery pass in
  // lib/grid-build.ts adds each variation's delivery filters, and the wire
  // folds identical combinations later anyway (internVariations).
  const perVariation = withRules.some((f) => f.rules.some((r) => r.source === 'DELIVERY'))

  const ctes: Prisma.Sql[] = []
  const parts: Prisma.Sql[] = []

  if (useOptions) {
    ctes.push(Prisma.sql`opt AS MATERIALIZED (
      SELECT
        o."product_id" AS product_id,
        v."id" AS variant_id,
        v."child_product_id" AS child_id,
        v."position" AS variant_position,
        v."created_at" AS variant_created_at,
        r."filter_id" AS filter_id,
        o."name" AS option_name,
        ov."slug" AS value_slug
      FROM "flt_filter_rules" r
      JOIN "svr_options" o ON o."name" = r."option_name" AND o."product_id" IN (${Prisma.join(productIds)})
      JOIN "svr_option_values" ov ON ov."option_id" = o."id" AND ov."label" = r."value_label"
      JOIN "svr_variant_values" vv ON vv."option_value_id" = ov."id"
      JOIN "svr_variants" v ON v."id" = vv."variant_id" AND v."enabled" = true AND v."product_id" = o."product_id"
      JOIN "shp_products" cp ON cp."id" = v."child_product_id"
      WHERE r."filter_id" IN (${Prisma.join(optionFilterIds)}) AND r."source" = 'OPTION'
    )`)
    // One variation per (product, filter): the first in the owner's order. The
    // photo is looked up for those winners only, not for every matching pair.
    ctes.push(Prisma.sql`swaps AS (
      SELECT DISTINCT ON (product_id, filter_id) product_id, filter_id, child_id, option_name, value_slug
      FROM opt
      ORDER BY product_id, filter_id, variant_position ASC, variant_created_at ASC, variant_id ASC
    )`)
    parts.push(Prisma.sql`
      SELECT 'S' AS kind, s.product_id, s.filter_id, s.child_id, s.option_name, s.value_slug,
        (
          SELECT pm."url" FROM "shp_product_media" pm
          WHERE pm."product_id" = s.child_id AND pm."type" = 'IMAGE'
          ORDER BY pm."is_primary" DESC, pm."position" ASC
          LIMIT 1
        ) AS image,
        NULL::text[] AS combo, NULL::int AS variant_position, NULL::text AS variant_id
      FROM swaps s`)
  }

  if (useAttributes) {
    if (useChildSpecs) {
      ctes.push(Prisma.sql`attr_child AS MATERIALIZED (
        SELECT v."product_id" AS product_id, v."id" AS variant_id, r."filter_id" AS filter_id
        FROM "flt_filter_rules" r
        JOIN "pat_attributes" a ON a."name" = r."option_name"
        JOIN "pat_attribute_values" av ON av."attribute_id" = a."id" AND av."label" = r."value_label"
        JOIN "pat_product_values" pv ON pv."value_id" = av."id"
        JOIN "svr_variants" v ON v."child_product_id" = pv."product_id" AND v."enabled" = true AND v."product_id" IN (${Prisma.join(productIds)})
        WHERE r."filter_id" IN (${Prisma.join(attributeFilterIds)}) AND r."source" = 'ATTRIBUTE'
      )`)
    }
    // Two resolution paths to the page's parent product: the value sits on the
    // parent itself, or on a variant child.
    const childMatches = useChildSpecs ? Prisma.sql`UNION SELECT product_id, filter_id FROM attr_child` : Prisma.empty
    parts.push(Prisma.sql`
      SELECT 'M', m.product_id, m.filter_id, NULL, NULL, NULL, NULL, NULL, NULL, NULL
      FROM (
        SELECT pv."product_id" AS product_id, r."filter_id" AS filter_id
        FROM "flt_filter_rules" r
        JOIN "pat_attributes" a ON a."name" = r."option_name"
        JOIN "pat_attribute_values" av ON av."attribute_id" = a."id" AND av."label" = r."value_label"
        JOIN "pat_product_values" pv ON pv."value_id" = av."id" AND pv."product_id" IN (${Prisma.join(productIds)})
        WHERE r."filter_id" IN (${Prisma.join(attributeFilterIds)}) AND r."source" = 'ATTRIBUTE'
        ${childMatches}
      ) m`)
  }

  // The per-variation detail. Folded and deduplicated in SQL rather than here: a
  // page of 800 listings holds tens of thousands of (variation, filter) pairs but
  // only a few thousand distinct combinations, and shipping the pairs to Node to
  // fold them up would be the expensive half.
  //
  // Specs on the PARENT product are deliberately absent: they are true of the
  // whole listing however it is configured, so they belong in the matrix only.
  // Putting them in a combo would make them look like a property of one
  // variation and let a strict cross-group check reject the listing over them.
  const pairSources: Prisma.Sql[] = []
  if (useOptions) pairSources.push(Prisma.sql`SELECT product_id, variant_id, filter_id FROM opt`)
  if (useChildSpecs) pairSources.push(Prisma.sql`SELECT product_id, variant_id, filter_id FROM attr_child`)
  if (pairSources.length > 0) {
    // Deduplicated by combination: two variations differing only in something
    // nobody filters on are the same answer to the filters. DISTINCT ON keeps
    // the earliest variation in the owner's order; the final ORDER BY puts a
    // product's combinations back into that same variant order.
    ctes.push(Prisma.sql`combos AS (
      SELECT ${perVariation ? Prisma.empty : Prisma.sql`DISTINCT ON (folded.product_id, folded.combo)`}
        folded.product_id, folded.combo, v."position" AS variant_position, v."id" AS variant_id, v."child_product_id" AS child_id
      FROM (
        SELECT product_id, variant_id, array_agg(DISTINCT filter_id) AS combo
        FROM (${Prisma.join(pairSources, ' UNION ALL ')}) pairs
        GROUP BY product_id, variant_id
      ) folded
      JOIN "svr_variants" v ON v."id" = folded.variant_id
      ORDER BY folded.product_id, folded.combo, v."position" ASC, v."created_at" ASC, v."id" ASC
    )`)
    parts.push(Prisma.sql`
      SELECT 'C', c.product_id, NULL, c.child_id, NULL, NULL, NULL, c.combo, c.variant_position, c.variant_id
      FROM combos c`)
  }

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    WITH ${Prisma.join(ctes, ', ')}
    SELECT * FROM (${Prisma.join(parts, ' UNION ALL ')}) answer
    ORDER BY CASE kind WHEN 'S' THEN 0 WHEN 'M' THEN 1 ELSE 2 END, product_id, variant_position ASC, variant_id ASC
  `

  const matrix = new Map<string, string[]>()
  const combos = new Map<string, FltCombo[]>()
  const swaps = new Map<string, Map<string, FltSwap>>()
  const seen = new Set<string>()
  const addMatch = (productId: string, filterId: string) => {
    const key = `${productId} ${filterId}`
    if (seen.has(key)) return
    seen.add(key)
    const list = matrix.get(productId) ?? []
    list.push(filterId)
    matrix.set(productId, list)
  }

  for (const row of rows) {
    const productId = row.product_id as string
    if (row.kind === 'S') {
      const filterId = row.filter_id as string
      addMatch(productId, filterId)
      const perFilter = swaps.get(productId) ?? new Map<string, FltSwap>()
      perFilter.set(filterId, {
        image: (row.image as string | null) ?? null,
        // The option value this filter matched on this product, as the parameter
        // that picks it. The value comes from the SAME representative variation
        // the photo does, so the picture the shopper clicked and the option the
        // product page opens on always describe each other.
        param: optionParamFragment(row.option_name as string | null, row.value_slug as string | null),
        sourceId: row.child_id as string,
      })
      swaps.set(productId, perFilter)
    } else if (row.kind === 'M') {
      addMatch(productId, row.filter_id as string)
    } else {
      const list = combos.get(productId) ?? []
      const childId = perVariation ? (row.child_id as string | null) : null
      list.push(childId ? { filterIds: row.combo as string[], childId } : { filterIds: row.combo as string[] })
      combos.set(productId, list)
    }
  }

  return { matrix, combos, swaps }
}
