import type { MetadataRoute } from 'next'
import { prisma } from '@/lib/db/prisma'
import { getShopConfigCached } from '@/modules/shop/lib/config'

// Filter collection pages, at the bare top-level address each one answers on.
// Scanned by scripts/generate-module-router.mjs, which looks for this exact
// export name in modules/<name>/lib/sitemap.ts.
//
// These pages exist to be found, so leaving them out of the sitemap would defeat
// the entire feature - but only the ones that are actually published and not
// marked noindex. A closed shop lists nothing at all, same rule shop's own
// sitemap follows: the pages themselves turn shoppers away, so advertising them
// for indexing would be working against the setting.
export async function getPublicSitemapEntries(siteUrl: string): Promise<MetadataRoute.Sitemap> {
  if ((await getShopConfigCached()).shopStatus === 'CLOSED') return []

  const rows = await prisma.$queryRaw<Array<{ slug: string; updated_at: Date }>>`
    SELECT "slug", "updated_at" FROM "flt_collections"
    WHERE "status" = 'PUBLISHED' AND "noindex" = false
  `

  return rows.map((row) => ({
    url: `${siteUrl}/${row.slug}`,
    lastModified: row.updated_at,
    changeFrequency: 'weekly' as const,
    priority: 0.5,
  }))
}
