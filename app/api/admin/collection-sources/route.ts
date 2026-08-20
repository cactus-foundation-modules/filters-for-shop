import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listCategories, listCollections, listTags } from '@/modules/shop/lib/db/catalogue'

// Everything a filter page can be built on, for the source picker: the shop's
// categories, its collections and its tags, name and slug only.
//
// A read of another module's tables through its own exported helpers, which is
// the sanctioned direction - filters-for-shop already hard-depends on shop. What
// it must never do is put UI or columns into shop, and it does not.
export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error

  const [categories, collections, tags] = await Promise.all([listCategories(), listCollections(), listTags()])

  return NextResponse.json({
    categories: categories.map((c) => ({ name: c.name, slug: c.slug })),
    collections: collections.map((c) => ({ name: c.name, slug: c.slug })),
    tags: tags.map((t) => ({ name: t.name, slug: t.slug })),
  })
}
