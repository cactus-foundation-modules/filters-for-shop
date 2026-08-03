import { prisma } from '@/lib/db/prisma'

// This module is meaningless without shop-variations' tables, but the install
// order is not ours to control and an uninstall can leave us running while the
// tables are gone. Probe rather than assume - same defence as
// product-attributes-for-shop's variations bridge (deliberately not imported:
// a dependent module owns its own plumbing).
let cached: { value: boolean; at: number } | null = null
const TTL_MS = 30_000

export async function hasVariationsTables(): Promise<boolean> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.value
  const rows = await prisma.$queryRaw<{ ok: boolean }[]>`
    SELECT (
      to_regclass('public.svr_options') IS NOT NULL
      AND to_regclass('public.svr_option_values') IS NOT NULL
      AND to_regclass('public.svr_variants') IS NOT NULL
      AND to_regclass('public.svr_variant_values') IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'svr_option_values' AND column_name = 'slug'
      )
    ) AS ok
  `
  const value = rows[0]?.ok === true
  cached = { value, at: Date.now() }
  return value
}
