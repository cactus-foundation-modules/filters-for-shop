import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Render } from '@puckeditor/core/rsc'
import { getSiteUrlOrNull } from '@/lib/config/env'
import { getSessionFromCookie } from '@/lib/auth/session'
import { resolveThemeLayout } from '@/lib/layout/resolveThemeLayout'
import { getModuleLayoutPuckRscConfig } from '@/lib/puck/config.rsc'
import { getShopGate, hasShopPermission } from '@/modules/shop/lib/access'
import { ShopClosedNotice, ShopStaffPreviewBanner } from '@/modules/shop/components/public/ShopClosedNotice'
import { getCollectionBySlug } from '@/modules/filters-for-shop/lib/db/collections'
import { pageFromParams, pageTitleSuffix, withPageParam } from '@/modules/shop/lib/page-href'
import { resolveSourceCrumb } from '@/modules/filters-for-shop/lib/collection-source'
import { injectFilterCollectionContext, sourceGridProps } from '@/modules/filters-for-shop/lib/inject-filter-collection-context'
import { FILTER_COLLECTION_LAYOUT_TYPE, type FltCollection, type FltPuckData } from '@/modules/filters-for-shop/lib/types'
import { FilterCollectionIntroBody } from '@/modules/filters-for-shop/components/public/FilterCollectionIntroBody'
import { ShopFilterGridRsc } from '@/modules/filters-for-shop/components/puck/ShopFilterGrid.rsc'
import Link from 'next/link'

// A filter collection page, at the bare top-level address it owns.
//
// Reached only through core's bare-slug route, via the publicRootSlug claim in
// cactus.module.json - which is why this sits outside app/public/, where every
// page file would also be mounted under a base path. Core has already asked
// filtersClaimsRootSlug() before it gets here, so a row with this slug exists;
// whether it may be SHOWN is decided below, not by the claim, so staff keep
// their preview of a draft.

type Props = {
  params: Promise<{ slug: string }>
  // Read for `?page=`, which is how a crawler walks the rest of a long
  // collection. A grid block cannot read the address it is served at, so the
  // route reads it and writes it into the block's props.
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

// Draft pages are staff-only. Resolved the same way in both halves of the file
// so the tab title can never publish a page the body refuses to render.
async function mayPreviewDraft(): Promise<boolean> {
  const user = await getSessionFromCookie()
  if (!user) return false
  return hasShopPermission(user, 'shop.products', { allowAccess: true })
}

async function resolveVisible(slug: string): Promise<{ collection: FltCollection; draft: boolean } | null> {
  const collection = await getCollectionBySlug(slug)
  if (!collection) return null
  if (collection.status === 'PUBLISHED') return { collection, draft: false }
  if (!(await mayPreviewDraft())) return null
  return { collection, draft: true }
}

export async function generateMetadata({ params, searchParams }: Props): Promise<Metadata> {
  const { slug } = await params
  const page = pageFromParams(await searchParams)
  // A closed shop must not publish these page names either, exactly as shop's
  // own surfaces withhold theirs.
  if ((await getShopGate()).blocked) return {}
  const visible = await resolveVisible(slug)
  if (!visible) return {}
  const { collection, draft } = visible

  const siteUrl = getSiteUrlOrNull()
  const description = collection.metaDescription || collection.shortDescription || undefined
  return {
    title: (collection.metaTitle || collection.name) + pageTitleSuffix(page),
    description,
    // Self-canonical at the bare address. The filter panel writes the shopper's
    // own ticks into the query string as they go, so without this every cut of
    // the page would read to a crawler as a separate address for the same one.
    // Self-canonical, page and all. Pointing page two at page one would tell a
    // crawler the two are the same document, and the products only page two
    // links to would stop being discovered through it - which is the entire
    // reason the link exists.
    ...(siteUrl ? { alternates: { canonical: `${siteUrl}/${collection.slug}${withPageParam('', page)}` } } : {}),
    // A page still in draft is only visible to staff, so it must never be
    // indexed regardless of the owner's own setting.
    ...(collection.noindex || draft ? { robots: { index: false, follow: true } } : {}),
    ...(collection.ogImage
      ? { openGraph: { title: collection.metaTitle || collection.name, description, images: [{ url: collection.ogImage }] } }
      : {}),
  }
}

export default async function FilterCollectionPage({ params, searchParams }: Props) {
  const { slug } = await params
  const page = pageFromParams(await searchParams)
  const gate = await getShopGate()
  if (gate.blocked) return <ShopClosedNotice message={gate.message} />

  const visible = await resolveVisible(slug)
  if (!visible) notFound()
  const { collection, draft } = visible

  const grid = sourceGridProps(collection.sourceType, collection.sourceSlug)
  const banners = (
    <>
      {gate.staffPreview && <ShopStaffPreviewBanner />}
      {draft && (
        <div style={{ margin: 0, borderRadius: 0, padding: '0.75rem 1.5rem', textAlign: 'center', background: 'var(--color-warning-bg)', color: 'var(--color-warning)', fontSize: '0.875rem', fontWeight: 500 }}>
          Draft — not visible to the public
        </div>
      )}
    </>
  )

  // One designed layout, stamped for every filter collection - the same
  // arrangement the shop's Category layout has with its categories. The page's
  // own slug, source and preselection are written into the blocks' props on the
  // way past.
  const layout = await resolveThemeLayout(FILTER_COLLECTION_LAYOUT_TYPE, { moduleName: 'filters-for-shop', slug: collection.slug })
  if (layout?.builderData) {
    const data = injectFilterCollectionContext(layout.builderData as FltPuckData, {
      filterPageSlug: collection.slug,
      ...grid,
      preselectFilterIds: collection.filterIds,
      page,
    })
    return (
      <>
        {banners}
        <Render config={getModuleLayoutPuckRscConfig(FILTER_COLLECTION_LAYOUT_TYPE) as any} data={data as any} />
      </>
    )
  }

  // No layout published yet: the plain version of the same page, so a filter
  // collection works the day it is created rather than waiting on someone to
  // design a template first. Same shape as shop's own fallback category page.
  const crumb = await resolveSourceCrumb(collection.sourceType, collection.sourceSlug)
  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: '2rem 1.5rem' }}>
      {banners}
      <nav aria-label="Breadcrumb" style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginBottom: '0.75rem' }}>
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

      <h1 style={{ fontSize: '1.75rem' }}>{collection.name}</h1>
      {collection.shortDescription && (
        <p style={{ color: 'var(--color-text-muted)' }}>{collection.shortDescription}</p>
      )}

      <FilterCollectionIntroBody intro={collection.introPuck} style={{ marginTop: '1.5rem' }} />

      <div style={{ marginTop: '1.5rem' }}>
        <ShopFilterGridRsc
          categorySlug={grid.categorySlug}
          collectionSlug={grid.collectionSlug}
          tagSlug={grid.tagSlug}
          preselectFilterIds={collection.filterIds}
          limit={100}
          columns={3}
          filterPosition="left"
          showCounts="yes"
          showSort="yes"
          paginate="scroll"
          pageSize={24}
        />
      </div>
    </div>
  )
}
