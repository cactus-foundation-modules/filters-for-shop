import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { createFilter, ensureUniqueFilterSlug, getGroup, setFilterRules } from '@/modules/filters-for-shop/lib/db/filters'
import { generateSwatchCopies } from '@/modules/filters-for-shop/lib/swatch-renditions'
import { isImageSwatch } from '@/modules/filters-for-shop/lib/types'

const PostBody = z.object({
  groupId: z.string().min(1),
  label: z.string().min(1).max(80),
  swatch: z.string().max(2048).nullable().optional(),
  // Rules can come along with creation, so "add Blue with these ticked" is one
  // request from the picker rather than a create-then-save dance.
  rules: z.array(z.object({
    source: z.enum(['OPTION', 'ATTRIBUTE']).default('OPTION'),
    optionName: z.string().min(1).max(200),
    valueLabel: z.string().min(1).max(400),
  })).max(2000).optional(),
})

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = PostBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const label = parsed.data.label.trim()
  if (!label) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  if (!(await getGroup(parsed.data.groupId))) return NextResponse.json({ error: 'Group not found' }, { status: 404 })

  const slug = await ensureUniqueFilterSlug(parsed.data.groupId, slugify(label) || 'filter')
  const swatch = parsed.data.swatch?.trim() || null
  // The copies the storefront panel actually draws. Null for a colour swatch or
  // a picture on some other host, which just means the panel keeps drawing the
  // url it was given.
  const copies = swatch && isImageSwatch(swatch) ? await generateSwatchCopies(swatch) : { small: null, tiny: null }
  const created = await createFilter({
    groupId: parsed.data.groupId,
    label,
    slug,
    swatch,
    swatchSmall: copies.small,
    swatchTiny: copies.tiny,
  })
  if (parsed.data.rules && parsed.data.rules.length > 0) {
    await setFilterRules(created.id, parsed.data.rules)
  }
  return NextResponse.json({ id: created.id, slug })
}
