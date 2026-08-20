import { connection } from 'next/server'
import { getCollectionBySlug } from '@/modules/filters-for-shop/lib/db/collections'
import { FilterCollectionIntroBody } from '@/modules/filters-for-shop/components/public/FilterCollectionIntroBody'
import { filterCollectionIntroPuckComponent, type FilterCollectionIntroProps } from './FilterCollectionIntro'

// Server (RSC) half of Filter Page: Intro. Kept out of the client editor bundle -
// see FilterCollectionIntro.tsx.
//
// Prints the intro this page's owner designed in the full-screen builder, and
// nothing at all when there is none - so one shared layout carrying this block
// leaves no gap on the pages nobody has written up yet.
export async function FilterCollectionIntroRsc(props: FilterCollectionIntroProps) {
  await connection()
  if (!props.filterPageSlug) return null
  const collection = await getCollectionBySlug(props.filterPageSlug)
  if (!collection) return null
  return <FilterCollectionIntroBody intro={collection.introPuck} />
}

export const filterCollectionIntroPuckRscComponent = {
  ...filterCollectionIntroPuckComponent,
  render: FilterCollectionIntroRsc,
}
