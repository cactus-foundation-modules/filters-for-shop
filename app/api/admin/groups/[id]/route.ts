import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { deleteGroup, ensureUniqueGroupSlug, getGroup, updateGroup } from '@/modules/filters-for-shop/lib/db/filters'

const PatchBody = z.object({
  name: z.string().min(1).max(80).optional(),
  controlType: z.enum(['CHECKBOX', 'SWATCH', 'IMAGE', 'DROPDOWN']).optional(),
})

export async function PATCH(request: Request, ctx: { params: Promise<Record<string, string>> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id = '' } = await ctx.params
  const existing = await getGroup(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = PatchBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const name = parsed.data.name?.trim()
  if (parsed.data.name !== undefined && !name) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  // Renaming re-derives the slug (it is the query-string parameter, so it
  // should read like the heading), keeping it unique against the others.
  const slug = name && name !== existing.name ? await ensureUniqueGroupSlug(slugify(name) || 'filter-group', id) : undefined
  await updateGroup(id, { name, slug, controlType: parsed.data.controlType })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_request: Request, ctx: { params: Promise<Record<string, string>> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id = '' } = await ctx.params
  if (!(await getGroup(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await deleteGroup(id)
  return NextResponse.json({ ok: true })
}
