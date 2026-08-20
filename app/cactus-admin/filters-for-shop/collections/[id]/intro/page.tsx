import { headers } from 'next/headers'
import { getSessionFromCookie } from '@/lib/auth/session'
import { hasShopPermission } from '@/modules/shop/lib/access'
import { DESCRIPTION_BUILDER_CHROME_OFF_CSS } from '@/modules/shop/components/admin/description-builder/shared'
import { getCollection } from '@/modules/filters-for-shop/lib/db/collections'
import { StandaloneIntroEditor } from '@/modules/filters-for-shop/components/admin/StandaloneIntroEditor'

export const metadata = { title: 'Edit filter page intro — Admin' }

// The full-screen intro builder, opened in its own tab from the Filter
// Collections tab. It lives under the admin path (so the session gate and
// rewrites apply) but DESCRIPTION_BUILDER_CHROME_OFF_CSS strips the admin shell,
// leaving nothing but the page builder.
export default async function FilterCollectionIntroPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionFromCookie()
  if (!user) return null
  if (!(await hasShopPermission(user, 'shop.products'))) {
    return <div className="alert alert-danger">You do not have permission to edit filter collections.</div>
  }

  const { id } = await params
  const collection = await getCollection(id)
  if (!collection) return <div className="alert alert-danger">This filter page could not be found.</div>

  const adminPath = (await headers()).get('x-cactus-admin-path') ?? ''

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: DESCRIPTION_BUILDER_CHROME_OFF_CSS }} />
      <StandaloneIntroEditor
        collectionId={id}
        collectionName={collection.name}
        backHref={`/${adminPath}/m/shop/products?tab=filters-collections`}
        initialData={collection.introPuck}
      />
    </>
  )
}
