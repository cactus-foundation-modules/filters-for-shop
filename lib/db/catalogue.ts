import { prisma } from '@/lib/db/prisma'
import { hasVariationsTables } from '@/modules/filters-for-shop/lib/variations-probe'
import type { FltCatalogueOption } from '@/modules/filters-for-shop/lib/types'

// Every distinct (option name, value label) pair across the catalogue, with how
// many products carry it and a representative swatch where one exists. This is
// the admin picker's menu: options over there are per-product rows, so "Stevia
// Blue" appears once here however many products offer it.
export async function listCatalogueValues(): Promise<FltCatalogueOption[]> {
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
  const byOption = new Map<string, FltCatalogueOption>()
  for (const row of rows) {
    const optionName = row.option_name as string
    const entry = byOption.get(optionName) ?? { optionName, values: [] }
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
