import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { deleteFilter, ensureUniqueFilterSlug, getFilter, updateFilter } from '@/modules/filters-for-shop/lib/db/filters'

const PatchBody = z.object({
  label: z.string().min(1).max(80).optional(),
  swatch: z.string().max(2048).nullable().optional(),
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
  await updateFilter(id, {
    label,
    slug,
    swatch: parsed.data.swatch === undefined ? undefined : (parsed.data.swatch?.trim() || null),
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
