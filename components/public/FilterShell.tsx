'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { facetCount, matchesSelection, pickSwapFilter, type FltSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import { isImageSwatch, type FltControlType } from '@/modules/filters-for-shop/lib/types'
import type { FltSwap } from '@/modules/filters-for-shop/lib/db/matching'

// The serialisable shape the RSC half hands over: no rules, no positions - just
// what the storefront needs to draw and to write the query string.
export type FltPublicFilter = { id: string; label: string; slug: string; swatch: string | null }
export type FltPublicGroup = { id: string; name: string; slug: string; controlType: FltControlType; filters: FltPublicFilter[] }

export type FilterShellProps = {
  groups: FltPublicGroup[]
  // product id -> filter ids it matches (via its enabled variations).
  matrix: Record<string, string[]>
  // product id -> filter id -> the variation the card borrows when that filter
  // is ticked: its photo, and its own deep link (which pre-selects the options).
  swaps: Record<string, Record<string, FltSwap>>
  columns: number
  position: 'left' | 'top'
  showCounts: boolean
  swapImages: boolean
  preselectOnClick: boolean
  // Server-rendered cards, stamped with the shop's own Product Card layout and
  // tagged data-flt-product. They are shown, hidden and re-dressed in place -
  // never re-rendered - so the card design stays the shop's own.
  children: React.ReactNode
}

function readInitialSelection(groups: FltPublicGroup[]): FltSelection {
  const selected: FltSelection = new Map()
  if (typeof window === 'undefined') return selected
  const params = new URLSearchParams(window.location.search)
  for (const group of groups) {
    const raw = params.get(group.slug)
    if (!raw) continue
    const slugs = new Set(raw.split(',').filter(Boolean))
    const ids = group.filters.filter((f) => slugs.has(f.slug)).map((f) => f.id)
    if (ids.length > 0) selected.set(group.id, new Set(ids))
  }
  return selected
}

// Re-dress one card for the ticked filter: swap the picture to the matching
// variation's photo and point the link at that variation's own page (which
// opens the parent product with those options already chosen). Originals are
// parked in data attributes on first touch so unticking restores them exactly.
function dressCard(el: HTMLElement, swap: FltSwap | null, swapImages: boolean, preselect: boolean) {
  if (el instanceof HTMLAnchorElement && preselect) {
    if (el.dataset.fltHref === undefined) el.dataset.fltHref = el.getAttribute('href') ?? ''
    el.setAttribute('href', swap ? swap.href : el.dataset.fltHref)
  }
  if (!swapImages) return
  const img = el.querySelector('img')
  if (!img) return
  if (img.dataset.fltSrc === undefined) {
    img.dataset.fltSrc = img.getAttribute('src') ?? ''
    img.dataset.fltSrcset = img.getAttribute('srcset') ?? ''
  }
  if (swap?.image) {
    // srcset would outrank the swapped src, so it goes while the swap is on.
    img.removeAttribute('srcset')
    img.setAttribute('src', swap.image)
  } else {
    img.setAttribute('src', img.dataset.fltSrc)
    if (img.dataset.fltSrcset) img.setAttribute('srcset', img.dataset.fltSrcset)
    else img.removeAttribute('srcset')
  }
}

export function FilterShell({ groups, matrix, swaps, columns, position, showCounts, swapImages, preselectOnClick, children }: FilterShellProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const [selected, setSelected] = useState<FltSelection>(new Map())
  const [visibleCount, setVisibleCount] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set())

  // Read the URL only after mount: the cards are server-rendered and must not
  // depend on the query string, or the markup would mismatch on hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL is only readable post-mount; seeding during render would mismatch the server-rendered cards
    setSelected(readInitialSelection(groups))
  }, [groups])

  const matrixEntries = useMemo(() => Object.entries(matrix), [matrix])
  const orderedGroups = useMemo(
    () => groups.map((g) => ({ id: g.id, filterIds: g.filters.map((f) => f.id) })),
    [groups],
  )
  const filterById = useMemo(() => {
    const map = new Map<string, { group: FltPublicGroup; filter: FltPublicFilter }>()
    for (const group of groups) for (const filter of group.filters) map.set(filter.id, { group, filter })
    return map
  }, [groups])

  // Show/hide and re-dress the server-rendered cards in place, then mirror the
  // selection into the URL so a filtered view can be shared or reached with the
  // back button. replaceState (not a router push) keeps the server out of it.
  useEffect(() => {
    const root = gridRef.current
    if (!root) return
    let shown = 0
    for (const el of root.querySelectorAll<HTMLElement>('[data-flt-product]')) {
      const productId = el.dataset.fltProduct ?? ''
      const matched = matrix[productId] ?? []
      const ok = matchesSelection(matched, selected)
      el.style.display = ok ? '' : 'none'
      el.toggleAttribute('data-flt-hidden', !ok)
      if (ok) shown++
      const swapFilterId = ok ? pickSwapFilter(matched, selected, orderedGroups) : null
      const swap = swapFilterId ? (swaps[productId]?.[swapFilterId] ?? null) : null
      dressCard(el, swap, swapImages, preselectOnClick)
    }
    setVisibleCount(shown)

    const params = new URLSearchParams(window.location.search)
    for (const group of groups) params.delete(group.slug)
    for (const [groupId, filterIds] of selected) {
      if (filterIds.size === 0) continue
      const group = groups.find((g) => g.id === groupId)
      if (!group) continue
      const slugs = group.filters.filter((f) => filterIds.has(f.id)).map((f) => f.slug)
      if (slugs.length > 0) params.set(group.slug, slugs.join(','))
    }
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [selected, matrix, groups, orderedGroups, swaps, swapImages, preselectOnClick])

  function toggle(groupId: string, filterId: string) {
    setSelected((prev) => {
      const next = new Map(prev)
      const set = new Set(next.get(groupId) ?? [])
      if (set.has(filterId)) set.delete(filterId)
      else set.add(filterId)
      if (set.size === 0) next.delete(groupId)
      else next.set(groupId, set)
      return next
    })
  }

  function selectOnly(groupId: string, filterId: string | '') {
    setSelected((prev) => {
      const next = new Map(prev)
      if (!filterId) next.delete(groupId)
      else next.set(groupId, new Set([filterId]))
      return next
    })
  }

  function toggleGroupOpen(groupId: string) {
    setClosedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  const activeCount = [...selected.values()].reduce((n, s) => n + s.size, 0)
  const totalCount = matrixEntries.length || null
  const shownGroups = groups.filter((g) => g.filters.length > 0)

  const grid = (
    <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties} ref={gridRef}>
      {children}
    </div>
  )
  if (shownGroups.length === 0) return grid

  const count = (filterId: string, groupId: string) => facetCount(filterId, groupId, matrixEntries, selected)

  const chips = activeCount > 0 && (
    <div className="flt-chips">
      {[...selected.entries()].flatMap(([groupId, filterIds]) =>
        [...filterIds].map((filterId) => {
          const found = filterById.get(filterId)
          if (!found) return null
          return (
            <button key={filterId} type="button" className="flt-chip" onClick={() => toggle(groupId, filterId)}>
              {found.filter.label}
              <span className="flt-chip-x" aria-hidden>×</span>
            </button>
          )
        }),
      )}
      <button type="button" className="flt-clear" onClick={() => setSelected(new Map())}>Clear all</button>
    </div>
  )

  return (
    <div className={`flt-wrap flt-pos-${position}`}>
      <aside className={`flt-panel${drawerOpen ? ' is-open' : ''}`} aria-label="Filter products">
        <div className="flt-head">
          <h2 className="flt-title">Filter</h2>
          {activeCount > 0 && (
            <button type="button" className="flt-clear" onClick={() => setSelected(new Map())}>
              Clear{activeCount > 1 ? ` (${activeCount})` : ''}
            </button>
          )}
        </div>
        <button
          type="button"
          className="flt-toggle"
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen((v) => !v)}
        >
          {drawerOpen ? 'Hide filters' : 'Show filters'}
          {activeCount > 0 && <span className="flt-toggle-badge">{activeCount}</span>}
        </button>

        <div className="flt-drawer">
          {shownGroups.map((group) => {
            const closed = closedGroups.has(group.id)
            const bodyId = `flt-body-${group.id}`
            return (
              <fieldset key={group.id} className={`flt-group${closed ? ' is-closed' : ''}`}>
                <legend style={{ display: 'contents' }}>
                  <button
                    type="button"
                    className="flt-group-head"
                    aria-expanded={!closed}
                    aria-controls={bodyId}
                    onClick={() => toggleGroupOpen(group.id)}
                  >
                    {group.name}
                    <span className="flt-chevron" aria-hidden />
                  </button>
                </legend>
                <div className="flt-group-body" id={bodyId}>
                  {group.controlType === 'DROPDOWN' ? (
                    <select
                      className="flt-select"
                      value={[...(selected.get(group.id) ?? [])][0] ?? ''}
                      onChange={(e) => selectOnly(group.id, e.target.value)}
                      aria-label={group.name}
                    >
                      <option value="">Any</option>
                      {group.filters.map((filter) => (
                        <option key={filter.id} value={filter.id}>
                          {filter.label}{showCounts ? ` (${count(filter.id, group.id)})` : ''}
                        </option>
                      ))}
                    </select>
                  ) : group.controlType === 'IMAGE' ? (
                    <div className="flt-images">
                      {group.filters.map((filter) => {
                        const on = selected.get(group.id)?.has(filter.id) ?? false
                        const n = count(filter.id, group.id)
                        const picture = filter.swatch && isImageSwatch(filter.swatch) ? filter.swatch : null
                        return (
                          <button
                            key={filter.id}
                            type="button"
                            className={`flt-image${on ? ' is-on' : ''}${n === 0 && !on ? ' is-dead' : ''}`}
                            aria-pressed={on}
                            title={showCounts ? `${filter.label} (${n})` : filter.label}
                            onClick={() => toggle(group.id, filter.id)}
                          >
                            {picture ? (
                              // eslint-disable-next-line @next/next/no-img-element -- media library URLs are arbitrary remote hosts, not a configured next/image loader
                              <img className="flt-image-pic" src={picture} alt="" loading="lazy" />
                            ) : (
                              <span className="flt-image-pic flt-image-blank" aria-hidden />
                            )}
                            <span className="flt-image-label">{filter.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : group.controlType === 'SWATCH' ? (
                    <div className="flt-swatches">
                      {group.filters.map((filter) => {
                        const on = selected.get(group.id)?.has(filter.id) ?? false
                        const n = count(filter.id, group.id)
                        const swatch = filter.swatch
                        const dotStyle = swatch
                          ? isImageSwatch(swatch)
                            ? { backgroundImage: `url("${swatch}")` }
                            : { background: swatch }
                          : { background: 'var(--color-bg-subtle)' }
                        return (
                          <button
                            key={filter.id}
                            type="button"
                            className={`flt-swatch${on ? ' is-on' : ''}${n === 0 && !on ? ' is-dead' : ''}`}
                            aria-pressed={on}
                            title={showCounts ? `${filter.label} (${n})` : filter.label}
                            onClick={() => toggle(group.id, filter.id)}
                          >
                            <span className="flt-swatch-dot" style={dotStyle} aria-hidden />
                            <span className="flt-swatch-label">{filter.label}</span>
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="flt-ticks">
                      {group.filters.map((filter) => {
                        const n = count(filter.id, group.id)
                        const on = selected.get(group.id)?.has(filter.id) ?? false
                        return (
                          <label key={filter.id} className={`flt-tick${n === 0 && !on ? ' is-dead' : ''}`}>
                            <input type="checkbox" checked={on} onChange={() => toggle(group.id, filter.id)} />
                            <span>{filter.label}</span>
                            {showCounts && <span className="flt-count">{n}</span>}
                          </label>
                        )
                      })}
                    </div>
                  )}
                </div>
              </fieldset>
            )
          })}
        </div>
      </aside>

      <div className="flt-results">
        {chips}
        {activeCount > 0 && visibleCount !== null && totalCount !== null && (
          <p className="flt-showing">Showing {visibleCount} of {totalCount}</p>
        )}
        {grid}
        {visibleCount === 0 && (
          <p className="flt-empty">
            Nothing matches those filters.{' '}
            <button type="button" className="flt-clear" onClick={() => setSelected(new Map())}>Clear them</button> and try again.
          </p>
        )}
      </div>
    </div>
  )
}
