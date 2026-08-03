'use client'

import { useEffect, useState } from 'react'
import type { FltSettings } from '@/modules/filters-for-shop/lib/types'

const TOGGLES: Array<{ key: keyof FltSettings; label: string; hint: string }> = [
  {
    key: 'hideEmptyFilters',
    label: 'Hide filters that match nothing on the page',
    hint: 'Keeps the panel tidy by leaving out any filter that would bring back no products on that particular page.',
  },
  {
    key: 'swapCardImages',
    label: 'Show the matching variation’s photo on product cards',
    hint: 'With Blue ticked, a product that comes in blue shows its blue photo in the grid rather than its usual one.',
  },
  {
    key: 'preselectOnClick',
    label: 'Open products with the filtered options already chosen',
    hint: 'Clicking a card while Blue is ticked opens the product with its blue options pre-selected, ready to add to the basket.',
  },
]

// A sub-tab of shop's settings tab rather than a top-level Settings tab, hosted
// through the 'shop.settings-sub-tabs' slot (manifest `host`). Shop lends the
// space and nothing else: own fetch, own save, own permission, own module API.
export function ShopFiltersSettingsTab() {
  const [settings, setSettings] = useState<FltSettings | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    fetch('/api/m/filters-for-shop/admin/settings')
      .then((r) => r.json())
      .then((d: { settings?: FltSettings }) => {
        if (d.settings) setSettings(d.settings)
      })
      .catch(() => setError('Could not load these settings. Please refresh the page.'))
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!settings) return
    setSaving(true)
    setError('')
    setSaved(false)
    try {
      const res = await fetch('/api/m/filters-for-shop/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || 'Could not save these settings.')
      } else {
        if (data.settings) setSettings(data.settings)
        setSaved(true)
      }
    } catch {
      setError('Could not save these settings.')
    }
    setSaving(false)
  }

  if (!settings) {
    return <p style={{ color: 'var(--color-text-muted)' }}>Loading…</p>
  }

  return (
    <form onSubmit={save}>
      <p style={{ color: 'var(--color-text-muted)', marginBottom: '1.5rem' }}>
        How the shop filters behave on your category and collection pages.
      </p>

      {TOGGLES.map((t) => (
        <div key={t.key} style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={settings[t.key]}
              onChange={(e) => {
                setSaved(false)
                setSettings({ ...settings, [t.key]: e.target.checked })
              }}
              style={{ marginTop: '0.2rem' }}
            />
            <span>
              <span style={{ display: 'block', color: 'var(--color-text)' }}>{t.label}</span>
              <span style={{ display: 'block', fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '0.25rem' }}>
                {t.hint}
              </span>
            </span>
          </label>
        </div>
      ))}

      {error && <p style={{ color: 'var(--color-error)', marginBottom: '1rem' }}>{error}</p>}
      {saved && !error && <p style={{ color: 'var(--color-text-muted)', marginBottom: '1rem' }}>Saved.</p>}

      <button type="submit" className="btn btn-primary" disabled={saving}>
        {saving ? 'Saving…' : 'Save settings'}
      </button>
    </form>
  )
}
