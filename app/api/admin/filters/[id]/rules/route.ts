import { NextResponse } from 'next/server'
import { z } from 'zod'
import { requireShopUser } from '@/modules/shop/lib/access'
import { getFilter, setFilterRules } from '@/modules/filters-for-shop/lib/db/filters'

const Body = z.object({
  rules: z.array(z.object({
    source: z.enum(['OPTION', 'ATTRIBUTE']).default('OPTION'),
    optionName: z.string().min(1).max(200),
    valueLabel: z.string().min(1).max(400),
  })).max(2000),
})

// Replaces the filter's whole rule set - the picker always sends every tick.
export async function PUT(request: Request, ctx: { params: Promise<Record<string, string>> }) {
  const gate = await requireShopUser('shop.products')
  if (gate.error) return gate.error
  const { id = '' } = await ctx.params
  if (!(await getFilter(id))) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const parsed = Body.safeParse(await request.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
  await setFilterRules(id, parsed.data.rules)
  return NextResponse.json({ ok: true })
}
