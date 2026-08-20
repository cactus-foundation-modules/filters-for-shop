import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { slugify } from '@/modules/shop/lib/slug'
import {
  deleteCollection,
  ensureUniqueCollectionSlug,
  getCollection,
  setCollectionFilters,
  updateCollection,
  type FltCollectionUpdate,
} from '@/modules/filters-for-shop/lib/db/collections'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const { id } = await params
  const collection = await getCollection(id)
  if (!collection) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ collection })
}

// Every field optional: the screen PATCHes one panel at a time, and the intro
// builder PUTs nothing but the document. `null` clears a field, absent leaves it.
const PutBody = z.object({
  name: z.string().min(1).max(160).optional(),
  slug: z.string().max(200).optional(),
  status: z.enum(['DRAFT', 'PUBLISHED']).optional(),
  sourceType: z.enum(['CATEGORY', 'COLLECTION', 'TAG', 'ALL']).optional(),
  sourceSlug: z.string().max(200).nullable().optional(),
  shortDescription: z.string().max(2000).nullable().optional(),
  metaTitle: z.string().max(200).nullable().optional(),
  metaDescription: z.string().max(400).nullable().optional(),
  ogImage: z.string().max(2000).nullable().optional(),
  noindex: z.boolean().optional(),
  filterIds: z.array(z.string()).max(50).optional(),
  // The designed intro, as the builder sends it. Shape-checked no further than
  // "an object": it is Puck's document and Puck owns its schema.
  introPuck: z.record(z.string(), z.unknown()).nullable().optional(),
})

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  const existing = await getCollection(id)
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const parsed = PutBody.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  const body = parsed.data

  const fields: FltCollectionUpdate = {}
  if (body.name !== undefined) {
    const name = body.name.trim()
    if (!name) return NextResponse.json({ error: 'Give the page a name.' }, { status: 400 })
    fields.name = name
  }
  if (body.slug !== undefined) {
    // Run through the same uniqueness walk as creation, so a hand-typed address
    // cannot land on a page, a product or another filter page's slug - where it
    // would simply never resolve.
    fields.slug = await ensureUniqueCollectionSlug(slugify(body.slug) || slugify(body.name ?? existing.name) || 'filter-page', id)
  }
  if (body.status !== undefined) fields.status = body.status
  if (body.sourceType !== undefined) fields.sourceType = body.sourceType
  if (body.sourceSlug !== undefined) fields.sourceSlug = body.sourceSlug?.trim() || null
  if (body.shortDescription !== undefined) fields.shortDescription = body.shortDescription?.trim() || null
  if (body.metaTitle !== undefined) fields.metaTitle = body.metaTitle?.trim() || null
  if (body.metaDescription !== undefined) fields.metaDescription = body.metaDescription?.trim() || null
  if (body.ogImage !== undefined) fields.ogImage = body.ogImage?.trim() || null
  if (body.noindex !== undefined) fields.noindex = body.noindex
  if (body.introPuck !== undefined) fields.introPuck = body.introPuck

  // A page whose source is the whole catalogue keeps no slug; switching TO a
  // named source without naming one is refused rather than saved half-done.
  const nextSourceType = fields.sourceType ?? existing.sourceType
  if (nextSourceType === 'ALL') {
    fields.sourceSlug = null
  } else if (body.sourceType !== undefined || body.sourceSlug !== undefined) {
    const nextSlug = fields.sourceSlug ?? existing.sourceSlug
    if (!nextSlug) return NextResponse.json({ error: 'Choose which products this page starts from.' }, { status: 400 })
    fields.sourceSlug = nextSlug
  }

  if (Object.keys(fields).length > 0) await updateCollection(id, fields)
  if (body.filterIds !== undefined) await setCollectionFilters(id, body.filterIds)

  const collection = await getCollection(id)
  return NextResponse.json({ collection })
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id } = await params
  await deleteCollection(id)
  return NextResponse.json({ ok: true })
}
