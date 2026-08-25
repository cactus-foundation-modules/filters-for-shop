import { NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db/prisma'
import { requireShopUser } from '@/modules/shop/lib/access'
import { updateFilter } from '@/modules/filters-for-shop/lib/db/filters'
import { generateSwatchCopies, type SwatchCopyName } from '@/modules/filters-for-shop/lib/swatch-renditions'
import { isImageSwatch } from '@/modules/filters-for-shop/lib/types'

// Backfill: make the shrunk copies for filters whose picture swatch predates
// them. New and re-picked swatches get theirs on save; this catches up the rest.
//
// Batched by cursor because each picture is a download, a pair of resizes and
// two uploads, which a serverless invocation cannot do a hundred times over. The
// screen's button calls this in a loop, passing back `lastId` until `remaining`
// reaches zero. A filter whose picture yields nothing (a colour, an external
// host, a picture already small) is passed over; the cursor moves regardless, so
// the loop always terminates.
const Body = z.object({
  limit: z.number().int().min(1).max(25).optional(),
  afterId: z.string().max(200).optional(),
})

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const limit = parsed.data.limit ?? 6
  const afterId = parsed.data.afterId ?? ''

  // Candidates: a swatch that is not a hex colour and is missing at least one of
  // its copies. The hex test is a coarse SQL filter only; isImageSwatch remains
  // the real judge.
  const rows = await prisma.$queryRaw<{ id: string; swatch: string; swatch_small: string | null; swatch_tiny: string | null }[]>`
    SELECT "id", "swatch", "swatch_small", "swatch_tiny" FROM "flt_filters"
    WHERE "swatch" IS NOT NULL AND "swatch" NOT LIKE '#%'
      AND ("swatch_small" IS NULL OR "swatch_tiny" IS NULL)
      AND "id" > ${afterId}
    ORDER BY "id" ASC
    LIMIT ${limit}
  `

  let made = 0
  let skipped = 0
  // Two filters may stand for one picture (the same fabric meaning Blue in one
  // group and Fabric in another), so what has been worked out for a url is reused
  // across the batch rather than worked out per filter.
  const copiesByUrl = new Map<string, { small: string | null; tiny: string | null }>()
  for (const row of rows) {
    if (!isImageSwatch(row.swatch)) { skipped += 1; continue }

    // What any filter already has for this picture, taken column by column - so a
    // half-finished earlier run contributes what it managed rather than being
    // read as "done" or ignored entirely.
    const known = copiesByUrl.get(row.swatch) ?? await (async () => {
      const sibling = await prisma.$queryRaw<[{ small: string | null; tiny: string | null }]>`
        SELECT MAX("swatch_small") AS small, MAX("swatch_tiny") AS tiny
        FROM "flt_filters" WHERE "swatch" = ${row.swatch}
      `
      return { small: sibling[0]?.small ?? null, tiny: sibling[0]?.tiny ?? null }
    })()

    let small = row.swatch_small ?? known.small
    let tiny = row.swatch_tiny ?? known.tiny
    const want: SwatchCopyName[] = [...(small ? [] : ['small' as const]), ...(tiny ? [] : ['tiny' as const])]
    if (want.length > 0) {
      const fresh = await generateSwatchCopies(row.swatch, { want })
      small = small ?? fresh.small
      tiny = tiny ?? fresh.tiny
    }
    copiesByUrl.set(row.swatch, { small, tiny })

    if (small === row.swatch_small && tiny === row.swatch_tiny) { skipped += 1; continue }
    await updateFilter(row.id, { swatchSmall: small, swatchTiny: tiny })
    made += 1
  }

  const lastId = rows[rows.length - 1]?.id ?? afterId
  const remainingRows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) AS "count" FROM "flt_filters"
    WHERE "swatch" IS NOT NULL AND "swatch" NOT LIKE '#%'
      AND ("swatch_small" IS NULL OR "swatch_tiny" IS NULL)
      AND "id" > ${lastId}
  `
  const remaining = Number(remainingRows[0]?.count ?? 0)

  return NextResponse.json({ made, skipped, lastId, remaining, done: rows.length === 0 || remaining === 0 })
}
