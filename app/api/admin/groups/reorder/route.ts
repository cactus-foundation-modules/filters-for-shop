import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { reorderGroups } from '@/modules/filters-for-shop/lib/db/filters'

const Body = z.object({ ids: z.array(z.string().min(1)).max(500) })

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  await reorderGroups(parsed.data.ids)
  return NextResponse.json({ ok: true })
}
