import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { deleteFilter, ensureUniqueFilterSlug, getFilter, updateFilter } from '@/modules/filters-for-shop/lib/db/filters'
import { generateSwatchCopies } from '@/modules/filters-for-shop/lib/swatch-renditions'
import { isImageSwatch } from '@/modules/filters-for-shop/lib/types'

const PatchBody = z.object({
  label: z.string().min(1).max(80).optional(),
  swatch: z.string().max(2048).nullable().optional(),
  // Band bounds for filters in PRICE groups. Whole-catalogue money figures,
  // same unit as product prices; null opens the end of the band.
  priceMin: z.number().min(0).max(100_000_000).nullable().optional(),
  priceMax: z.number().min(0).max(100_000_000).nullable().optional(),
})

export async function PATCH(request: Request, ctx: { params: Promise<Record<string, string>> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id = '' } = await ctx.params
  const existing = await getFilter(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = PatchBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const label = parsed.data.label?.trim()
  if (parsed.data.label !== undefined && !label) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const slug = label && label !== existing.label
    ? await ensureUniqueFilterSlug(existing.groupId, slugify(label) || 'filter', id)
    : undefined
  const swatch = parsed.data.swatch === undefined ? undefined : (parsed.data.swatch?.trim() || null)

  // The shrunk copies live and die with the picture they were made from: a new
  // picture gets fresh ones, a colour or a cleared swatch gets none, and picking
  // the same picture again keeps the ones it has rather than minting duplicate
  // files on every save. Left alone entirely when the swatch is not being
  // touched, which is what `undefined` means throughout this route.
  let swatchSmall: string | null | undefined
  let swatchTiny: string | null | undefined
  if (swatch !== undefined) {
    if (swatch && swatch === existing.swatch) {
      swatchSmall = existing.swatchSmall
      swatchTiny = existing.swatchTiny
    } else if (swatch && isImageSwatch(swatch)) {
      const made = await generateSwatchCopies(swatch)
      swatchSmall = made.small
      swatchTiny = made.tiny
    } else {
      swatchSmall = null
      swatchTiny = null
    }
  }

  await updateFilter(id, {
    label,
    slug,
    swatch,
    swatchSmall,
    swatchTiny,
    priceMin: parsed.data.priceMin,
    priceMax: parsed.data.priceMax,
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, ctx: { params: Promise<Record<string, string>> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id = '' } = await ctx.params
  if (!(await getFilter(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await deleteFilter(id)
  return NextResponse.json({ ok: true })
}
