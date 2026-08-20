import { connection } from 'next/server'
import Link from 'next/link'
import { getCollectionBySlug } from '@/modules/filters-for-shop/lib/db/collections'
import { resolveSourceCrumb } from '@/modules/filters-for-shop/lib/collection-source'
import { filterCollectionHeaderPuckComponent, type FilterCollectionHeaderProps } from './FilterCollectionHeader'

// Server (RSC) half of Filter Page: Heading. Kept out of the client editor
// bundle - see FilterCollectionHeader.tsx.

const EYEBROW: React.CSSProperties = {
  display: 'block',
  fontSize: 12,
  fontWeight: 600,
  letterSpacing: '0.16em',
  textTransform: 'uppercase',
  color: 'var(--color-primary)',
  marginBottom: '0.75rem',
}

const HEADING: React.CSSProperties = {
  margin: 0,
  fontFamily: 'var(--display-family, Georgia, serif)',
  fontSize: 'clamp(30px, 4vw, 44px)',
  fontWeight: 600,
  lineHeight: 1.1,
  color: 'var(--color-fg)',
}

export async function FilterCollectionHeaderRsc(props: FilterCollectionHeaderProps) {
  await connection()
  if (!props.filterPageSlug) return null
  const collection = await getCollectionBySlug(props.filterPageSlug)
  if (!collection) return null
  // The trail leads back to where the page's products come from - Shop, then the
  // category or collection this one is a cut of. A page cut from the whole
  // catalogue gets Shop alone.
  const crumb = await resolveSourceCrumb(collection.sourceType, collection.sourceSlug)

  return (
    <div>
      {props.showBreadcrumbs !== 'no' && (
        <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.5rem' }}>
          <Link href="/shop" style={{ color: 'inherit', textDecoration: 'none' }}>Shop</Link>
          {crumb && (
            <>
              <span style={{ margin: '0 0.4rem' }}>/</span>
              <Link href={crumb.href} style={{ color: 'inherit', textDecoration: 'none' }}>{crumb.name}</Link>
            </>
          )}
          <span style={{ margin: '0 0.4rem' }}>/</span>
          <span style={{ color: 'var(--color-text)' }}>{collection.name}</span>
        </nav>
      )}
      {props.eyebrow && <span style={EYEBROW}>{props.eyebrow}</span>}
      <h1 style={HEADING}>{collection.name}</h1>
      {props.showBlurb !== 'no' && collection.shortDescription && (
        <p style={{ margin: '0.75rem 0 0', fontSize: '1.0625rem', color: 'var(--color-text-muted)' }}>
          {collection.shortDescription}
        </p>
      )}
    </div>
  )
}

export const filterCollectionHeaderPuckRscComponent = {
  ...filterCollectionHeaderPuckComponent,
  render: FilterCollectionHeaderRsc,
}
