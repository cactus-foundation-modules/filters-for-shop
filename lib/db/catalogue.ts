import { prisma } from '@/lib/db/prisma'
import { hasVariationsTables } from '@/modules/filters-for-shop/lib/variations-probe'
import { hasAttributeTables } from '@/modules/filters-for-shop/lib/attributes-probe'
import type { FltCatalogueOption } from '@/modules/filters-for-shop/lib/types'

// Free-text specs (weights, exact dimensions) would flood the picker with
// thousands of one-off labels nobody would ever build a filter from. An
// attribute only makes the menu when its label list is short enough to be a
// facet.
const MAX_ATTRIBUTE_LABELS = 60

// Every distinct (name, value label) pair across the catalogue, with how many
// products carry it and a representative swatch where one exists. This is the
// admin picker's menu. Two sources feed it: shop-variations option values
// (per-product rows, so "Stevia Blue" appears once however many products offer
// it) and product-attributes values (specs like "Recommended Usage: 24 hours",
// counted through variant children up to the parent product where needed).
export async function listCatalogueValues(): Promise<FltCatalogueOption[]> {
  const [options, attributes] = await Promise.all([listOptionValues(), listAttributeValues()])
  return [...options, ...attributes]
}

async function listOptionValues(): Promise<FltCatalogueOption[]> {
  if (!(await hasVariationsTables())) return []
  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT
      o."name" AS option_name,
      ov."label" AS value_label,
      COUNT(DISTINCT o."product_id")::int AS product_count,
      (ARRAY_AGG(ov."swatch") FILTER (WHERE ov."swatch" IS NOT NULL AND ov."swatch" <> ''))[1] AS swatch
    FROM "svr_options" o
    JOIN "svr_option_values" ov ON ov."option_id" = o."id"
    GROUP BY o."name", ov."label"
    ORDER BY o."name", ov."label"
  `
  return stitch(rows, 'OPTION')
}

async function listAttributeValues(): Promise<FltCatalogueOption[]> {
  if (!(await hasAttributeTables())) return []
  // Counts resolve variant-child values up to their parent product when the
  // variations module is present, so the numbers line up with what a filter
  // would actually match on a category page.
  const childCount = (await hasVariationsTables())
    ? prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT a."name" AS option_name, av."label" AS value_label,
        COUNT(DISTINCT COALESCE(v."product_id", pv."product_id"))::int AS product_count,
        (ARRAY_AGG(av."swatch") FILTER (WHERE av."swatch" IS NOT NULL AND av."swatch" <> ''))[1] AS swatch
      FROM "pat_attributes" a
      JOIN "pat_attribute_values" av ON av."attribute_id" = a."id"
      JOIN "pat_product_values" pv ON pv."value_id" = av."id"
      LEFT JOIN "svr_variants" v ON v."child_product_id" = pv."product_id" AND v."enabled" = true
      WHERE a."id" IN (
        SELECT "attribute_id" FROM "pat_attribute_values" GROUP BY "attribute_id" HAVING COUNT(*) <= ${MAX_ATTRIBUTE_LABELS}
      )
      GROUP BY a."name", av."label"
      ORDER BY a."name", av."label"
    `
    : prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT a."name" AS option_name, av."label" AS value_label,
        COUNT(DISTINCT pv."product_id")::int AS product_count,
        (ARRAY_AGG(av."swatch") FILTER (WHERE av."swatch" IS NOT NULL AND av."swatch" <> ''))[1] AS swatch
      FROM "pat_attributes" a
      JOIN "pat_attribute_values" av ON av."attribute_id" = a."id"
      JOIN "pat_product_values" pv ON pv."value_id" = av."id"
      WHERE a."id" IN (
        SELECT "attribute_id" FROM "pat_attribute_values" GROUP BY "attribute_id" HAVING COUNT(*) <= ${MAX_ATTRIBUTE_LABELS}
      )
      GROUP BY a."name", av."label"
      ORDER BY a."name", av."label"
    `
  return stitch(await childCount, 'ATTRIBUTE')
}

function stitch(rows: Record<string, unknown>[], source: 'OPTION' | 'ATTRIBUTE'): FltCatalogueOption[] {
  const byOption = new Map<string, FltCatalogueOption>()
  for (const row of rows) {
    const optionName = row.option_name as string
    const entry = byOption.get(optionName) ?? { source, optionName, values: [] }
    entry.values.push({
      label: row.value_label as string,
      productCount: row.product_count as number,
      swatch: (row.swatch as string | null) ?? null,
    })
    byOption.set(optionName, entry)
  }
  // Options with the most values first: on a real catalogue that puts Upholstery
  // Colour and Finish - the ones filters are made of - at the top of the picker.
  return [...byOption.values()].sort((a, b) => b.values.length - a.values.length)
}
