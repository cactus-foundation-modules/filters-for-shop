'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FltCollection, FltCollectionSource, FltGroup } from '@/modules/filters-for-shop/lib/types'
import { isImageSwatch } from '@/modules/filters-for-shop/lib/types'

const BASE = '/api/m/filters-for-shop/admin'

type SourceOption = { name: string; slug: string }
type Sources = { categories: SourceOption[]; collections: SourceOption[]; tags: SourceOption[] }

const SOURCE_LABELS: Record<FltCollectionSource, string> = {
  CATEGORY: 'A category',
  COLLECTION: 'A collection',
  TAG: 'A tag',
  ALL: 'The whole shop',
}

const card: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  background: 'var(--color-surface)',
}

function SwatchDot({ swatch }: { swatch: string | null }) {
  const style: React.CSSProperties = {
    width: 14,
    height: 14,
    borderRadius: 999,
    border: '1px solid var(--color-border)',
    flex: 'none',
    display: 'inline-block',
    verticalAlign: 'middle',
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  }
  if (swatch) {
    if (isImageSwatch(swatch)) style.backgroundImage = `url("${swatch}")`
    else style.background = swatch
  } else {
    style.background = 'var(--color-bg-subtle)'
  }
  return <span style={style} aria-hidden />
}

function optionsFor(sources: Sources, sourceType: FltCollectionSource): SourceOption[] {
  if (sourceType === 'CATEGORY') return sources.categories
  if (sourceType === 'COLLECTION') return sources.collections
  if (sourceType === 'TAG') return sources.tags
  return []
}

type Sender = (url: string, method: string, body?: unknown) => Promise<Record<string, unknown> | null>

/**
 * Filter collections: SEO landing pages built out of the filters that already
 * exist. "Green Office Chairs" is the Office Chairs category with Colour=Green
 * ticked on arrival, at an address of its own with its own page title, meta
 * description and designed intro.
 *
 * Nothing here touches the filters themselves - a page only names a starting
 * selection, so a colour added to the Colour group tomorrow turns up on every
 * page built on Colour without anyone revisiting them.
 */
export function FilterCollectionsScreen({ adminPath }: { adminPath: string }) {
  const [collections, setCollections] = useState<FltCollection[]>([])
  const [groups, setGroups] = useState<FltGroup[]>([])
  const [sources, setSources] = useState<Sources>({ categories: [], collections: [], tags: [] })
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newName, setNewName] = useState('')
  const [newSourceType, setNewSourceType] = useState<FltCollectionSource>('CATEGORY')
  const [newSourceSlug, setNewSourceSlug] = useState('')
  // Which page's panel is open. One at a time keeps a list of forty readable.
  const [openId, setOpenId] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [colRes, groupRes, srcRes] = await Promise.all([
        fetch(`${BASE}/collections`),
        fetch(`${BASE}/groups`),
        fetch(`${BASE}/collection-sources`),
      ])
      const colData = await colRes.json()
      const groupData = await groupRes.json()
      const srcData = await srcRes.json()
      setCollections(colData.collections ?? [])
      setGroups(groupData.groups ?? [])
      setSources({
        categories: srcData.categories ?? [],
        collections: srcData.collections ?? [],
        tags: srcData.tags ?? [],
      })
    } catch {
      setError('Could not load filter collections.')
    } finally {
      setLoaded(true)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to async helper; all setState calls are after awaits
  useEffect(() => { void load() }, [load])

  const send: Sender = useCallback(async (url, method, body) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setError((data as { error?: string }).error ?? 'Something went wrong.')
        return null
      }
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
      await load()
      return data
    } catch {
      setError('Something went wrong.')
      return null
    } finally {
      setBusy(false)
    }
  }, [load])

  const newSourceOptions = optionsFor(sources, newSourceType)

  async function add() {
    const name = newName.trim()
    if (!name) return
    if (newSourceType !== 'ALL' && !newSourceSlug) {
      setError('Choose which products the page starts from.')
      return
    }
    const created = await send(`${BASE}/collections`, 'POST', {
      name,
      sourceType: newSourceType,
      sourceSlug: newSourceType === 'ALL' ? undefined : newSourceSlug,
    })
    if (created) {
      setNewName('')
      // Straight into the new page's panel: a page with no filters ticked is
      // just its source, so there is always a next step.
      setOpenId(typeof created.id === 'string' ? created.id : null)
    }
  }

  async function move(index: number, delta: number) {
    const next = [...collections]
    const moved = next[index]
    const target = next[index + delta]
    if (!moved || !target) return
    next[index] = target
    next[index + delta] = moved
    setCollections(next)
    await send(`${BASE}/collections/reorder`, 'POST', { ids: next.map((c) => c.id) })
  }

  if (!loaded) return <p style={{ color: 'var(--color-text-secondary)' }}>Loading…</p>

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <div>
        <h1 style={{ fontSize: '1.25rem', margin: '0 0 0.25rem' }}>Filter Collections</h1>
        <p style={{ margin: 0, color: 'var(--color-text-secondary)', fontSize: '0.875rem', maxWidth: '60ch' }}>
          A page of its own for a filtered view shoppers actually search for - Green Office Chairs, Oak Bench Desks,
          Chairs Under £200. It starts from a category, collection or tag with the filters you pick already ticked,
          and carries its own address, page title, description and designed intro. The panel is the ordinary one, so
          nothing stops a shopper carrying on filtering from there.
        </p>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}

      {groups.length === 0 && (
        <div className="alert alert-warning">
          There are no filters set up yet. Build some on the Filters tab first - a filter page is a starting
          selection, and there is nothing yet to select.
        </div>
      )}

      <section style={card}>
        <h2 style={{ fontSize: '1rem', margin: '0 0 0.75rem' }}>Add a filter page</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-control"
            style={{ flex: '1 1 14rem', minWidth: '10rem' }}
            placeholder="e.g. Green Office Chairs"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
            aria-label="Filter page name"
          />
          <select
            className="form-control"
            style={{ width: 'auto' }}
            value={newSourceType}
            onChange={(e) => { setNewSourceType(e.target.value as FltCollectionSource); setNewSourceSlug('') }}
            aria-label="What the page starts from"
          >
            {(Object.keys(SOURCE_LABELS) as FltCollectionSource[]).map((k) => (
              <option key={k} value={k}>{SOURCE_LABELS[k]}</option>
            ))}
          </select>
          {newSourceType !== 'ALL' && (
            <select
              className="form-control"
              style={{ width: 'auto', maxWidth: '18rem' }}
              value={newSourceSlug}
              onChange={(e) => setNewSourceSlug(e.target.value)}
              aria-label="Which one"
            >
              <option value="">Choose…</option>
              {newSourceOptions.map((o) => (
                <option key={o.slug} value={o.slug}>{o.name}</option>
              ))}
            </select>
          )}
          <button className="btn btn-primary" disabled={busy || !newName.trim()} onClick={() => void add()}>Add page</button>
        </div>
      </section>

      {collections.length === 0 ? (
        <p style={{ color: 'var(--color-text-secondary)' }}>No filter pages yet.</p>
      ) : (
        collections.map((collection, index) => (
          <CollectionCard
            key={collection.id}
            collection={collection}
            groups={groups}
            sources={sources}
            adminPath={adminPath}
            busy={busy}
            send={send}
            open={openId === collection.id}
            setOpen={(open) => setOpenId(open ? collection.id : null)}
            canMoveUp={index > 0}
            canMoveDown={index < collections.length - 1}
            onMove={(delta) => void move(index, delta)}
          />
        ))
      )}
    </div>
  )
}

function CollectionCard({ collection, groups, sources, adminPath, busy, send, open, setOpen, canMoveUp, canMoveDown, onMove }: {
  collection: FltCollection
  groups: FltGroup[]
  sources: Sources
  adminPath: string
  busy: boolean
  send: Sender
  open: boolean
  setOpen: (open: boolean) => void
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (delta: number) => void
}) {
  const [name, setName] = useState(collection.name)
  const [slug, setSlug] = useState(collection.slug)
  const [shortDescription, setShortDescription] = useState(collection.shortDescription ?? '')
  const [metaTitle, setMetaTitle] = useState(collection.metaTitle ?? '')
  const [metaDescription, setMetaDescription] = useState(collection.metaDescription ?? '')
  const [ogImage, setOgImage] = useState(collection.ogImage ?? '')
  const [sourceType, setSourceType] = useState<FltCollectionSource>(collection.sourceType)
  const [sourceSlug, setSourceSlug] = useState(collection.sourceSlug ?? '')

  const picked = useMemo(() => new Set(collection.filterIds), [collection.filterIds])
  const sourceOptions = optionsFor(sources, sourceType)
  // Only the named sources need to exist; a page cut from the whole shop has
  // nothing to go missing. Reported rather than prevented - see the note on
  // source_slug in migration 003.
  const sourceMissing = collection.sourceType !== 'ALL'
    && !optionsFor(sources, collection.sourceType).some((o) => o.slug === collection.sourceSlug)

  const pickedLabels = groups
    .flatMap((g) => g.filters.filter((f) => picked.has(f.id)).map((f) => `${g.name}: ${f.label}`))

  async function save() {
    await send(`${BASE}/collections/${collection.id}`, 'PUT', {
      name,
      slug,
      shortDescription,
      metaTitle,
      metaDescription,
      ogImage,
      sourceType,
      sourceSlug: sourceType === 'ALL' ? null : sourceSlug,
    })
  }

  async function toggleFilter(filterId: string) {
    const next = new Set(picked)
    if (next.has(filterId)) next.delete(filterId)
    else next.add(filterId)
    await send(`${BASE}/collections/${collection.id}`, 'PUT', { filterIds: [...next] })
  }

  async function remove() {
    if (!window.confirm(`Delete "${collection.name}"? The page at /${collection.slug} stops answering straight away.`)) return
    await send(`${BASE}/collections/${collection.id}`, 'DELETE')
  }

  const published = collection.status === 'PUBLISHED'

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '1.0625rem', margin: 0 }}>{collection.name}</h2>
        <span
          style={{
            fontSize: '0.6875rem',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '0.15rem 0.45rem',
            borderRadius: 999,
            border: '1px solid var(--color-border)',
            color: published ? 'var(--color-success)' : 'var(--color-text-secondary)',
          }}
        >
          {published ? 'Live' : 'Draft'}
        </span>
        <code style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>/{collection.slug}</code>
        {collection.noindex && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>hidden from search</span>
        )}
        {sourceMissing && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-error)' }}>
            its {collection.sourceType.toLowerCase()} no longer exists
          </span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            className={published ? 'btn btn-secondary btn-sm' : 'btn btn-primary btn-sm'}
            disabled={busy}
            onClick={() => void send(`${BASE}/collections/${collection.id}`, 'PUT', { status: published ? 'DRAFT' : 'PUBLISHED' })}
          >
            {published ? 'Unpublish' : 'Publish'}
          </button>
          <a className="btn btn-secondary btn-sm" href={`/${collection.slug}`} target="_blank" rel="noreferrer">View</a>
          <button className="btn btn-secondary btn-sm" disabled={busy || !canMoveUp} onClick={() => onMove(-1)} aria-label={`Move ${collection.name} up`}>↑</button>
          <button className="btn btn-secondary btn-sm" disabled={busy || !canMoveDown} onClick={() => onMove(1)} aria-label={`Move ${collection.name} down`}>↓</button>
          <button className="btn btn-secondary btn-sm" onClick={() => setOpen(!open)} aria-expanded={open}>{open ? 'Close' : 'Edit'}</button>
        </div>
      </div>

      <p style={{ margin: '0.5rem 0 0', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
        {collection.sourceType === 'ALL' ? 'The whole shop' : `${SOURCE_LABELS[collection.sourceType]}: ${collection.sourceSlug}`}
        {pickedLabels.length > 0 ? ` · ${pickedLabels.join(', ')}` : ' · no filters ticked yet'}
      </p>

      {open && (
        <div style={{ display: 'grid', gap: '1rem', marginTop: '1rem' }}>
          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.8125rem' }}>Page name</span>
              <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.8125rem' }}>Address</span>
              <input className="form-control" value={slug} onChange={(e) => setSlug(e.target.value)} />
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
                The page answers at /{collection.slug}. An address already spoken for gets a number on the end.
              </span>
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.8125rem' }}>Starts from</span>
              <select
                className="form-control"
                value={sourceType}
                onChange={(e) => { setSourceType(e.target.value as FltCollectionSource); setSourceSlug('') }}
              >
                {(Object.keys(SOURCE_LABELS) as FltCollectionSource[]).map((k) => (
                  <option key={k} value={k}>{SOURCE_LABELS[k]}</option>
                ))}
              </select>
            </label>
            {sourceType !== 'ALL' && (
              <label style={{ display: 'grid', gap: '0.25rem' }}>
                <span style={{ fontSize: '0.8125rem' }}>Which one</span>
                <select className="form-control" value={sourceSlug} onChange={(e) => setSourceSlug(e.target.value)}>
                  <option value="">Choose…</option>
                  {sourceOptions.map((o) => (
                    <option key={o.slug} value={o.slug}>{o.name}</option>
                  ))}
                </select>
              </label>
            )}
          </div>

          <label style={{ display: 'grid', gap: '0.25rem' }}>
            <span style={{ fontSize: '0.8125rem' }}>Short description</span>
            <textarea className="form-control" rows={2} value={shortDescription} onChange={(e) => setShortDescription(e.target.value)} />
            <span style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }}>
              The line under the heading. The longer piece is the designed intro below.
            </span>
          </label>

          <div style={{ display: 'grid', gap: '0.75rem', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.8125rem' }}>Page title for search results</span>
              <input className="form-control" value={metaTitle} onChange={(e) => setMetaTitle(e.target.value)} placeholder={collection.name} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.8125rem' }}>Description for search results</span>
              <input className="form-control" value={metaDescription} onChange={(e) => setMetaDescription(e.target.value)} />
            </label>
            <label style={{ display: 'grid', gap: '0.25rem' }}>
              <span style={{ fontSize: '0.8125rem' }}>Sharing picture</span>
              <input className="form-control" value={ogImage} onChange={(e) => setOgImage(e.target.value)} placeholder="Paste a picture address" />
            </label>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-primary" disabled={busy} onClick={() => void save()}>Save</button>
            <a
              className="btn btn-secondary"
              href={`/${adminPath}/m/filters-for-shop/collections/${collection.id}/intro`}
              target="_blank"
              rel="noreferrer"
            >
              Design the intro
            </a>
            <label style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', fontSize: '0.8125rem' }}>
              <input
                type="checkbox"
                checked={collection.noindex}
                disabled={busy}
                onChange={(e) => void send(`${BASE}/collections/${collection.id}`, 'PUT', { noindex: e.target.checked })}
              />
              Keep this page out of search engines
            </label>
            <button className="btn btn-secondary" style={{ marginLeft: 'auto' }} disabled={busy} onClick={() => void remove()}>Delete</button>
          </div>

          <div>
            <h3 style={{ fontSize: '0.9375rem', margin: '0 0 0.5rem' }}>Ticked on arrival</h3>
            <p style={{ margin: '0 0 0.75rem', fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>
              Shoppers can untick any of it, exactly as on the ordinary category page. A filter nothing on the page
              matches is quietly left off rather than ticked into an empty grid.
            </p>
            {groups.map((group) => (
              <div key={group.id} style={{ marginBottom: '0.75rem' }}>
                <strong style={{ fontSize: '0.8125rem' }}>{group.name}</strong>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                  {group.filters.map((filter) => {
                    const on = picked.has(filter.id)
                    return (
                      <button
                        key={filter.id}
                        type="button"
                        disabled={busy}
                        onClick={() => void toggleFilter(filter.id)}
                        aria-pressed={on}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          padding: '0.25rem 0.6rem',
                          borderRadius: 999,
                          cursor: 'pointer',
                          font: 'inherit',
                          fontSize: '0.8125rem',
                          border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: on ? 'var(--color-primary)' : 'var(--color-bg-subtle)',
                          color: on ? 'var(--color-on-primary, #fff)' : 'var(--color-text)',
                        }}
                      >
                        <SwatchDot swatch={filter.swatch} />
                        {filter.label}
                      </button>
                    )
                  })}
                  {group.filters.length === 0 && (
                    <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-secondary)' }}>nothing in this group yet</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
