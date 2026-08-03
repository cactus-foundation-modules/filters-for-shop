import { NextResponse } from 'next/server'
import { requireShopUser } from '@/modules/shop/lib/access'
import { listCatalogueValues } from '@/modules/filters-for-shop/lib/db/catalogue'

// The admin picker's menu: every distinct (option name, value label) pair in
// the catalogue, with product counts and any swatch already on record.
export async function GET() {
  const gate = await requireShopUser('shop.products', { allowAccess: true })
  if (gate.error) return gate.error
  const options = await listCatalogueValues()
  return NextResponse.json({ options })
}
