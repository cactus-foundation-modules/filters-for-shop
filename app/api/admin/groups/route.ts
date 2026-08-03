import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { createGroup, ensureUniqueGroupSlug, listGroups } from '@/modules/filters-for-shop/lib/db/filters'

export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const groups = await listGroups()
  return NextResponse.json({ groups })
}

const PostBody = z.object({
  name: z.string().min(1).max(80),
  controlType: z.enum(['CHECKBOX', 'SWATCH', 'IMAGE', 'DROPDOWN']).default('SWATCH'),
  // VALUES groups match option/attribute values through rules; PRICE groups
  // hold band filters instead. The kind is fixed at creation - flipping it
  // later would leave the other kind's data stranded.
  kind: z.enum(['VALUES', 'PRICE']).default('VALUES'),
})

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = PostBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const name = parsed.data.name.trim()
  if (!name) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const slug = await ensureUniqueGroupSlug(slugify(name) || 'filter-group')
  const created = await createGroup({ name, slug, controlType: parsed.data.controlType, kind: parsed.data.kind })
  return NextResponse.json({ id: created.id, slug })
}
