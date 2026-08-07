'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { facetCount, matchesSelection, pickSwapFilters, type FltSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import { isImageSwatch, type FltControlType } from '@/modules/filters-for-shop/lib/types'
import { FLT_SORT_OPTIONS, isFltSortValue, sortProductIds, type FltSortKey, type FltSortValue } from '@/modules/filters-for-shop/lib/sort'
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
  // product id -> the figures the sort dropdown orders on. Resolved server-side
  // from the same numbers the cards print. Absent entries simply never sort.
  sortKeys: Record<string, FltSortKey>
  // Whether the sort dropdown is offered at all (a Puck field on the block).
  showSort: boolean
  columns: number
  position: 'left' | 'top'
  showCounts: boolean
  swapImages: boolean
  preselectOnClick: boolean
  // The site's tablet breakpoint (a CSS length), so the shell knows when the
  // panel is the overlay sheet rather than the always-visible sidebar - the
  // sheet needs dialog semantics, a scroll lock and focus handling that would
  // be wrong on desktop.
  tabletBp: string
  // Server-rendered cards, stamped with the shop's own Product Card layout and
  // tagged data-flt-product. They are shown, hidden and re-dressed in place -
  // never re-rendered - so the card design stays the shop's own.
  children: React.ReactNode
}

// A tick list longer than this collapses behind "Show all" - long enough that
// most groups never fold, short enough that a 40-entry group doesn't bury the
// ones below it. Lists only just over the line stay unfolded: hiding two
// entries behind a button is more taps than it saves.
const TICK_FOLD_LIMIT = 8
const TICK_FOLD_SLACK = 2

// The query-string key the sort writes to. An admin group already using ?sort=
// keeps it - the sort steps aside rather than fighting over it, exactly as the
// synthetic Category group does over ?category=.
function sortParamFor(groups: FltPublicGroup[]): string {
  return groups.some((g) => g.slug === 'sort') ? 'order-by' : 'sort'
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

// Re-dress one card for the ticked filters: show the matching variations'
// photos and point the link at the first match's own page (which opens the
// parent product with those options already chosen).
//
// Cards with shop's carousel island (`.shop-card-media`) get the polite version:
// the allowed variation ids go into `data-shop-media-sources` on the card and a
// `shop:card-media-sources` event tells the island to re-read - shop's contract
// for exactly this. The island then shows the first ticked colour, lets the
// arrows flick between the ticked ones only, and holds its hover-swap. Writing
// the <img> src directly there would be undone by the island's next render
// (hover did precisely that before this seam existed).
//
// Cards with a plain server-rendered <img> (single photo, no island) keep the
// direct src swap. Originals are parked in data attributes on first touch so
// unticking restores them exactly.
function dressCard(el: HTMLElement, swapList: FltSwap[], swapImages: boolean, preselect: boolean) {
  const primary = swapList[0] ?? null
  // The card's navigation anchor: the wrapper itself on the old anchor-shaped
  // card, the stretched `.shop-card-link` sibling on the current wrapper.
  const link = el instanceof HTMLAnchorElement ? el : el.querySelector<HTMLAnchorElement>('a.shop-card-link')
  if (link && preselect) {
    if (link.dataset.fltHref === undefined) link.dataset.fltHref = link.getAttribute('href') ?? ''
    link.setAttribute('href', primary ? primary.href : link.dataset.fltHref)
  }
  if (!swapImages) return
  if (el.querySelector('.shop-card-media')) {
    const ids = swapList.map((s) => s.sourceId).filter(Boolean)
    if (ids.length > 0) el.setAttribute('data-shop-media-sources', ids.join(' '))
    else el.removeAttribute('data-shop-media-sources')
    el.dispatchEvent(new CustomEvent('shop:card-media-sources'))
    return
  }
  const img = el.querySelector('img')
  if (!img) return
  if (img.dataset.fltSrc === undefined) {
    img.dataset.fltSrc = img.getAttribute('src') ?? ''
    img.dataset.fltSrcset = img.getAttribute('srcset') ?? ''
  }
  if (primary?.image) {
    // srcset would outrank the swapped src, so it goes while the swap is on.
    img.removeAttribute('srcset')
    img.setAttribute('src', primary.image)
  } else {
    img.setAttribute('src', img.dataset.fltSrc)
    if (img.dataset.fltSrcset) img.setAttribute('srcset', img.dataset.fltSrcset)
    else img.removeAttribute('srcset')
  }
}

export function FilterShell({ groups, matrix, swaps, sortKeys, showSort, columns, position, showCounts, swapImages, preselectOnClick, tabletBp, children }: FilterShellProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const scrollToResultsRef = useRef(false)
  // The order the server handed the cards over in, captured before the first
  // re-order so "Recommended" can always put them back.
  const serverOrderRef = useRef<string[] | null>(null)
  const hasSortedRef = useRef(false)
  const [selected, setSelected] = useState<FltSelection>(new Map())
  const [sort, setSort] = useState<FltSortValue>('')
  const [visibleCount, setVisibleCount] = useState<number | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set())
  const [unfoldedGroups, setUnfoldedGroups] = useState<Set<string>>(new Set())
  // Whether the viewport is at or below the tablet breakpoint, i.e. the panel
  // renders as the overlay sheet. Dialog semantics and the scroll lock hang off
  // this, never off CSS alone. False on the server and first paint - the sheet
  // is closed then anyway.
  const [isSheet, setIsSheet] = useState(false)

  const sortParam = useMemo(() => sortParamFor(groups), [groups])

  // Read the URL only after mount: the cards are server-rendered and must not
  // depend on the query string, or the markup would mismatch on hydration.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- URL is only readable post-mount; seeding during render would mismatch the server-rendered cards
    setSelected(readInitialSelection(groups))
    const raw = new URLSearchParams(window.location.search).get(sortParam) ?? ''
    // Anything else in the query string is ignored rather than honoured: the
    // dropdown must never offer an order the shopper cannot see it is in.
    if (isFltSortValue(raw)) setSort(raw)
  }, [groups, sortParam])

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${tabletBp})`)
    const apply = () => {
      setIsSheet(mq.matches)
      if (!mq.matches) setDrawerOpen(false)
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [tabletBp])

  // While the sheet is open: lock the page scroll behind it, close on Escape,
  // and hand focus to the sheet - returning both on close. The lock pins the
  // body with position:fixed at its current offset rather than overflow:hidden,
  // which would clamp the scroll position to the top and lose the shopper's
  // place in the grid. On close the place is put back - unless the apply
  // button asked to land on the results instead.
  useEffect(() => {
    if (!drawerOpen || !isSheet) return
    const fab = fabRef.current
    const resultsEl = resultsRef.current
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const scrollY = window.scrollY
    const { position, top, left, right, width } = document.body.style
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.left = '0'
    document.body.style.right = '0'
    document.body.style.width = '100%'
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false)
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.position = position
      document.body.style.top = top
      document.body.style.left = left
      document.body.style.right = right
      document.body.style.width = width
      // Instant, never smooth: the site's scroll-behavior would animate these,
      // and a queued smooth scroll is silently cancelled by the very layout
      // work this cleanup causes - the page would stay at the top instead.
      window.scrollTo({ top: scrollY, left: 0, behavior: 'instant' })
      document.removeEventListener('keydown', onKey)
      if (scrollToResultsRef.current) {
        scrollToResultsRef.current = false
        if (resultsEl && resultsEl.getBoundingClientRect().top < 0) resultsEl.scrollIntoView({ block: 'start', behavior: 'instant' })
      }
      if (previous) previous.focus()
      else fab?.focus()
    }
  }, [drawerOpen, isSheet])

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
      const swapFilterIds = ok ? pickSwapFilters(matched, selected, orderedGroups) : []
      const swapList = swapFilterIds
        .map((id) => swaps[productId]?.[id])
        .filter((s): s is FltSwap => s != null)
      dressCard(el, swapList, swapImages, preselectOnClick)
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
    // One writer for the whole query string: the sort rides along with the
    // ticks so a shared link carries both, and the shop's own order leaves no
    // trace behind at all.
    if (sort) params.set(sortParam, sort)
    else params.delete(sortParam)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
  }, [selected, matrix, groups, orderedGroups, swaps, swapImages, preselectOnClick, sort, sortParam])

  // Re-order the server-rendered cards in place for the chosen sort. Real DOM
  // moves, not CSS `order`: the cards carry links and carousel buttons, and a
  // visual order that disagreed with the tab order would fail focus order.
  // Safe to move them under React because `children` is a stable server-passed
  // node - React never re-reconciles it, so it never puts them back.
  useEffect(() => {
    const root = gridRef.current
    if (!root) return
    // Nothing to do on the default order until something has actually moved.
    if (!sort && !hasSortedRef.current) return
    hasSortedRef.current = true
    const cards = new Map<string, HTMLElement>()
    for (const el of root.querySelectorAll<HTMLElement>(':scope > [data-flt-product]')) {
      cards.set(el.dataset.fltProduct ?? '', el)
    }
    if (serverOrderRef.current === null) serverOrderRef.current = [...cards.keys()]
    const frag = document.createDocumentFragment()
    for (const id of sortProductIds(serverOrderRef.current, sortKeys, sort)) {
      const el = cards.get(id)
      if (el) frag.appendChild(el)
    }
    root.appendChild(frag)
  }, [sort, sortKeys])

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

  function toggleUnfolded(groupId: string) {
    setUnfoldedGroups((prev) => {
      const next = new Set(prev)
      if (next.has(groupId)) next.delete(groupId)
      else next.add(groupId)
      return next
    })
  }

  // Close the sheet and bring the results back on screen: the shopper has been
  // reading the sheet, and the grid they just filtered may be scrolled away.
  // The scroll itself happens in the lock effect's cleanup, after the body is
  // unpinned - scrolling here would race the restore and lose.
  const applyAndClose = useCallback(() => {
    scrollToResultsRef.current = true
    setDrawerOpen(false)
  }, [])

  // Keep Tab inside the open sheet - a light trap, matching dialog behaviour.
  const trapTab = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab' || !drawerRef.current) return
    const focusables = drawerRef.current.querySelectorAll<HTMLElement>(
      'button, input, select, [tabindex]:not([tabindex="-1"])',
    )
    const first = focusables[0]
    const last = focusables[focusables.length - 1]
    if (!first || !last) return
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault()
      last.focus()
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault()
      first.focus()
    }
  }, [])

  const activeCount = [...selected.values()].reduce((n, s) => n + s.size, 0)
  const totalCount = matrixEntries.length || null
  const shownGroups = groups.filter((g) => g.filters.length > 0)

  const grid = (
    <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties} ref={gridRef}>
      {children}
    </div>
  )

  // The count only earns its line once something is ticked - before that
  // "Showing 24 of 24" is noise.
  const showingLine =
    activeCount > 0 && visibleCount !== null && totalCount !== null ? (
      <p className="flt-showing" role="status">Showing {visibleCount} of {totalCount}</p>
    ) : null
  // No sort keys means no product on the page has anything to sort on, so the
  // dropdown would be a control that does nothing.
  const sortControl = showSort && Object.keys(sortKeys).length > 0 ? (
    <label className="flt-sort">
      <span className="flt-sort-label">Sort by</span>
      <select
        className="flt-sort-select"
        value={sort}
        onChange={(e) => setSort(isFltSortValue(e.target.value) ? e.target.value : '')}
      >
        {FLT_SORT_OPTIONS.map((option) => (
          <option key={option.value || 'recommended'} value={option.value}>{option.label}</option>
        ))}
      </select>
    </label>
  ) : null
  // The count sits left, the sort right - and the row survives either one being
  // absent, so the sort never drifts across the page when the ticks clear.
  const toolbar = showingLine || sortControl ? (
    <div className="flt-toolbar">
      {showingLine ?? <span />}
      {sortControl}
    </div>
  ) : null

  // No filter groups worth offering: the grid still gets its sort, just without
  // the panel and the two-column wrap around it.
  if (shownGroups.length === 0) {
    if (!toolbar) return grid
    return (
      <div className="flt-results" ref={resultsRef}>
        {toolbar}
        {grid}
      </div>
    )
  }

  const count = (filterId: string, groupId: string) => facetCount(filterId, groupId, matrixEntries, selected)

  const chips = activeCount > 0 && (
    <div className="flt-chips">
      {[...selected.entries()].flatMap(([groupId, filterIds]) =>
        [...filterIds].map((filterId) => {
          const found = filterById.get(filterId)
          if (!found) return null
          return (
            <button
              key={filterId}
              type="button"
              className="flt-chip"
              aria-label={`Remove filter ${found.group.name}: ${found.filter.label}`}
              onClick={() => toggle(groupId, filterId)}
            >
              {found.filter.label}
              <span className="flt-chip-x" aria-hidden>×</span>
            </button>
          )
        }),
      )}
      <button type="button" className="flt-clear" onClick={() => setSelected(new Map())}>Clear all</button>
    </div>
  )

  const shownProducts = visibleCount ?? totalCount ?? 0

  return (
    <div className={`flt-wrap flt-pos-${position}`}>
      <aside className="flt-panel" aria-label="Filter products">
        <div className="flt-head">
          <h2 className="flt-title">Filter</h2>
          {activeCount > 0 && (
            <button type="button" className="flt-clear" onClick={() => setSelected(new Map())}>
              Clear{activeCount > 1 ? ` (${activeCount})` : ''}
            </button>
          )}
        </div>

        {/* Overlay-mode entry point: a floating pill, reachable however far the
            grid has been scrolled - the sheet itself carries the panel then. */}
        <button
          type="button"
          className="flt-fab"
          ref={fabRef}
          aria-expanded={drawerOpen}
          onClick={() => setDrawerOpen(true)}
        >
          <svg className="flt-fab-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M22 3H2l8 9.46V19l4 2v-8.54L22 3z" />
          </svg>
          Filter
          {activeCount > 0 && <span className="flt-fab-badge">{activeCount}</span>}
        </button>

        <div
          className={`flt-scrim${drawerOpen ? ' is-open' : ''}`}
          onClick={() => setDrawerOpen(false)}
          aria-hidden
        />

        <div
          className={`flt-drawer${drawerOpen ? ' is-open' : ''}`}
          ref={drawerRef}
          role={isSheet ? 'dialog' : undefined}
          aria-modal={isSheet && drawerOpen ? true : undefined}
          aria-label={isSheet ? 'Filter products' : undefined}
          onKeyDown={isSheet && drawerOpen ? trapTab : undefined}
        >
          <div className="flt-sheet-head">
            <h2 className="flt-title">Filter</h2>
            <button type="button" className="flt-sheet-close" ref={closeRef} onClick={() => setDrawerOpen(false)} aria-label="Close filters">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flt-sheet-body">
            {shownGroups.map((group) => {
              const closed = closedGroups.has(group.id)
              const bodyId = `flt-body-${group.id}`
              const pickedInGroup = selected.get(group.id)?.size ?? 0
              const foldable = group.controlType === 'CHECKBOX' && group.filters.length > TICK_FOLD_LIMIT + TICK_FOLD_SLACK
              const unfolded = !foldable || unfoldedGroups.has(group.id)
              // A folded list still shows every ticked entry, wherever it sits
              // in the owner's order - a tick must never vanish behind the fold.
              const tickFilters = unfolded
                ? group.filters
                : group.filters.filter((f, i) => i < TICK_FOLD_LIMIT || (selected.get(group.id)?.has(f.id) ?? false))
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
                      <span className="flt-group-name">
                        {group.name}
                        {pickedInGroup > 0 && <span className="flt-group-badge">{pickedInGroup}</span>}
                      </span>
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
                        {tickFilters.map((filter) => {
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
                        {foldable && (
                          <button type="button" className="flt-fold" aria-expanded={unfolded} onClick={() => toggleUnfolded(group.id)}>
                            {unfolded ? 'Show fewer' : `Show all (${group.filters.length})`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </fieldset>
              )
            })}
          </div>

          <div className="flt-sheet-foot">
            <button
              type="button"
              className="flt-foot-clear"
              onClick={() => setSelected(new Map())}
              disabled={activeCount === 0}
            >
              Clear all
            </button>
            <button type="button" className="flt-foot-apply" onClick={applyAndClose}>
              {shownProducts === 0 ? 'Nothing matches' : `Show ${shownProducts} ${shownProducts === 1 ? 'product' : 'products'}`}
            </button>
          </div>
        </div>
      </aside>

      <div className="flt-results" ref={resultsRef}>
        {chips}
        {toolbar}
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
