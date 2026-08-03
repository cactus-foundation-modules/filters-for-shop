import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getGroup, reorderFilters } from '@/modules/filters-for-shop/lib/db/filters'

const Body = z.object({
  groupId: z.string().min(1),
  ids: z.array(z.string().min(1)).max(1000),
})

export async function POST(request: Request) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  if (!(await getGroup(parsed.data.groupId))) return NextResponse.json({ error: 'Group not found' }, { status: 404 })
  await reorderFilters(parsed.data.groupId, parsed.data.ids)
  return NextResponse.json({ ok: true })
}
