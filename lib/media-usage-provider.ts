import { prisma } from '@/lib/db/prisma'

// Provider for the core.media-usage-providers extension point.
//
// A filter's colour swatch is held here as a url, so without this the picture in
// your filter bar reads as unused and is offered up for deletion. A filter
// collection page adds its social share image and everything inside its designed
// intro - core folds whatever comes back into the haystack it already scans page
// and layout JSON with, so handing over the raw intro document is enough for it
// to find the urls, keys and ids inside.
export async function filtersMediaUsageProvider(): Promise<string[]> {
  const [swatches, collections] = await Promise.all([
    prisma.$queryRaw<{ ref: string | null }[]>`
      SELECT "swatch" AS ref FROM "flt_filters" WHERE "swatch" IS NOT NULL
    `,
    prisma.$queryRaw<{ og: string | null; intro: string | null }[]>`
      SELECT "og_image" AS og, "intro_puck"::text AS intro FROM "flt_collections"
      WHERE "og_image" IS NOT NULL OR "intro_puck" IS NOT NULL
    `,
  ])

  return [
    ...swatches.map((r) => r.ref),
    ...collections.flatMap((r) => [r.og, r.intro]),
  ].filter((r): r is string => !!r)
}
