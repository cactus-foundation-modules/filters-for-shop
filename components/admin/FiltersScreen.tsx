'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { FltCatalogueOption, FltControlType, FltFilter, FltGroup } from '@/modules/filters-for-shop/lib/types'
import { isImageSwatch } from '@/modules/filters-for-shop/lib/types'

const BASE = '/api/m/filters-for-shop/admin'

const CONTROL_LABELS: Record<FltControlType, string> = {
  SWATCH: 'Colour swatches',
  CHECKBOX: 'Tick list',
  IMAGE: 'Picture swatches',
  DROPDOWN: 'Dropdown',
}

const card: React.CSSProperties = {
  border: '1px solid var(--color-border)',
  borderRadius: 12,
  padding: '1rem 1.25rem',
  background: 'var(--color-surface)',
}

function SwatchDot({ swatch, size = 16 }: { swatch: string | null; size?: number }) {
  const style: React.CSSProperties = {
    width: size,
    height: size,
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

// The whole screen: filter groups (Colour, Finish...), the filters inside each
// (Blue, Oak...), and per filter the catalogue values it stands for. The value
// catalogue is every distinct (option, value) pair in the shop, so "Blue" is
// built by ticking Blue, Stevia Blue, Sky Blue... from a searchable list.
export function FiltersScreen() {
  const [groups, setGroups] = useState<FltGroup[]>([])
  const [catalogue, setCatalogue] = useState<FltCatalogueOption[]>([])
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupControl, setNewGroupControl] = useState<FltControlType>('SWATCH')
  const [newGroupKind, setNewGroupKind] = useState<'VALUES' | 'PRICE'>('VALUES')
  // Which filter's value picker is open. One at a time keeps the screen sane.
  const [openPicker, setOpenPicker] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const [groupRes, catRes] = await Promise.all([
        fetch(`${BASE}/groups`),
        fetch(`${BASE}/option-values`),
      ])
      const groupData = await groupRes.json()
      const catData = await catRes.json()
      setGroups(groupData.groups ?? [])
      setCatalogue(catData.options ?? [])
    } catch {
      setError('Could not load filters.')
    } finally {
      setLoaded(true)
    }
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect -- delegating to async helper; all setState calls are after awaits
  useEffect(() => { void load() }, [load])

  async function send(url: string, method: string, body?: unknown): Promise<Record<string, unknown> | null> {
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
  }

  async function addGroup() {
    const name = newGroupName.trim()
    if (!name) return
    // Price-band groups read best as a tick list; the swatch controls have
    // nothing to show for a band anyway.
    const ok = await send(`${BASE}/groups`, 'POST', {
      name,
      controlType: newGroupKind === 'PRICE' ? 'CHECKBOX' : newGroupControl,
      kind: newGroupKind,
    })
    if (ok) setNewGroupName('')
  }

  async function moveGroup(index: number, delta: number) {
    const next = [...groups]
    const moved = next[index]
    const displaced = next[index + delta]
    if (!moved || !displaced) return
    next[index] = displaced
    next[index + delta] = moved
    await send(`${BASE}/groups/reorder`, 'POST', { ids: next.map((g) => g.id) })
  }

  return (
    <div>
      <div className="page-header"><h1 className="page-title">Shop filters</h1></div>

      <p style={{ color: 'var(--color-text-muted)', marginTop: 0 }}>
        Filters are what shoppers narrow a category page down by. A group is a heading (Colour), a filter is one
        tick under it (Blue), and each filter stands for any number of real option values - so one Blue covers
        Blue, Stevia Blue and Sky Blue across every product, and keeps covering new products automatically.
        Drop the <em>Shop: Filters &amp; Product Grid</em> block onto a category or collection page to show them.
      </p>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}

      <section style={{ ...card, marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.9375rem', margin: '0 0 0.75rem' }}>Add a filter group</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            className="form-control"
            style={{ flex: '1 1 14rem', minWidth: '10rem' }}
            placeholder="e.g. Colour"
            value={newGroupName}
            onChange={(e) => setNewGroupName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void addGroup() }}
            aria-label="Group name"
          />
          <select
            className="form-control"
            style={{ flex: '0 0 11rem' }}
            value={newGroupKind}
            onChange={(e) => setNewGroupKind(e.target.value as 'VALUES' | 'PRICE')}
            aria-label="What the group filters by"
          >
            <option value="VALUES">Product values</option>
            <option value="PRICE">Price bands</option>
          </select>
          {newGroupKind === 'VALUES' && (
            <select
              className="form-control"
              style={{ flex: '0 0 12rem' }}
              value={newGroupControl}
              onChange={(e) => setNewGroupControl(e.target.value as FltControlType)}
              aria-label="How shoppers pick from it"
            >
              {(Object.keys(CONTROL_LABELS) as FltControlType[]).map((k) => (
                <option key={k} value={k}>{CONTROL_LABELS[k]}</option>
              ))}
            </select>
          )}
          <button className="btn btn-primary" disabled={busy || !newGroupName.trim()} onClick={() => void addGroup()}>Add group</button>
        </div>
      </section>

      {!loaded ? null : groups.length === 0 ? (
        <p style={{ color: 'var(--color-text-muted)' }}>No filter groups yet. Add one above - Colour is the classic first pick.</p>
      ) : (
        <div style={{ display: 'grid', gap: '1.5rem' }}>
          {groups.map((group, index) => (
            <GroupCard
              key={group.id}
              group={group}
              catalogue={catalogue}
              busy={busy}
              send={send}
              canMoveUp={index > 0}
              canMoveDown={index < groups.length - 1}
              onMove={(delta) => void moveGroup(index, delta)}
              openPicker={openPicker}
              setOpenPicker={setOpenPicker}
            />
          ))}
        </div>
      )}
    </div>
  )
}

type Sender = (url: string, method: string, body?: unknown) => Promise<Record<string, unknown> | null>

function GroupCard({ group, catalogue, busy, send, canMoveUp, canMoveDown, onMove, openPicker, setOpenPicker }: {
  group: FltGroup
  catalogue: FltCatalogueOption[]
  busy: boolean
  send: Sender
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (delta: number) => void
  openPicker: string | null
  setOpenPicker: (id: string | null) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(group.name)
  const [newLabel, setNewLabel] = useState('')

  async function rename() {
    const trimmed = name.trim()
    if (!trimmed || trimmed === group.name) { setRenaming(false); setName(group.name); return }
    const ok = await send(`${BASE}/groups/${group.id}`, 'PATCH', { name: trimmed })
    if (ok) setRenaming(false)
  }

  async function addFilter() {
    const label = newLabel.trim()
    if (!label) return
    const created = await send(`${BASE}/filters`, 'POST', { groupId: group.id, label })
    if (created?.id) {
      setNewLabel('')
      // Straight into picking values, with the label as the ready-made search.
      setOpenPicker(created.id as string)
    }
  }

  async function moveFilter(index: number, delta: number) {
    const next = [...group.filters]
    const moved = next[index]
    const displaced = next[index + delta]
    if (!moved || !displaced) return
    next[index] = displaced
    next[index + delta] = moved
    await send(`${BASE}/filters/reorder`, 'POST', { groupId: group.id, ids: next.map((f) => f.id) })
  }

  async function removeGroup() {
    if (!window.confirm(`Delete the "${group.name}" group and every filter in it? Shop pages stop offering it straight away.`)) return
    await send(`${BASE}/groups/${group.id}`, 'DELETE')
  }

  return (
    <section style={card}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem' }}>
        {renaming ? (
          <>
            <input
              className="form-control"
              style={{ flex: '0 1 16rem' }}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void rename(); if (e.key === 'Escape') { setRenaming(false); setName(group.name) } }}
              aria-label="Group name"
              autoFocus
            />
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void rename()}>Save</button>
          </>
        ) : (
          <h2 style={{ fontSize: '1.0625rem', margin: 0 }}>{group.name}</h2>
        )}
        <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
          {group.filters.length === 1 ? '1 filter' : `${group.filters.length} filters`}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <select
            className="form-control"
            style={{ width: 'auto', fontSize: '0.8125rem' }}
            value={group.controlType}
            onChange={(e) => void send(`${BASE}/groups/${group.id}`, 'PATCH', { controlType: e.target.value })}
            aria-label={`How shoppers pick from ${group.name}`}
            disabled={busy}
          >
            {(Object.keys(CONTROL_LABELS) as FltControlType[]).map((k) => (
              <option key={k} value={k}>{CONTROL_LABELS[k]}</option>
            ))}
          </select>
          <button className="btn btn-secondary btn-sm" disabled={busy || !canMoveUp} onClick={() => onMove(-1)} aria-label={`Move ${group.name} up`}>↑</button>
          <button className="btn btn-secondary btn-sm" disabled={busy || !canMoveDown} onClick={() => onMove(1)} aria-label={`Move ${group.name} down`}>↓</button>
          {!renaming && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setRenaming(true)}>Rename</button>}
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void removeGroup()}>Delete</button>
        </div>
      </div>

      {group.filters.length > 0 && (
        <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '0.75rem' }}>
          {group.filters.map((filter, index) => (
            <FilterRow
              key={filter.id}
              group={group}
              filter={filter}
              catalogue={catalogue}
              busy={busy}
              send={send}
              canMoveUp={index > 0}
              canMoveDown={index < group.filters.length - 1}
              onMove={(delta) => void moveFilter(index, delta)}
              pickerOpen={openPicker === filter.id}
              setPickerOpen={(open) => setOpenPicker(open ? filter.id : null)}
            />
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
        <input
          className="form-control"
          style={{ flex: '1 1 12rem', minWidth: '9rem' }}
          placeholder={group.name === 'Colour' ? 'e.g. Blue' : 'New filter name'}
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void addFilter() }}
          aria-label={`New filter in ${group.name}`}
        />
        <button className="btn btn-secondary" disabled={busy || !newLabel.trim()} onClick={() => void addFilter()}>Add filter</button>
      </div>
    </section>
  )
}

function FilterRow({ group, filter, catalogue, busy, send, canMoveUp, canMoveDown, onMove, pickerOpen, setPickerOpen }: {
  group: FltGroup
  filter: FltFilter
  catalogue: FltCatalogueOption[]
  busy: boolean
  send: Sender
  canMoveUp: boolean
  canMoveDown: boolean
  onMove: (delta: number) => void
  pickerOpen: boolean
  setPickerOpen: (open: boolean) => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [label, setLabel] = useState(filter.label)
  const [swatchDraft, setSwatchDraft] = useState(filter.swatch ?? '')
  const wantsPicture = group.controlType === 'IMAGE'

  async function rename() {
    const trimmed = label.trim()
    if (!trimmed || trimmed === filter.label) { setRenaming(false); setLabel(filter.label); return }
    const ok = await send(`${BASE}/filters/${filter.id}`, 'PATCH', { label: trimmed })
    if (ok) setRenaming(false)
  }

  async function saveSwatch(value: string) {
    setSwatchDraft(value)
    await send(`${BASE}/filters/${filter.id}`, 'PATCH', { swatch: value.trim() || null })
  }

  async function remove() {
    if (!window.confirm(`Delete the "${filter.label}" filter?`)) return
    await send(`${BASE}/filters/${filter.id}`, 'DELETE')
  }

  const isPrice = group.kind === 'PRICE'
  const ruleSummary = filter.rules.length === 0
    ? 'matches nothing yet'
    : filter.rules.length === 1
      ? `1 value: ${filter.rules[0]?.valueLabel ?? ''}`
      : `${filter.rules.length} values: ${filter.rules.slice(0, 3).map((r) => r.valueLabel).join(', ')}${filter.rules.length > 3 ? '…' : ''}`

  return (
    <div style={{ border: '1px solid var(--color-border)', borderRadius: 10, padding: '0.6rem 0.75rem', background: 'var(--color-bg-subtle)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <SwatchDot swatch={filter.swatch} />
        {renaming ? (
          <>
            <input
              className="form-control"
              style={{ flex: '0 1 12rem' }}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void rename(); if (e.key === 'Escape') { setRenaming(false); setLabel(filter.label) } }}
              aria-label="Filter name"
              autoFocus
            />
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={() => void rename()}>Save</button>
          </>
        ) : (
          <strong style={{ fontSize: '0.9375rem' }}>{filter.label}</strong>
        )}
        {!isPrice && (
          <button
            type="button"
            onClick={() => setPickerOpen(!pickerOpen)}
            style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', font: 'inherit', fontSize: '0.8125rem', color: filter.rules.length === 0 ? 'var(--color-error)' : 'var(--color-text-muted)', textDecoration: 'underline', textUnderlineOffset: 2 }}
          >
            {ruleSummary}
          </button>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: '0.35rem', alignItems: 'center' }}>
          <button className="btn btn-secondary btn-sm" disabled={busy || !canMoveUp} onClick={() => onMove(-1)} aria-label={`Move ${filter.label} up`}>↑</button>
          <button className="btn btn-secondary btn-sm" disabled={busy || !canMoveDown} onClick={() => onMove(1)} aria-label={`Move ${filter.label} down`}>↓</button>
          {!renaming && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setRenaming(true)}>Rename</button>}
          {!isPrice && <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => setPickerOpen(!pickerOpen)}>{pickerOpen ? 'Close values' : 'Choose values'}</button>}
          <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void remove()}>Delete</button>
        </div>
      </div>

      {isPrice && <PriceBandEditor filter={filter} busy={busy} send={send} />}

      {!isPrice && group.controlType !== 'CHECKBOX' && group.controlType !== 'DROPDOWN' && (
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          {!wantsPicture && (
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(swatchDraft) ? swatchDraft : '#888888'}
              onChange={(e) => void saveSwatch(e.target.value)}
              aria-label={`${filter.label} swatch colour`}
              style={{ width: 34, height: 28, padding: 2, border: '1px solid var(--color-border)', borderRadius: 6, background: 'var(--color-surface)', cursor: 'pointer' }}
              disabled={busy}
            />
          )}
          <input
            className="form-control"
            style={{ flex: '1 1 14rem', fontSize: '0.8125rem' }}
            placeholder={wantsPicture ? 'Picture web address for the swatch' : 'Colour, e.g. #3a5f8a'}
            value={swatchDraft}
            onChange={(e) => setSwatchDraft(e.target.value)}
            onBlur={() => void saveSwatch(swatchDraft)}
            onKeyDown={(e) => { if (e.key === 'Enter') void saveSwatch(swatchDraft) }}
            aria-label={`${filter.label} swatch`}
            disabled={busy}
          />
        </div>
      )}

      {pickerOpen && !isPrice && (
        <ValuePicker
          filter={filter}
          catalogue={catalogue}
          busy={busy}
          send={send}
          hasSwatch={Boolean(filter.swatch)}
          swatchable={group.controlType === 'SWATCH' || group.controlType === 'IMAGE'}
        />
      )}
    </div>
  )
}

// Band bounds for a filter in a price group. Blank min = "under", blank max =
// "and over"; the max is exclusive so neighbouring bands never both claim a
// product sat exactly on the boundary.
function PriceBandEditor({ filter, busy, send }: { filter: FltFilter; busy: boolean; send: Sender }) {
  const [minDraft, setMinDraft] = useState(filter.priceMin === null ? '' : String(filter.priceMin))
  const [maxDraft, setMaxDraft] = useState(filter.priceMax === null ? '' : String(filter.priceMax))

  async function save() {
    const parse = (raw: string): number | null | undefined => {
      const trimmed = raw.trim()
      if (trimmed === '') return null
      const n = Number(trimmed)
      return Number.isFinite(n) && n >= 0 ? n : undefined
    }
    const priceMin = parse(minDraft)
    const priceMax = parse(maxDraft)
    if (priceMin === undefined || priceMax === undefined) return
    await send(`${BASE}/filters/${filter.id}`, 'PATCH', { priceMin, priceMax })
  }

  const unset = filter.priceMin === null && filter.priceMax === null

  return (
    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.5rem', flexWrap: 'wrap' }}>
      <span style={{ fontSize: '0.8125rem', color: unset ? 'var(--color-error)' : 'var(--color-text-muted)' }}>
        {unset ? 'no band set yet -' : 'band:'}
      </span>
      <input
        className="form-control"
        style={{ flex: '0 1 7rem', fontSize: '0.8125rem' }}
        placeholder="From (blank = under)"
        inputMode="decimal"
        value={minDraft}
        onChange={(e) => setMinDraft(e.target.value)}
        aria-label={`${filter.label} band from`}
        disabled={busy}
      />
      <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>up to (not including)</span>
      <input
        className="form-control"
        style={{ flex: '0 1 7rem', fontSize: '0.8125rem' }}
        placeholder="To (blank = no cap)"
        inputMode="decimal"
        value={maxDraft}
        onChange={(e) => setMaxDraft(e.target.value)}
        aria-label={`${filter.label} band up to`}
        disabled={busy}
      />
      <button className="btn btn-secondary btn-sm" disabled={busy} onClick={() => void save()}>Save band</button>
    </div>
  )
}

// The heart of the screen: tick which real option values a filter stands for.
// Searching "blue" surfaces Stevia Blue, Sky Blue, Powder Blue... across every
// option; the filter's own name is the ready-made first search.
function ValuePicker({ filter, catalogue, busy, send, hasSwatch, swatchable }: {
  filter: FltFilter
  catalogue: FltCatalogueOption[]
  busy: boolean
  send: Sender
  hasSwatch: boolean
  swatchable: boolean
}) {
  const [query, setQuery] = useState(filter.rules.length === 0 ? filter.label : '')
  const [ticked, setTicked] = useState<Set<string>>(
    () => new Set(filter.rules.map((r) => `${r.source}\u0000${r.optionName}\u0000${r.valueLabel}`)),
  )
  const [dirty, setDirty] = useState(false)

  const q = query.trim().toLowerCase()
  const shown = useMemo(() => {
    return catalogue
      .map((option) => ({
        source: option.source,
        optionName: option.optionName,
        values: option.values.filter((v) => !q || v.label.toLowerCase().includes(q) || option.optionName.toLowerCase().includes(q)),
      }))
      .filter((option) => option.values.length > 0)
  }, [catalogue, q])

  function toggle(source: string, optionName: string, valueLabel: string) {
    setTicked((prev) => {
      const key = `${source}\u0000${optionName}\u0000${valueLabel}`
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
    setDirty(true)
  }

  async function save() {
    const rules = [...ticked].map((key) => {
      const [source, optionName, valueLabel] = key.split('\u0000')
      return { source, optionName, valueLabel }
    })
    const ok = await send(`${BASE}/filters/${filter.id}/rules`, 'PUT', { rules })
    if (ok) {
      setDirty(false)
      // A colour filter with no swatch yet borrows one from its ticked values -
      // the catalogue already knows what Stevia Blue looks like.
      if (swatchable && !hasSwatch) {
        const donor = catalogue
          .flatMap((o) => o.values.map((v) => ({ key: `${o.source}\u0000${o.optionName}\u0000${v.label}`, swatch: v.swatch })))
          .find((v) => ticked.has(v.key) && v.swatch)
        if (donor?.swatch) await send(`${BASE}/filters/${filter.id}`, 'PATCH', { swatch: donor.swatch })
      }
    }
  }

  return (
    <div style={{ marginTop: '0.6rem', borderTop: '1px solid var(--color-border)', paddingTop: '0.6rem' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
        <input
          className="form-control"
          style={{ flex: '1 1 14rem', fontSize: '0.875rem' }}
          placeholder="Search values, e.g. blue"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={`Search values for ${filter.label}`}
          autoFocus
        />
        <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)' }}>
          {ticked.size === 1 ? '1 value ticked' : `${ticked.size} values ticked`}
        </span>
        <button className="btn btn-primary btn-sm" disabled={busy || !dirty} onClick={() => void save()}>Save values</button>
      </div>

      {catalogue.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>
          No product options found - this list fills up once products have variations.
        </p>
      ) : shown.length === 0 ? (
        <p style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', margin: 0 }}>Nothing matches that search.</p>
      ) : (
        <div style={{ maxHeight: '20rem', overflowY: 'auto', display: 'grid', gap: '0.75rem' }}>
          {shown.map((option) => (
            <div key={`${option.source}:${option.optionName}`}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.35rem' }}>
                {option.source === 'ATTRIBUTE' ? `Spec: ${option.optionName}` : option.optionName}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                {option.values.map((value) => {
                  const key = `${option.source}\u0000${option.optionName}\u0000${value.label}`
                  const on = ticked.has(key)
                  return (
                    <label
                      key={key}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.4rem',
                        padding: '0.3rem 0.6rem',
                        border: `1px solid ${on ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        borderRadius: 999,
                        background: 'var(--color-surface)',
                        fontSize: '0.8125rem',
                        cursor: 'pointer',
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => toggle(option.source, option.optionName, value.label)}
                        style={{ accentColor: 'var(--color-primary)' }}
                      />
                      {value.swatch && !isImageSwatch(value.swatch) && <SwatchDot swatch={value.swatch} size={12} />}
                      <span>{value.label}</span>
                      <span style={{ color: 'var(--color-text-muted)', fontSize: '0.75rem' }}>{value.productCount}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
