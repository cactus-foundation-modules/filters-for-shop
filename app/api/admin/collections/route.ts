import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import { createCollection, ensureUniqueCollectionSlug, listCollections } from '@/modules/filters-for-shop/lib/db/collections'

export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const collections = await listCollections()
  return NextResponse.json({ collections })
}

const PostBody = z.object({
  name: z.string().min(1).max(160),
  sourceType: z.enum(['CATEGORY', 'COLLECTION', 'TAG', 'ALL']).default('CATEGORY'),
  sourceSlug: z.string().max(200).optional(),
})

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = PostBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const name = parsed.data.name.trim()
  if (!name) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const sourceType = parsed.data.sourceType
  // ALL means the whole catalogue, so it carries no slug at all; the other three
  // are meaningless without one.
  const sourceSlug = sourceType === 'ALL' ? null : (parsed.data.sourceSlug?.trim() || null)
  if (sourceType !== 'ALL' && !sourceSlug) {
    return NextResponse.json({ error: 'Choose which products this page starts from.' }, { status: 400 })
  }

  const slug = await ensureUniqueCollectionSlug(slugify(name) || 'filter-page')
  const created = await createCollection({ name, slug, sourceType, sourceSlug })
  return NextResponse.json({ id: created.id, slug })
}
