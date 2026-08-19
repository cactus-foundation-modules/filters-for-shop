import { prisma } from '@/lib/db/prisma'

// Provider for the core.media-usage-providers extension point.
//
// A filter's colour swatch is held here as a url, so without this the picture in
// your filter bar reads as unused and is offered up for deletion.
export async function filtersMediaUsageProvider(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ ref: string | null }[]>`
    SELECT "swatch" AS ref FROM "flt_filters" WHERE "swatch" IS NOT NULL
  `
  return rows.map((r) => r.ref).filter((r): r is string => !!r)
}
