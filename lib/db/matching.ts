import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { hasVariationsTables } from '@/modules/filters-for-shop/lib/variations-probe'
import type { FltGroup } from '@/modules/filters-for-shop/lib/types'

// For one filter on one product: which variation stands for it. The image is
// the variant child's own primary photo (every variation is a hidden product
// with its own media over in shop-variations), and the href is the child's own
// URL - shop-variations already turns that link into the parent page opened on
// exactly that combination, which is what pre-selects the options on click.
export type FltSwap = {
  image: string | null
  href: string
}

export type FltProductMatches = {
  // product id -> filter ids it matches (via any enabled variant).
  matrix: Map<string, string[]>
  // product id -> filter id -> representative variant swap.
  swaps: Map<string, Map<string, FltSwap>>
}

const EMPTY: FltProductMatches = { matrix: new Map(), swaps: new Map() }

// One pass over the page's products against every configured rule. A product
// matches a filter when any of its enabled variations carries an option value
// whose (option name, label) pair is in the filter's rule set. The
// representative variation - the one whose photo and link the card borrows - is
// the first matching one in the owner's variant order.
export async function getProductFilterMatches(productIds: string[], groups: FltGroup[]): Promise<FltProductMatches> {
  const filterIds = groups.flatMap((g) => g.filters.filter((f) => f.rules.length > 0).map((f) => f.id))
  if (productIds.length === 0 || filterIds.length === 0) return EMPTY
  if (!(await hasVariationsTables())) return EMPTY

  const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
    SELECT product_id, filter_id, child_slug, image FROM (
      SELECT
        o."product_id" AS product_id,
        r."filter_id" AS filter_id,
        cp."slug" AS child_slug,
        (
          SELECT pm."url" FROM "shp_product_media" pm
          WHERE pm."product_id" = v."child_product_id" AND pm."type" = 'IMAGE'
          ORDER BY pm."is_primary" DESC, pm."position" ASC
          LIMIT 1
        ) AS image,
        ROW_NUMBER() OVER (
          PARTITION BY o."product_id", r."filter_id"
          ORDER BY v."position" ASC, v."created_at" ASC, v."id" ASC
        ) AS rn
      FROM "flt_filter_rules" r
      JOIN "svr_options" o ON o."name" = r."option_name" AND o."product_id" IN (${Prisma.join(productIds)})
      JOIN "svr_option_values" ov ON ov."option_id" = o."id" AND ov."label" = r."value_label"
      JOIN "svr_variant_values" vv ON vv."option_value_id" = ov."id"
      JOIN "svr_variants" v ON v."id" = vv."variant_id" AND v."enabled" = true AND v."product_id" = o."product_id"
      JOIN "shp_products" cp ON cp."id" = v."child_product_id"
      WHERE r."filter_id" IN (${Prisma.join(filterIds)})
    ) ranked
    WHERE rn = 1
  `

  const matrix = new Map<string, string[]>()
  const swaps = new Map<string, Map<string, FltSwap>>()
  for (const row of rows) {
    const productId = row.product_id as string
    const filterId = row.filter_id as string
    const list = matrix.get(productId) ?? []
    list.push(filterId)
    matrix.set(productId, list)
    const perFilter = swaps.get(productId) ?? new Map<string, FltSwap>()
    perFilter.set(filterId, {
      image: (row.image as string | null) ?? null,
      href: `/shop/products/${row.child_slug as string}`,
    })
    swaps.set(productId, perFilter)
  }
  return { matrix, swaps }
}
