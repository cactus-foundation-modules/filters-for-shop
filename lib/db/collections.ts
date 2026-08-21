import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { FltCollection, FltCollectionSource, FltCollectionStatus, FltPuckData } from '@/modules/filters-for-shop/lib/types'

// Filter collections and the filters each one arrives with. Read in two flat
// queries and stitched here, same shape as lib/db/filters.ts: the admin screen
// wants the whole list, and it is tens of rows.

function rowToCollection(row: Record<string, unknown>, filterIds: string[]): FltCollection {
  return {
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    status: row.status as FltCollectionStatus,
    sourceType: row.source_type as FltCollectionSource,
    sourceSlug: (row.source_slug as string | null) ?? null,
    shortDescription: (row.short_description as string | null) ?? null,
    // jsonb comes back as an already-parsed JS value, and can legitimately be a
    // bare scalar if something ever wrote one - only an object is a document.
    introPuck: row.intro_puck && typeof row.intro_puck === 'object' ? (row.intro_puck as FltPuckData) : null,
    metaTitle: (row.meta_title as string | null) ?? null,
    metaDescription: (row.meta_description as string | null) ?? null,
    ogImage: (row.og_image as string | null) ?? null,
    noindex: (row.noindex as boolean) ?? false,
    position: row.position as number,
    updatedAt: row.updated_at as Date,
    filterIds,
  }
}

const COLLECTION_COLUMNS = Prisma.sql`
  "id", "name", "slug", "status", "source_type", "source_slug", "short_description",
  "intro_puck", "meta_title", "meta_description", "og_image", "noindex", "position", "updated_at"
`

async function filterIdsFor(collectionIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>()
  if (collectionIds.length === 0) return out
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT "collection_id", "filter_id" FROM "flt_collection_filters"
    WHERE "collection_id" = ANY(${collectionIds}::text[])
    ORDER BY "position"
  `
  for (const row of rows) {
    const id = row.collection_id as string
    const list = out.get(id) ?? []
    list.push(row.filter_id as string)
    out.set(id, list)
  }
  return out
}

export async function listCollections(): Promise<FltCollection[]> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${COLLECTION_COLUMNS} FROM "flt_collections" ORDER BY "position", "created_at"
  `
  const byCollection = await filterIdsFor(rows.map((r) => r.id as string))
  return rows.map((row) => rowToCollection(row, byCollection.get(row.id as string) ?? []))
}

export async function getCollection(id: string): Promise<FltCollection | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${COLLECTION_COLUMNS} FROM "flt_collections" WHERE "id" = ${id} LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  const byCollection = await filterIdsFor([row.id as string])
  return rowToCollection(row, byCollection.get(row.id as string) ?? [])
}

// Deliberately matches a DRAFT row as well as a PUBLISHED one: the storefront
// page decides what an unpublished page does (404 for the public, previewable
// for staff), and a lookup that hid drafts would take that decision away from it.
export async function getCollectionBySlug(slug: string): Promise<FltCollection | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT ${COLLECTION_COLUMNS} FROM "flt_collections" WHERE "slug" = ${slug} LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  const byCollection = await filterIdsFor([row.id as string])
  return rowToCollection(row, byCollection.get(row.id as string) ?? [])
}

/** Does any filter collection answer at this bare slug? The root-slug claim's question. */
export async function collectionSlugExists(slug: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "flt_collections" WHERE "slug" = ${slug} LIMIT 1
  `
  return rows.length > 0
}

export async function collectionSlugTaken(slug: string, excludeId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "flt_collections" WHERE "slug" = ${slug} AND "id" <> ${excludeId} LIMIT 1
  `
  return rows.length > 0
}

// A bare top-level slug is shared ground: an info page, a module's public index,
// a shop product on the root URL style and a gazette post all live there.
//
// This check is load-bearing, not tidiness. Core rules out info pages and module
// indexes before it asks any module at all, so those always win - but among the
// module claims it asks in registry order, which is alphabetical, and
// "filters-for-shop" sorts ahead of both "gazette" and "shop". A collection
// saved on a product's slug would therefore not politely lose; it would take
// that product's page over. So the slug walks on until it finds free ground.
//
// to_regclass, because a module that is not installed has no table and a bare
// SELECT against it would throw - taking down the save rather than the guess.
async function slugOwnedElsewhere(slug: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ taken: boolean }[]>`
    SELECT (
      EXISTS (SELECT 1 FROM "InfoPage" WHERE "slug" = ${slug})
      OR (to_regclass('public.shp_products') IS NOT NULL
          AND EXISTS (SELECT 1 FROM "shp_products" WHERE "slug" = ${slug}))
      OR (to_regclass('public.gz_posts') IS NOT NULL
          AND EXISTS (SELECT 1 FROM "gz_posts" WHERE "slug" = ${slug}))
    ) AS taken
  `
  return rows[0]?.taken === true
}

export async function ensureUniqueCollectionSlug(base: string, excludeId = ''): Promise<string> {
  let slug = base
  for (let n = 2; (await collectionSlugTaken(slug, excludeId)) || (await slugOwnedElsewhere(slug)); n++) {
    slug = `${base}-${n}`
  }
  return slug
}

export async function createCollection(fields: {
  name: string
  slug: string
  sourceType: FltCollectionSource
  sourceSlug: string | null
}): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "flt_collections" ("name", "slug", "source_type", "source_slug", "position")
    VALUES (${fields.name}, ${fields.slug}, ${fields.sourceType}, ${fields.sourceSlug},
      (SELECT COALESCE(MAX("position"), -1) + 1 FROM "flt_collections"))
    RETURNING "id"
  `
  const row = rows[0]
  if (!row) throw new Error('flt_collections insert returned no row')
  return { id: row.id }
}

export type FltCollectionUpdate = {
  name?: string
  slug?: string
  status?: FltCollectionStatus
  sourceType?: FltCollectionSource
  sourceSlug?: string | null
  shortDescription?: string | null
  // Whatever the builder PUT, on its way to a jsonb column. Deliberately not
  // FltPuckData: nothing on the write path reads the document, Puck owns its own
  // schema, and pretending to validate it here would only be a lie with a cast
  // in it.
  introPuck?: Record<string, unknown> | null
  metaTitle?: string | null
  metaDescription?: string | null
  ogImage?: string | null
  noindex?: boolean
}

// Every nullable text field is tri-state: undefined leaves it alone, null clears
// it. Same convention as updateFilter over in lib/db/filters.ts.
export async function updateCollection(id: string, fields: FltCollectionUpdate): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "flt_collections" SET
      "name" = COALESCE(${fields.name ?? null}, "name"),
      "slug" = COALESCE(${fields.slug ?? null}, "slug"),
      "status" = COALESCE(${fields.status ?? null}, "status"),
      "source_type" = COALESCE(${fields.sourceType ?? null}, "source_type"),
      "source_slug" = CASE WHEN ${fields.sourceSlug !== undefined} THEN ${fields.sourceSlug ?? null} ELSE "source_slug" END,
      "short_description" = CASE WHEN ${fields.shortDescription !== undefined} THEN ${fields.shortDescription ?? null} ELSE "short_description" END,
      "intro_puck" = CASE WHEN ${fields.introPuck !== undefined} THEN ${JSON.stringify(fields.introPuck ?? null)}::jsonb ELSE "intro_puck" END,
      "meta_title" = CASE WHEN ${fields.metaTitle !== undefined} THEN ${fields.metaTitle ?? null} ELSE "meta_title" END,
      "meta_description" = CASE WHEN ${fields.metaDescription !== undefined} THEN ${fields.metaDescription ?? null} ELSE "meta_description" END,
      "og_image" = CASE WHEN ${fields.ogImage !== undefined} THEN ${fields.ogImage ?? null} ELSE "og_image" END,
      "noindex" = COALESCE(${fields.noindex ?? null}::boolean, "noindex"),
      "updated_at" = CURRENT_TIMESTAMP
    WHERE "id" = ${id}
  `
}

export async function deleteCollection(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "flt_collections" WHERE "id" = ${id}`
}

export async function reorderCollections(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.$executeRaw`
    UPDATE "flt_collections" SET "position" = u.ord
    FROM (SELECT unnest(${ids}::text[]) AS id, generate_subscripts(${ids}::text[], 1) - 1 AS ord) u
    WHERE "flt_collections"."id" = u.id
  `
}

// Replaces the ticked-on-arrival set wholesale - the admin always sends the full
// list, so a diff would only re-derive what it already has. Unknown filter ids
// are dropped by the foreign key rather than accepted and left dangling.
export async function setCollectionFilters(collectionId: string, filterIds: string[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "flt_collection_filters" WHERE "collection_id" = ${collectionId}`
    if (filterIds.length === 0) return
    const values = filterIds.map((filterId, i) => Prisma.sql`(${collectionId}, ${filterId}, ${i})`)
    await tx.$executeRaw`
      INSERT INTO "flt_collection_filters" ("collection_id", "filter_id", "position")
      VALUES ${Prisma.join(values)}
      ON CONFLICT DO NOTHING
    `
    await tx.$executeRaw`UPDATE "flt_collections" SET "updated_at" = CURRENT_TIMESTAMP WHERE "id" = ${collectionId}`
  })
}

/**
 * The published pages, in their own order, as the shop's collection index wants
 * them: name, blurb, cover and address. Deliberately one flat query with no
 * product counting - a filter collection's count is its whole filtered query,
 * and running 169 of those to print a number under a tile is not a trade worth
 * making. The card leaves the line out instead.
 */
export async function listPublishedCollectionsForIndex(): Promise<Array<{
  id: string
  name: string
  slug: string
  shortDescription: string | null
  ogImage: string | null
}>> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT "id", "name", "slug", "short_description", "og_image"
      FROM "flt_collections"
     WHERE "status" = 'PUBLISHED'
     ORDER BY "position", "created_at"
  `
  return rows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    shortDescription: (row.short_description as string | null) ?? null,
    ogImage: (row.og_image as string | null) ?? null,
  }))
}
