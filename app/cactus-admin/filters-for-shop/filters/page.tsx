import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { FiltersScreen } from '@/modules/filters-for-shop/components/admin/FiltersScreen'

export const metadata = { title: 'Shop filters — Admin' }

export default async function ShopFiltersPage() {
  const user = await getSessionFromCookie()
  if (!user) return null
  const canAccess = await hasShopPermission(user, 'shop.products', { allowAccess: true })
  if (!canAccess) return <div className="alert alert-danger">You do not have permission to manage shop filters.</div>

  return <FiltersScreen />
}
