import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import type { FltControlType, FltFilter, FltGroup, FltGroupKind, FltRule, FltRuleSource } from '@/modules/filters-for-shop/lib/types'

// Numeric columns come back from $queryRaw as Prisma.Decimal - never trust the
// JS value shape, coerce explicitly (same lesson as the backup serialiser).
function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null
  return Number(value)
}

// Groups, filters and rules in one shape. Everything is read in three flat
// queries and stitched here - the admin screen and the storefront block both
// want the whole tree, and it is small (tens of rows, not thousands).
export async function listGroups(): Promise<FltGroup[]> {
  const [groupRows, filterRows, ruleRows] = await Promise.all([
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT "id", "name", "slug", "control_type", "kind", "position" FROM "flt_groups" ORDER BY "position", "created_at"
    `,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT "id", "group_id", "label", "slug", "swatch", "price_min", "price_max", "position" FROM "flt_filters" ORDER BY "position", "created_at"
    `,
    prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT "id", "filter_id", "source", "option_name", "value_label" FROM "flt_filter_rules" ORDER BY "option_name", "value_label"
    `,
  ])

  const rulesByFilter = new Map<string, FltRule[]>()
  for (const row of ruleRows) {
    const filterId = row.filter_id as string
    const list = rulesByFilter.get(filterId) ?? []
    list.push({
      id: row.id as string,
      source: row.source as FltRuleSource,
      optionName: row.option_name as string,
      valueLabel: row.value_label as string,
    })
    rulesByFilter.set(filterId, list)
  }

  const filtersByGroup = new Map<string, FltFilter[]>()
  for (const row of filterRows) {
    const groupId = row.group_id as string
    const list = filtersByGroup.get(groupId) ?? []
    list.push({
      id: row.id as string,
      groupId,
      label: row.label as string,
      slug: row.slug as string,
      swatch: (row.swatch as string | null) ?? null,
      position: row.position as number,
      priceMin: toNumberOrNull(row.price_min),
      priceMax: toNumberOrNull(row.price_max),
      rules: rulesByFilter.get(row.id as string) ?? [],
    })
    filtersByGroup.set(groupId, list)
  }

  return groupRows.map((row) => ({
    id: row.id as string,
    name: row.name as string,
    slug: row.slug as string,
    controlType: row.control_type as FltControlType,
    kind: (row.kind as FltGroupKind | null) ?? 'VALUES',
    position: row.position as number,
    filters: filtersByGroup.get(row.id as string) ?? [],
  }))
}

export async function getGroup(id: string): Promise<{ id: string; name: string; slug: string } | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT "id", "name", "slug" FROM "flt_groups" WHERE "id" = ${id} LIMIT 1
  `
  const row = rows[0]
  return row ? { id: row.id as string, name: row.name as string, slug: row.slug as string } : null
}

export async function groupSlugTaken(slug: string, excludeId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "flt_groups" WHERE "slug" = ${slug} AND "id" <> ${excludeId} LIMIT 1
  `
  return rows.length > 0
}

export async function ensureUniqueGroupSlug(base: string, excludeId = ''): Promise<string> {
  let slug = base
  for (let n = 2; await groupSlugTaken(slug, excludeId); n++) slug = `${base}-${n}`
  return slug
}

export async function createGroup(fields: { name: string; slug: string; controlType: FltControlType; kind?: FltGroupKind }): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "flt_groups" ("name", "slug", "control_type", "kind", "position")
    VALUES (${fields.name}, ${fields.slug}, ${fields.controlType}, ${fields.kind ?? 'VALUES'},
      (SELECT COALESCE(MAX("position"), -1) + 1 FROM "flt_groups"))
    RETURNING "id"
  `
  const row = rows[0]
  if (!row) throw new Error('flt_groups insert returned no row')
  return { id: row.id }
}

export async function updateGroup(id: string, fields: { name?: string; slug?: string; controlType?: FltControlType }): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "flt_groups" SET
      "name" = COALESCE(${fields.name ?? null}, "name"),
      "slug" = COALESCE(${fields.slug ?? null}, "slug"),
      "control_type" = COALESCE(${fields.controlType ?? null}, "control_type")
    WHERE "id" = ${id}
  `
}

export async function deleteGroup(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "flt_groups" WHERE "id" = ${id}`
}

export async function reorderGroups(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.$executeRaw`
    UPDATE "flt_groups" SET "position" = u.ord
    FROM (SELECT unnest(${ids}::text[]) AS id, generate_subscripts(${ids}::text[], 1) - 1 AS ord) u
    WHERE "flt_groups"."id" = u.id
  `
}

export async function getFilter(id: string): Promise<{ id: string; groupId: string; label: string; slug: string } | null> {
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT "id", "group_id", "label", "slug" FROM "flt_filters" WHERE "id" = ${id} LIMIT 1
  `
  const row = rows[0]
  if (!row) return null
  return { id: row.id as string, groupId: row.group_id as string, label: row.label as string, slug: row.slug as string }
}

export async function filterSlugTaken(groupId: string, slug: string, excludeId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM "flt_filters" WHERE "group_id" = ${groupId} AND "slug" = ${slug} AND "id" <> ${excludeId} LIMIT 1
  `
  return rows.length > 0
}

export async function ensureUniqueFilterSlug(groupId: string, base: string, excludeId = ''): Promise<string> {
  let slug = base
  for (let n = 2; await filterSlugTaken(groupId, slug, excludeId); n++) slug = `${base}-${n}`
  return slug
}

export async function createFilter(fields: { groupId: string; label: string; slug: string; swatch: string | null }): Promise<{ id: string }> {
  const rows = await prisma.$queryRaw<{ id: string }[]>`
    INSERT INTO "flt_filters" ("group_id", "label", "slug", "swatch", "position")
    VALUES (${fields.groupId}, ${fields.label}, ${fields.slug}, ${fields.swatch},
      (SELECT COALESCE(MAX("position"), -1) + 1 FROM "flt_filters" WHERE "group_id" = ${fields.groupId}))
    RETURNING "id"
  `
  const row = rows[0]
  if (!row) throw new Error('flt_filters insert returned no row')
  return { id: row.id }
}

export async function updateFilter(id: string, fields: { label?: string; slug?: string; swatch?: string | null; priceMin?: number | null; priceMax?: number | null }): Promise<void> {
  // swatch and the price bounds are tri-state: undefined leaves them alone,
  // null clears them.
  await prisma.$executeRaw`
    UPDATE "flt_filters" SET
      "label" = COALESCE(${fields.label ?? null}, "label"),
      "slug" = COALESCE(${fields.slug ?? null}, "slug"),
      "swatch" = CASE WHEN ${fields.swatch !== undefined} THEN ${fields.swatch ?? null} ELSE "swatch" END,
      "price_min" = CASE WHEN ${fields.priceMin !== undefined} THEN ${fields.priceMin ?? null}::numeric ELSE "price_min" END,
      "price_max" = CASE WHEN ${fields.priceMax !== undefined} THEN ${fields.priceMax ?? null}::numeric ELSE "price_max" END
    WHERE "id" = ${id}
  `
}

export async function deleteFilter(id: string): Promise<void> {
  await prisma.$executeRaw`DELETE FROM "flt_filters" WHERE "id" = ${id}`
}

export async function reorderFilters(groupId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) return
  await prisma.$executeRaw`
    UPDATE "flt_filters" SET "position" = u.ord
    FROM (SELECT unnest(${ids}::text[]) AS id, generate_subscripts(${ids}::text[], 1) - 1 AS ord) u
    WHERE "flt_filters"."id" = u.id AND "flt_filters"."group_id" = ${groupId}
  `
}

// Replaces a filter's rule set wholesale. The admin picker always sends the
// full ticked list, so a diff would only re-derive what it already has.
export async function setFilterRules(filterId: string, rules: { source?: FltRuleSource; optionName: string; valueLabel: string }[]): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`DELETE FROM "flt_filter_rules" WHERE "filter_id" = ${filterId}`
    if (rules.length === 0) return
    const values = rules.map((r) => Prisma.sql`(${filterId}, ${r.source ?? 'OPTION'}, ${r.optionName}, ${r.valueLabel})`)
    await tx.$executeRaw`
      INSERT INTO "flt_filter_rules" ("filter_id", "source", "option_name", "value_label")
      VALUES ${Prisma.join(values)}
      ON CONFLICT DO NOTHING
    `
  })
}
