/**
 * AI Usage — Desktop status bar chip.
 *
 * Fetches usage for all enabled providers and shows the first one with data.
 * Uses ctx.rest() to call the Python backend.
 */
import { host, Tip, cn } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState, useEffect, useCallback } from 'react'

const REFRESH_MS = 60000

function formatPercent(val) {
  if (val == null || isNaN(val)) return '—'
  return Math.round(val) + '%'
}

function statusColor(percent) {
  if (percent == null) return 'var(--ui-text-quaternary)'
  if (percent >= 90) return '#ef4444'
  if (percent >= 70) return '#f59e0b'
  return '#22c55e'
}

function shortName(name) {
  if (!name) return '??'
  return name.split(' ').map(w => w[0]).join('')
}

function WindowBadge(props) {
  const { label, percent, resetsAt } = props
  const color = statusColor(percent)
  const tip = resetsAt
    ? label + ': ' + formatPercent(percent) + ' — resets ' + new Date(resetsAt).toLocaleTimeString()
    : label + ': ' + formatPercent(percent)
  return jsx(Tip, {
    label: tip,
    children: jsx('span', {
      className: 'inline-flex items-center gap-0.5 text-[0.625rem] font-mono',
      children: [
        jsx('span', { className: 'text-(--ui-text-quaternary)', children: label }),
        jsx('span', { style: { color }, children: formatPercent(percent) }),
      ],
    }),
  })
}

function ProviderUsageChip(props) {
  const { name, windows, usage, error } = props.provider
  if (error && !usage) {
    return jsx(Tip, {
      label: name + ' — ' + error,
      children: jsx('span', {
        className: 'inline-flex items-center gap-0.5 text-[0.625rem] text-(--ui-text-quaternary)',
        children: shortName(name) + ' ⚠',
      }),
    })
  }
  if (!usage) return null
  const badges = []
  for (let i = 0; i < windows.length; i++) {
    const w = windows[i]
    const data = usage[w.id]
    if (i > 0) badges.push(jsx('span', { key: 's' + i, className: 'text-(--ui-text-quaternary)', children: '·' }))
    badges.push(jsx(WindowBadge, { key: w.id, label: w.label, percent: data?.percent, resetsAt: data?.resetsAt }))
  }
  return jsx(Tip, {
    label: name + ' (' + windows.map(w => w.label).join(' / ') + ')',
    children: jsx('span', {
      className: 'inline-flex items-center gap-0.5 text-[0.625rem] font-mono',
      children: [
        jsx('span', { className: 'text-(--ui-text-quaternary) font-semibold', children: shortName(name) }),
        ...badges,
      ],
    }),
  })
}

// Store ctx.rest from register()
let restFn = null

function UsageChip() {
  const [providers, setProviders] = useState(null)
  const [error, setError] = useState(null)

  const fetchAll = useCallback(async () => {
    if (!restFn) { setError('no-rest'); return }
    try {
      const resp = await restFn('/usage', { method: 'GET', timeoutMs: 20000 })
      if (resp?.providers) {
        setProviders(resp.providers)
        setError(null)
      } else {
        setError(resp?.error || 'no-data')
      }
    } catch (e) {
      setError('fetch-error: ' + String(e))
    }
  }, [])

  useEffect(() => {
    fetchAll()
    const timer = setInterval(fetchAll, REFRESH_MS)
    return () => clearInterval(timer)
  }, [fetchAll])

  if (error && !providers) {
    return jsx('span', {
      className: 'inline-flex h-full items-center px-1.5 text-[0.625rem] text-(--ui-text-quaternary)',
      children: 'AI ⚠ ' + error,
    })
  }

  if (!providers) {
    return jsx('span', {
      className: 'inline-flex h-full items-center px-1.5 text-[0.625rem] text-(--ui-text-quaternary)',
      children: 'AI …',
    })
  }

  const active = providers.find(p => p.usage && !p.error)
  if (!active) {
    return jsx('span', {
      className: 'inline-flex h-full items-center px-1.5 text-[0.625rem] text-(--ui-text-quaternary)',
      children: 'AI — no data',
    })
  }

  return jsx('button', {
    className: cn('inline-flex h-full items-center gap-1.5 px-1.5 text-[0.6875rem] transition-colors',
      'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'),
    type: 'button',
    children: jsx(ProviderUsageChip, { provider: active }),
  })
}

export default {
  id: 'opencode-usage',
  name: 'AI Usage',
  defaultEnabled: true,
  register(ctx) {
    // Store ctx.rest for use in components
    restFn = ctx.rest.bind(ctx)
    ctx.register({ id: 'chip', area: 'statusBar.right', order: 200, render: () => jsx(UsageChip, {}) })
  },
}
