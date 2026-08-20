import { Render } from '@puckeditor/core/rsc'
import type { Data } from '@puckeditor/core'
import { FILTER_COLLECTION_INTRO_LAYOUT_TYPE, hasIntroContent, type FltPuckData } from '@/modules/filters-for-shop/lib/types'

// A filter collection's designed intro. Shared by the Intro block and the
// built-in page shell, so both make the same call about whether there is one.
export async function FilterCollectionIntroBody({ intro, className, style }: {
  intro: FltPuckData | null
  className?: string
  style?: React.CSSProperties
}) {
  if (!hasIntroContent(intro)) return null
  // config.rsc pulls in next/headers through other modules' RSC blocks, so it
  // stays a dynamic import - same reason shop's description body does it.
  const { getModuleLayoutPuckRscConfig } = await import('@/lib/puck/config.rsc')
  return (
    <div className={className} style={style}>
      {/* `as any`: Puck's RSC Render is typed against a concrete config and the
          module config is assembled at runtime - the same cast every surface
          that stamps a document makes. */}
      <Render config={getModuleLayoutPuckRscConfig(FILTER_COLLECTION_INTRO_LAYOUT_TYPE) as any} data={intro as Data} />
    </div>
  )
}
