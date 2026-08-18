/**
 * AI Usage — Desktop status bar chip (session-aware).
 *
 * Watches the active session's model to detect the current provider,
 * fetches ONLY that provider's usage, and renders its declared windows.
 *
 * - OpenCode Go: "OC 5h 39% · W 15% · M 13%"
 * - Untracked provider: chip hides
 *
 * Refreshes every 60s. To add a new provider: edit providers.py.
 */
import { host, Tip, cn, useValue } from '@hermes/plugin-sdk'
import { jsx, jsxs } from 'react/jsx-runtime'
import { useState, useEffect, useCallback, useMemo } from 'react'

const ID = 'opencode-usage'
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

function providerFromModel(model) {
  if (!model || typeof model !== 'string') return null
  const slash = model.indexOf('/')
  return slash > 0 ? model.slice(0, slash) : null
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

function UsageChip() {
  const model = useValue(host.state.model)
  const activeProviderId = useMemo(() => providerFromModel(model), [model])
  const [providerData, setProviderData] = useState(null)
  const [allProviders, setAllProviders] = useState([])
  const [error, setError] = useState(null)

  useEffect(() => {
    host.request('plugin.rest', {
      pluginId: ID, path: '/providers', method: 'GET', timeoutMs: 10000,
    }).then(r => { if (r?.providers) setAllProviders(r.providers) }).catch(() => {})
  }, [])

  const fetchUsage = useCallback(async () => {
    if (!activeProviderId) { setProviderData(null); return }
    try {
      const resp = await host.request('plugin.rest', {
        pluginId: ID, path: '/usage/' + activeProviderId, method: 'GET', timeoutMs: 20000,
      })
      if (resp?.error === 'unknown-provider' || resp?.error === 'provider-disabled') {
        setProviderData(null); setError(null)
      } else if (resp?.error) {
        setError(resp.error); setProviderData(resp)
      } else {
        setProviderData(resp); setError(null)
      }
    } catch {
      setError('connection-failed'); setProviderData(null)
    }
  }, [activeProviderId])

  useEffect(() => {
    fetchUsage()
    const timer = setInterval(fetchUsage, REFRESH_MS)
    return () => clearInterval(timer)
  }, [fetchUsage])

  if (!activeProviderId) return null
  const meta = allProviders.find(p => p.id === activeProviderId)

  if (error && !providerData) {
    const dn = meta?.name || activeProviderId
    return jsx(Tip, {
      label: dn + ' — connection failed',
      children: jsx('button', {
        className: cn('inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem]', 'text-(--ui-text-quaternary) cursor-default'),
        type: 'button',
        children: shortName(dn) + ' ⚠',
      }),
    })
  }

  if (!providerData) {
    const dn = meta?.name || activeProviderId
    return jsx('span', {
      className: 'inline-flex h-full items-center px-1.5 text-[0.625rem] text-(--ui-text-quaternary)',
      children: shortName(dn) + ' …',
    })
  }

  return jsx('button', {
    className: cn('inline-flex h-full items-center gap-1.5 px-1.5 text-[0.6875rem] transition-colors',
      'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'),
    type: 'button',
    children: jsx(ProviderUsageChip, {
      provider: {
        name: providerData.name || meta?.name || activeProviderId,
        windows: providerData.windows || meta?.windows || [],
        usage: providerData.usage,
        error: providerData.error,
      }
    }),
  })
}

export default {
  id: ID,
  name: 'AI Usage',
  register(ctx) {
    ctx.register({ id: 'chip', area: 'statusBar.right', order: 200, render: () => jsx(UsageChip, {}) })
  },
}
