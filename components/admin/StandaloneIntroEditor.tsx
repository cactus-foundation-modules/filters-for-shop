'use client'

import { StandaloneDescriptionBuilder } from '@/modules/shop/components/admin/description-builder/StandaloneDescriptionBuilder'
import { FILTER_COLLECTION_INTRO_LAYOUT_TYPE, type FltPuckData } from '@/modules/filters-for-shop/lib/types'

/**
 * The filter page's intro builder, on its own full-screen page with none of the
 * admin chrome (the route strips it).
 *
 * The builder itself is the one products and categories already use - this
 * wrapper only points it at a filter collection row and its intro field. An
 * import of another module's component, which is the sanctioned direction:
 * filters-for-shop hard-depends on shop, and nothing here is added TO shop.
 */
export function StandaloneIntroEditor({ collectionId, collectionName, backHref, initialData }: {
  collectionId: string
  collectionName: string
  backHref: string
  initialData: FltPuckData | null
}) {
  return (
    <StandaloneDescriptionBuilder
      layoutType={FILTER_COLLECTION_INTRO_LAYOUT_TYPE}
      eyebrow="Editing filter page intro"
      title={collectionName}
      backHref={backHref}
      backLabel="Back to filter collections"
      initialData={initialData}
      endpoint={`/api/m/filters-for-shop/admin/collections/${collectionId}`}
      field="introPuck"
      unsavedMessage="You have unsaved changes to this intro. Leave without saving?"
    />
  )
}
