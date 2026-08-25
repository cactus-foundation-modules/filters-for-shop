'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { facetCount, matchesSelection, pickSwapFilters, type FltMatrixEntry, type FltSelection } from '@/modules/filters-for-shop/lib/filter-logic'
import { applySelectionToParams, preselectByGroup, selectionFromParams } from '@/modules/filters-for-shop/lib/preselect'
import { isImageSwatch, type FltControlType } from '@/modules/filters-for-shop/lib/types'
import { FLT_SORT_OPTIONS, FLT_SORT_RECOMMENDED_PARAM, isFltSortValue, sortProductIds, sortValueFromParam, type FltSortKey, type FltSortValue } from '@/modules/filters-for-shop/lib/sort'
import type { FltSwap } from '@/modules/filters-for-shop/lib/db/matching'

// The serialisable shape the RSC half hands over: no rules, no positions - just
// what the storefront needs to draw and to write the query string.
export type FltPublicFilter = { id: string; label: string; slug: string; swatch: string | null }
export type FltPublicGroup = { id: string; name: string; slug: string; controlType: FltControlType; filters: FltPublicFilter[] }

// Which filters each enabled variation resolves, interned. Filter ids appear
// once in `filterIds`, each distinct combination once in `combos`, and a
// product names the combinations it has by index.
//
// Interned because it is otherwise enormous: a whole-catalogue page carries
// tens of thousands of variations, and spelling the ids out per variation would
// put about a megabyte of repeated UUIDs into the HTML. Folded like this the
// same page is well under a tenth of that.
export type FltVariationIndex = {
  filterIds: string[]
  combos: number[][]
  byProduct: Record<string, number[]>
}

export type FilterShellProps = {
  groups: FltPublicGroup[]
  // product id -> filter ids it matches (via its enabled variations).
  matrix: Record<string, string[]>
  // The finer answer to the same question: which filters each single variation
  // resolves. Without it "Red" and "Leather" only have to be true somewhere on
  // the listing, so a chair sold in red fabric and in black leather counts as a
  // red leather chair. Absent on a shop with no variations module.
  variations?: FltVariationIndex
  // product id -> filter id -> the variation the card borrows when that filter
  // is ticked: its photo, and its own deep link (which pre-selects the options).
  swaps: Record<string, Record<string, FltSwap>>
  // product id -> the figures the sort dropdown orders on. Resolved server-side
  // from the same numbers the cards print. Absent entries simply never sort.
  sortKeys: Record<string, FltSortKey>
  // Whether the sort dropdown is offered at all (a Puck field on the block).
  showSort: boolean
  // The order the grid starts in, before the shopper touches the dropdown (a
  // Puck field on the block). The server has ALREADY rendered the cards in it,
  // so this is only what the dropdown is set to and what the query string
  // counts as untouched - never a re-order the shopper watches happen.
  defaultSort?: FltSortValue
  // The shop's own order of the product ids, i.e. what "Recommended" means -
  // handed over rather than read off the cards, because the cards may well
  // arrive already sorted into `defaultSort` and reading THAT back would make
  // the two options the same order.
  serverOrder?: string[]
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
  // Paging over whatever the filters have left. 'none' is what the shell did
  // before this existed: every matching card on screen at once.
  //
  // It has to live in here rather than around the outside, because the set being
  // paged is the FILTERED set - a pager wrapping the shell would page the raw
  // server list and then the filters would punch holes in each page.
  // 'scroll' is 'more' that presses its own button - same window, same handler,
  // triggered by a sentinel coming into view. The button stays either way: an
  // observer is unreachable by keyboard, invisible to a screen reader, and does
  // nothing where the page never scrolls (a filtered list of nine).
  paginate?: 'none' | 'more' | 'pages' | 'scroll'
  pageSize?: number
  moreLabel?: string
  // On-demand paging. Present means `children` is the FIRST PAGE of cards, not
  // all of them, and this fetches the rest from the server as the shopper
  // reaches them - the same cards, built by the same helpers, arriving as React
  // nodes rather than as markup so their carousels and overlays still hydrate.
  //
  // Absent is every grid that came before: every matching card already in hand,
  // shown and hidden in place. Both paths run the same passes below; the only
  // difference is whether a card the window wants is already in the DOM.
  loadCards?: (ids: string[]) => Promise<React.ReactNode[]>
  // Which products `children` already holds cards for. Only meaningful beside
  // loadCards, and named rather than counted because the first page is the
  // PRESELECT-matching window, which is not the first N of `serverOrder`.
  renderedIds?: string[]
  // Filter ids that arrive already ticked, on a filter collection page built
  // around them ("Green Office Chairs" is Colour=Green ticked on arrival). Empty
  // on every ordinary category, collection and tag page, where this whole
  // mechanism is inert.
  //
  // A starting point, not a lock: the controls are the same controls and the
  // shopper can clear any of it.
  preselect?: string[]
}

// A tick list longer than this collapses behind "Show all" - long enough that
// most groups never fold, short enough that a 40-entry group doesn't bury the
// ones below it. Lists only just over the line stay unfolded: hiding two
// entries behind a button is more taps than it saves.
const EMPTY_VARIATIONS: FltVariationIndex = { filterIds: [], combos: [], byProduct: {} }

const TICK_FOLD_LIMIT = 8
const TICK_FOLD_SLACK = 2

// The query-string key the sort writes to. An admin group already using ?sort=
// keeps it - the sort steps aside rather than fighting over it, exactly as the
// synthetic Category group does over ?category=.
function sortParamFor(groups: FltPublicGroup[]): string {
  return groups.some((g) => g.slug === 'sort') ? 'order-by' : 'sort'
}

// First, last and a window either side of where the shopper is - the same shape
// shop's own grid pager uses, kept here rather than imported so this module owns
// its own UI and does not reach into shop's internals for a list of numbers.
export function filterPageNumbers(current: number, last: number): (number | '\u2026')[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)
  const out: (number | '\u2026')[] = [1]
  const from = Math.max(2, current - 1)
  const to = Math.min(last - 1, current + 1)
  if (from > 2) out.push('\u2026')
  for (let n = from; n <= to; n++) out.push(n)
  if (to < last - 1) out.push('\u2026')
  out.push(last)
  return out
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

// useLayoutEffect where there is a DOM, useEffect where there is not.
//
// EVERY pass that writes to the cards uses this - filter, sort and paging alike -
// and they must all use the SAME one. React runs ALL layout effects before ANY
// passive effect, so mixing the two silently reorders them however they are
// declared: paging as a layout effect beside a passive filter pass ran FIRST,
// and the filter pass then cleared `display` on its way past and put every card
// back on screen. That shipped, and the live category page duly showed all 214
// chairs at once with 190 of them still marked off-page.
//
// So the rule is: same phase for all three, and declaration order decides the
// rest. The observer below is deliberately NOT one of these - it only attaches a
// listener and has no business blocking paint.
//
// The phase is `layout` rather than passive because these passes have to land
// before the browser paints. After paint, a category of 217 drew all 217 cards
// and then hid 193 - a visible flash with the scrollbar jumping under the
// shopper's hand.
//
// React warns if useLayoutEffect is called during a server render, and this
// component IS server-rendered, so the choice is made once here rather than
// suppressed at the call site.
const useIsomorphicLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect

export function FilterShell({ groups, matrix, variations = EMPTY_VARIATIONS, swaps, sortKeys, showSort, defaultSort = '', serverOrder, columns, position, showCounts, swapImages, preselectOnClick, tabletBp, children, paginate = 'none', pageSize = 24, moreLabel, preselect, loadCards, renderedIds }: FilterShellProps) {
  const gridRef = useRef<HTMLDivElement>(null)
  const resultsRef = useRef<HTMLDivElement>(null)
  const drawerRef = useRef<HTMLDivElement>(null)
  const fabRef = useRef<HTMLButtonElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const scrollToResultsRef = useRef(false)
  // The shop's own order, so "Recommended" can always put the cards back. Seeded
  // from the server where it was passed; otherwise off the DOM on the first
  // re-order, which is the same thing on a grid that starts unsorted.
  const serverOrderRef = useRef<string[] | null>(serverOrder ? [...serverOrder] : null)
  const hasSortedRef = useRef(false)
  const [selected, setSelected] = useState<FltSelection>(new Map())
  const [sort, setSort] = useState<FltSortValue>(defaultSort)
  const [visibleCount, setVisibleCount] = useState<number | null>(null)
  // How many of the matching cards are on screen. 'more' grows this window;
  // 'pages' slides it. Meaningless when paginate is 'none', where the paging
  // effect below returns before touching anything.
  const [shownLimit, setShownLimit] = useState(pageSize)
  const [page, setPage] = useState(1)
  // Whenever the filtered set changes, go back to the top of it. Without this a
  // shopper on page 7 who ticks "Mesh" and cuts the list to nine products lands
  // on an empty grid and concludes the filter is broken.
  //
  // Adjusted during render rather than in an effect - React's own pattern for
  // state that has to follow a change in inputs. An effect would paint the wrong
  // page first and correct it after, which is the flicker this avoids, and would
  // trip react-hooks/set-state-in-effect for exactly that reason.
  const pageResetKey = `${sort}|${[...selected.entries()].map(([g, f]) => `${g}:${[...f].sort().join(',')}`).sort().join('|')}|${pageSize}`
  const [lastResetKey, setLastResetKey] = useState(pageResetKey)
  if (pageResetKey !== lastResetKey) {
    setLastResetKey(pageResetKey)
    setShownLimit(pageSize)
    setPage(1)
  }
  // Cards fetched after the first page, in the order they were asked for. Only
  // ever grows: a card already on the page is never thrown away, because the
  // shopper can tick a filter off again and want it straight back.
  const [extraCards, setExtraCards] = useState<React.ReactNode[]>([])
  const loadedIdsRef = useRef<Set<string>>(new Set(renderedIds ?? []))
  const [cardsFailed, setCardsFailed] = useState(false)
  const [cardsLoading, setCardsLoading] = useState(false)
  const [cardRetry, setCardRetry] = useState(0)
  // The span in flight, so a scroll observer firing four times in a second asks
  // once. A ref, because it has to be true the moment the effect decides.
  const fetchingRef = useRef<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [closedGroups, setClosedGroups] = useState<Set<string>>(new Set())
  const [unfoldedGroups, setUnfoldedGroups] = useState<Set<string>>(new Set())
  // Whether the viewport is at or below the tablet breakpoint, i.e. the panel
  // renders as the overlay sheet. Dialog semantics and the scroll lock hang off
  // this, never off CSS alone. False on the server and first paint - the sheet
  // is closed then anyway.
  const [isSheet, setIsSheet] = useState(false)
  // Whether the query string has been read into state yet. Until it has, the
  // selection is empty because nothing has read the URL - not because the shopper
  // has ticked nothing - and writing that emptiness back over the URL would throw
  // away the very parameters the read is coming for.
  const [urlRead, setUrlRead] = useState(false)

  const sortParam = useMemo(() => sortParamFor(groups), [groups])
  // `preselect` arrives as a fresh array on every server render, so the split is
  // keyed on its contents rather than its identity - otherwise the read effect
  // below would re-run on every render and stamp the starting selection back
  // over whatever the shopper had just ticked.
  const preselectKey = (preselect ?? []).join(',')
  // eslint-disable-next-line react-hooks/exhaustive-deps -- preselectKey is the stable stand-in for `preselect`; see above
  const preselected = useMemo(() => preselectByGroup(groups, preselect ?? []), [groups, preselectKey])

  // Read the URL only after mount: the cards are server-rendered and must not
  // depend on the query string, or the markup would mismatch on hydration.
  //
  // Layout phase, and declared ahead of the mirror below, because the two are in
  // a race the read has to win. React runs EVERY layout effect before ANY passive
  // one, so while this was a passive effect the mirror got there first, wrote the
  // empty starting selection over the query string, and the read then found a
  // bare URL. Every arrival at an already-filtered page - a refresh, the back
  // button from a product, a shared link - came back with the ticks cleared.
  useIsomorphicLayoutEffect(() => {
    // Seeded here rather than during render: the URL is only readable post-mount,
    // and seeding from it during render would mismatch the server-rendered cards.
    setSelected(selectionFromParams(groups, new URLSearchParams(window.location.search), preselected))
    // A missing parameter asks for nothing, and so does one naming an order this
    // dropdown does not offer - the dropdown must never sit in an order the
    // shopper cannot see it is in. Either way the grid stays on its starting
    // sort, which is the order the server already rendered the cards in.
    const asked = sortValueFromParam(new URLSearchParams(window.location.search).get(sortParam))
    if (asked !== null) setSort(asked)
    // Releases the URL mirror below, which must not run before this read.
    setUrlRead(true)
  }, [groups, sortParam, preselected])

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

  // The interned variation detail, read back into filter ids once. The combo
  // rows are shared, so a product holding twenty of them holds twenty
  // references, not twenty copies.
  const combosByProduct = useMemo(() => {
    const rows = variations.combos.map((combo) => combo.map((i) => variations.filterIds[i] ?? ''))
    const out = new Map<string, string[][]>()
    for (const [productId, indices] of Object.entries(variations.byProduct)) {
      out.set(productId, indices.map((i) => rows[i] ?? []))
    }
    return out
  }, [variations])
  const matrixEntries = useMemo<FltMatrixEntry[]>(
    () => Object.entries(matrix).map(([productId, filterIds]) => [productId, filterIds, combosByProduct.get(productId)]),
    [matrix, combosByProduct],
  )
  const orderedGroups = useMemo(
    () => groups.map((g) => ({ id: g.id, filterIds: g.filters.map((f) => f.id) })),
    [groups],
  )

  // ---- Which products, in which order, and which of them are on screen ----
  //
  // Worked out from the data rather than read off the DOM. The passes below
  // still drive the DOM, and did the counting too until on-demand paging
  // existed - but the moment a card can be absent because it has not been
  // fetched yet, "how many match" and "which are missing" are questions only
  // the matrix can answer. Same predicate as the DOM pass (matchesSelection),
  // so the two cannot drift.
  const allIds = useMemo(
    () => serverOrder ?? Object.keys(matrix),
    [serverOrder, matrix],
  )
  const orderedIds = useMemo(() => sortProductIds(allIds, sortKeys, sort), [allIds, sortKeys, sort])
  const matchingIds = useMemo(
    () => orderedIds.filter((id) => matchesSelection(matrix[id] ?? [], selected, combosByProduct.get(id))),
    [orderedIds, matrix, selected, combosByProduct],
  )
  // The window the pager is currently showing, in ids. 'more' and 'scroll' grow
  // it from the top; 'pages' slides it; 'none' is the whole matching set.
  const windowIds = useMemo(() => {
    if (paginate === 'none') return matchingIds
    const size = Math.max(1, Math.floor(pageSize) || 1)
    const growingNow = paginate === 'more' || paginate === 'scroll'
    const from = growingNow ? 0 : (page - 1) * size
    const to = growingNow ? Math.max(size, shownLimit) : from + size
    return matchingIds.slice(from, to)
  }, [matchingIds, paginate, pageSize, page, shownLimit])

  // Fetch whatever the window is missing. Gated on `urlRead` so it never fires
  // against a provisional selection: until the query string has been read the
  // ticks are empty because nothing has looked, not because the shopper chose
  // nothing, and a page arriving already filtered would otherwise fetch a
  // window of the unfiltered list first and throw it away.
  useEffect(() => {
    if (!loadCards || !urlRead) return
    // One page's worth per call, whatever the window asks for. A shopper who
    // presses "Show more" twice while the first batch is still coming, or lands
    // straight on page nine of a filtered list, can want more than one page at
    // once - and the server function caps what it will render anyway, so asking
    // for more than that would quietly drop the tail. Capped here instead, and
    // the effect re-runs as each batch lands (extraCards is a dependency), so a
    // deep jump fills in over a few calls rather than half-filling once.
    const missing = windowIds.filter((id) => !loadedIdsRef.current.has(id)).slice(0, Math.max(1, Math.floor(pageSize) || 1))
    if (missing.length === 0) return
    const key = missing.join(',')
    if (fetchingRef.current === key) return
    fetchingRef.current = key
    setCardsLoading(true)
    setCardsFailed(false)
    // Deliberately NOT cancelled when the window moves on. A batch already asked
    // for is worth keeping whatever the shopper has ticked since - the cards go
    // into the grid and the passes below decide whether to show them, which is
    // exactly what happens to every other card here. Discarding it deadlocks:
    // tick a filter and untick it, and the window is the same window with the
    // same ids, so the in-flight guard above refuses to ask again - while the
    // answer that would have filled it is being thrown away on arrival. That
    // page then never loads at all.
    loadCards(missing)
      .then((nodes) => {
        // Marked loaded on arrival, not on request: a failed batch has to be
        // askable again, and an id marked early would never be asked for.
        for (const id of missing) loadedIdsRef.current.add(id)
        setExtraCards((prev) => [...prev, ...nodes])
      })
      .catch(() => setCardsFailed(true))
      .finally(() => {
        // Only if it is still ours. A later batch may have claimed the slot
        // while this one was out, and clearing that would let a duplicate go.
        if (fetchingRef.current === key) fetchingRef.current = null
        setCardsLoading(false)
      })
    // cardRetry is in the list on purpose and read nowhere: it is how the retry
    // button asks again for a window that has not otherwise changed.
  }, [loadCards, urlRead, windowIds, pageSize, extraCards, cardRetry])
  // Everything ticked, flattened in the owner's own group order rather than in
  // click order - the summary then reads down the page in the same order as the
  // groups beneath it, instead of shuffling itself every time one is removed.
  const activeChips = useMemo(() => {
    const out: { groupId: string; groupName: string; filterId: string; label: string }[] = []
    for (const group of groups) {
      const picked = selected.get(group.id)
      if (!picked || picked.size === 0) continue
      for (const filter of group.filters) {
        if (picked.has(filter.id)) out.push({ groupId: group.id, groupName: group.name, filterId: filter.id, label: filter.label })
      }
    }
    return out
  }, [groups, selected])

  // Show/hide and re-dress the server-rendered cards in place, then mirror the
  // selection into the URL so a filtered view can be shared or reached with the
  // back button. replaceState (not a router push) keeps the server out of it.
  useIsomorphicLayoutEffect(() => {
    const root = gridRef.current
    if (!root) return
    for (const el of root.querySelectorAll<HTMLElement>('[data-flt-product]')) {
      const productId = el.dataset.fltProduct ?? ''
      const matched = matrix[productId] ?? []
      const ok = matchesSelection(matched, selected, combosByProduct.get(productId))
      el.style.display = ok ? '' : 'none'
      el.toggleAttribute('data-flt-hidden', !ok)
      const swapFilterIds = ok ? pickSwapFilters(matched, selected, orderedGroups) : []
      const swapList = swapFilterIds
        .map((id) => swaps[productId]?.[id])
        .filter((s): s is FltSwap => s != null)
      dressCard(el, swapList, swapImages, preselectOnClick)
    }
    // Counted off the matrix rather than off the cards on screen. They are the
    // same number whenever every card is in the DOM, and only the matrix knows
    // the answer when the later pages have not been fetched yet.
    setVisibleCount(matchingIds.length)

    // The cards are dressed on every pass, but the URL is only written once the
    // read above has happened - see the note there.
    if (!urlRead) return
    // Which groups get a parameter, which get an empty one and which are left
    // out entirely is a rule of its own - see lib/preselect.ts.
    const params = new URLSearchParams(window.location.search)
    applySelectionToParams(groups, selected, preselected, params)
    // One writer for the whole query string: the sort rides along with the
    // ticks so a shared link carries both, and the shop's own order leaves no
    // trace behind at all.
    // The starting order leaves no trace, whatever it is; everything else does,
    // including "Recommended" where that is a step away from the default.
    if (sort !== defaultSort) params.set(sortParam, sort || FLT_SORT_RECOMMENDED_PARAM)
    else params.delete(sortParam)
    const query = params.toString()
    window.history.replaceState(null, '', query ? `?${query}` : window.location.pathname)
    // extraCards: a batch that has just arrived is a set of cards nothing has
    // shown, hidden or dressed yet.
  }, [selected, matrix, combosByProduct, groups, orderedGroups, swaps, swapImages, preselectOnClick, sort, sortParam, defaultSort, urlRead, preselected, matchingIds, extraCards])

  // Re-order the server-rendered cards in place for the chosen sort. Real DOM
  // moves, not CSS `order`: the cards carry links and carousel buttons, and a
  // visual order that disagreed with the tab order would fail focus order.
  // Safe to move them under React because `children` is a stable server-passed
  // node - React never re-reconciles it, so it never puts them back.
  useIsomorphicLayoutEffect(() => {
    const root = gridRef.current
    if (!root) return
    // Nothing to do while the cards are still in the order the server rendered
    // them in - which is the starting sort, not necessarily the shop's own.
    //
    // A fetched batch is the exception, and has to be: it lands at the end of
    // the grid because that is where React appends it, but it belongs wherever
    // the current order puts it. Ticking a filter off again would otherwise
    // leave those cards stranded at the bottom.
    if (sort === defaultSort && !hasSortedRef.current && extraCards.length === 0) return
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
  }, [sort, defaultSort, sortKeys, extraCards])

  // The paging window, applied over whatever the filter and sort passes have
  // left. Declared AFTER both of them on purpose: effects run in declaration
  // order, so by the time this one reads the DOM the cards are in their final
  // order with the non-matching ones already display:none.
  //
  // Driven by IDS rather than by counting along the DOM. Those were the same
  // thing while every card was on the page - the DOM order is the matching
  // order, so the nth element was the nth match - and they stop being the same
  // thing the moment a card can be absent because it has not been fetched yet.
  // Page three of an on-demand grid holds cards 0-23 and 48-71, so "elements 48
  // to 71 of what is here" is an empty page, and the grid would simply go blank.
  //
  // The `display` it writes is the same property the filter pass writes, and the
  // two never disagree because this one leaves a card the filter pass has
  // already hidden exactly as it found it - a card hidden by a tick stays hidden
  // regardless of which page it would otherwise fall on.
  useIsomorphicLayoutEffect(() => {
    if (paginate === 'none') return
    const root = gridRef.current
    if (!root) return
    const onPage = new Set(windowIds)
    for (const el of root.querySelectorAll<HTMLElement>(':scope > [data-flt-product]')) {
      if (el.hasAttribute('data-flt-hidden')) continue
      const on = onPage.has(el.dataset.fltProduct ?? '')
      el.style.display = on ? '' : 'none'
      el.toggleAttribute('data-flt-offpage', !on)
    }
    // extraCards: a batch that has just arrived is a set of cards this has never
    // put on or off a page.
  }, [paginate, windowIds, extraCards])

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

  // How many cards the filters have left, which is what the pager pages over.
  // Falls back to the whole set before the first filter pass has run.
  const matchingTotal = visibleCount ?? matchingIds.length
  const lastPage = Math.max(1, Math.ceil(matchingTotal / Math.max(1, pageSize)))
  // One way to grow the window, whether a thumb or the observer asked for it.
  const growing = paginate === 'more' || paginate === 'scroll'
  const moreToShow = growing && shownLimit < matchingTotal
  // Clamped, matching shop's own pager. The `moreToShow` gate below already
  // unmounts the button and the sentinel once everything is on screen, so an
  // unbounded counter was never actually reachable - but leaving it unbounded
  // means the one number the observer drives has no ceiling at all, and the two
  // implementations of the same idea disagreed. They agree now.
  const showMore = useCallback(
    () => setShownLimit((n) => Math.min(n + pageSize, matchingTotal)),
    [pageSize, matchingTotal],
  )
  const sentinelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (paginate !== 'scroll' || !moreToShow) return
    const node = sentinelRef.current
    // No sentinel or no observer leaves the button doing the whole job, which
    // it can, because it never went away.
    if (!node || typeof IntersectionObserver === 'undefined') return
    const observer = new IntersectionObserver(
      (entries) => { if (entries.some((e) => e.isIntersecting)) showMore() },
      // Load before the shopper reaches the end, so the next row is usually
      // there by the time they arrive at where it goes.
      { rootMargin: '400px 0px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [paginate, moreToShow, showMore])
  const grid = (
    <>
      <div className="shop-grid" style={{ ['--shop-cols' as string]: String(columns) } as React.CSSProperties} ref={gridRef}>
        {children}
        {/* Fetched pages, rendered by React rather than written into the DOM by
            hand: the passes above move and dress cards, but the cards themselves
            have to belong to the tree or their carousels never hydrate. React
            appends them at the end; the sort pass then puts them where they go. */}
        {extraCards}
      </div>
      {cardsFailed && (
        // A grid that has stopped growing looks like a grid that has run out, so
        // say so and offer the way back rather than leaving the shopper to guess.
        <p className="flt-cards-failed" role="status">
          Those didn&rsquo;t load.{' '}
          <button type="button" className="flt-cards-retry" onClick={() => setCardRetry((n) => n + 1)}>
            Try again
          </button>
        </p>
      )}
      {paginate !== 'none' && matchingTotal > pageSize && (
        <nav className="flt-pager" aria-label="Product pages" aria-busy={cardsLoading || undefined}>
          {growing
            ? moreToShow && (
                <>
                  <button type="button" className="flt-pager-more" onClick={showMore}>
                    {moreLabel || 'Show more'}
                  </button>
                  {/* What the observer watches: a scroll position, not content,
                      so it is empty and hidden from assistive tech. */}
                  {paginate === 'scroll' && <div ref={sentinelRef} aria-hidden="true" style={{ width: '100%', height: 1 }} />}
                </>
              )
            : (
              <ul className="flt-pager-pages">
                <li>
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} aria-label="Previous page">
                    &lsaquo;
                  </button>
                </li>
                {filterPageNumbers(page, lastPage).map((n, i) =>
                  n === '\u2026' ? (
                    <li key={`gap-${i}`} className="flt-pager-gap" aria-hidden="true">&hellip;</li>
                  ) : (
                    <li key={n}>
                      <button type="button" onClick={() => setPage(n as number)} aria-current={n === page ? 'page' : undefined} aria-label={`Page ${n}`}>
                        {n}
                      </button>
                    </li>
                  ),
                )}
                <li>
                  <button type="button" onClick={() => setPage((p) => Math.min(lastPage, p + 1))} disabled={page === lastPage} aria-label="Next page">
                    &rsaquo;
                  </button>
                </li>
              </ul>
            )}
        </nav>
      )}
    </>
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

  // The ticked filters as removable chips. Three placements, one list:
  // - `top` sits in the panel's pinned head on desktop, under the title and its
  //   clear, so what is already on stays put while the groups scroll past.
  // - `panel` is the same list inside the sheet's scrolling body, which is what
  //   the tablet and phone layouts show once the sheet is open.
  //   Both carry the group name on each chip, because the same label ("Black")
  //   turns up in more than one group and out of context it says nothing.
  // - `results` sits above the grid, and is the only copy on screen on the
  //   sheet layouts, where the panel is shut behind the pill.
  const chipRow = (variant: 'top' | 'panel' | 'results') =>
    activeChips.length === 0 ? null : (
      <div className={`flt-chips flt-chips-${variant}`}>
        {variant !== 'results' && <p className="flt-chips-title">Selected</p>}
        {activeChips.map(({ groupId, groupName, filterId, label }) => (
          <button
            key={filterId}
            type="button"
            className="flt-chip"
            aria-label={`Remove filter ${groupName}: ${label}`}
            onClick={() => toggle(groupId, filterId)}
          >
            {variant !== 'results' && <span className="flt-chip-group">{groupName}</span>}
            <span className="flt-chip-label">{label}</span>
            <span className="flt-chip-x" aria-hidden>×</span>
          </button>
        ))}
        {/* The panel already carries a clear - in its head on desktop, in the
            sheet's footer on the smaller layouts - so only the grid's copy
            needs one of its own. */}
        {variant === 'results' && (
          <button type="button" className="flt-clear" onClick={() => setSelected(new Map())}>Clear all</button>
        )}
      </div>
    )

  const shownProducts = visibleCount ?? totalCount ?? 0

  return (
    <div className={`flt-wrap flt-pos-${position}`}>
      <aside className="flt-panel" aria-label="Filter products">
        {/* The panel's fixed head: the title, the clear, and the ticked chips.
            On desktop this block pins to the top of the panel while the groups
            below it scroll, so what is already on - and the way to take it off
            again - never scrolls out of reach. On the sheet layouts the wrapper
            unwraps (display:contents) and the sheet's own copy of the chips,
            inside the scrolling body, is the one shown. */}
        <div className="flt-panel-top">
          <div className="flt-head">
            <h2 className="flt-title">Filter</h2>
            {activeCount > 0 && (
              <button type="button" className="flt-clear" onClick={() => setSelected(new Map())}>
                Clear{activeCount > 1 ? ` (${activeCount})` : ''}
              </button>
            )}
          </div>
          {chipRow('top')}
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
            {chipRow('panel')}
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
        {chipRow('results')}
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
