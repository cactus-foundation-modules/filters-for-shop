import { prisma } from '@/lib/db/prisma'

// ATTRIBUTE rules match against product-attributes-for-shop's tables, but that
// module is optional and may be absent or uninstalled under us. Probe rather
// than assume - same defence, and same deliberate independence, as the
// shop-variations probe next door (a dependent module owns its own plumbing).
let cached: { value: boolean; at: number } | null = null
const TTL_MS = 30_000

export async function hasAttributeTables(): Promise<boolean> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT (
      to_regclass('public.pat_attributes') IS NOT NULL
      AND to_regclass('public.pat_attribute_values') IS NOT NULL
      AND to_regclass('public.pat_product_values') IS NOT NULL
    ) AS ok
  `
  const value = rows[0]?.ok === true
  cached = { value, at: Date.now() }
  return value
}
