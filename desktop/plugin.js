/**
 * OpenCode Usage — Hermes Desktop status-bar plugin (multi-provider, model-gated).
 *
 * Shows usage/balance for ONLY the provider backing the currently-selected
 * model, and switches automatically when the model changes:
 *   OpenCode Go → 5h / W / M windows (% used)
 *   OpenRouter   → remaining credit balance ($)
 *   DeepSeek     → remaining balance ($)
 */
import { Tip, cn, host, useValue } from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'
import { useCallback, useEffect, useState } from 'react'

const ID = 'opencode-usage'
const REFRESH_MS = 60_000

function percentTone(value) {
  if (value == null) return 'var(--ui-text-quaternary)'
  if (value >= 90) return 'var(--destructive)'
  if (value >= 70) return 'var(--ui-accent)'
  return 'var(--ui-text-secondary)'
}

function balanceTone(value) {
  if (value == null) return 'var(--ui-text-quaternary)'
  if (value < 1) return 'var(--destructive)'
  if (value < 3) return 'var(--ui-accent)'
  return 'var(--ui-text-secondary)'
}

// Map the gateway's provider slug to a summary provider id.
function providerIdFor(configProvider) {
  const p = String(configProvider ?? '').toLowerCase()
  if (p.includes('opencode')) return 'opencode'
  if (p.includes('openrouter')) return 'openrouter'
  if (p.includes('deepseek')) return 'deepseek'
  return null
}

function WindowBadge({ w }) {
  const text = w.percent == null ? '—' : `${Math.round(w.percent)}%`
  return jsx(Tip, {
    label: `${w.label} window: ${text} used`,
    children: jsx('span', {
      className: 'inline-flex items-center gap-0.5 text-[0.625rem] font-mono',
      children: [
        jsx('span', { className: 'text-(--ui-text-quaternary)', children: w.label }),
        jsx('span', { style: { color: percentTone(w.percent) }, children: text }),
      ],
    }),
  })
}

function ProviderBadge({ provider }) {
  const label = provider.error ? '⚠' : (provider.label ?? '—')
  const tooltip = provider.error
    ? `${provider.name} — ${provider.error}`
    : (provider.detail || `${provider.name}: ${provider.label}`)

  return jsx(Tip, {
    label: tooltip,
    children: jsx('span', {
      className: 'inline-flex items-center gap-0.5 text-[0.625rem] font-mono',
      children: [
        jsx('span', { className: 'text-(--ui-text-quaternary)', children: provider.display }),
        jsx('span', { style: { color: balanceTone(provider.value) }, children: label }),
      ],
    }),
  })
}

function UsageChip({ rest }) {
  const [summary, setSummary] = useState(null)
  const [fetchError, setFetchError] = useState(null)
  const [activeProvider, setActiveProvider] = useState(null)
  const modelSlug = useValue(host.state.model)

  // Read the active model's provider from the gateway config
  // ({ key: 'model' } → { value: { default, provider, base_url, api_mode } }).
  const checkProvider = useCallback(async () => {
    try {
      const res = await host.request('config.get', { key: 'model' })
      const value = res && typeof res === 'object' ? (res.value ?? res) : null
      const provider = value && typeof value === 'object' ? value.provider : null
      setActiveProvider(providerIdFor(provider))
    } catch {
      setActiveProvider(null)
    }
  }, [])

  const refresh = useCallback(async () => {
    try {
      const response = await rest('/summary', { method: 'GET', timeoutMs: 20_000 })
      setSummary(response)
      setFetchError(null)
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : String(error))
    }
  }, [rest])

  // Re-detect the active provider the instant the model slug changes.
  useEffect(() => {
    void checkProvider()
  }, [checkProvider, modelSlug])

  // Fetch usage + re-check the provider on a cadence.
  useEffect(() => {
    void checkProvider()
    void refresh()
    const timer = setInterval(() => {
      void checkProvider()
      void refresh()
    }, REFRESH_MS)
    return () => clearInterval(timer)
  }, [checkProvider, refresh])

  // A model from a provider we don't track → hide the chip entirely.
  if (!activeProvider) return null

  if (fetchError && !summary) {
    return jsx(Tip, {
      label: `Usage — ${fetchError}`,
      children: jsx('span', {
        className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] text-(--ui-text-quaternary)',
        children: 'Usage ⚠',
      }),
    })
  }

  if (!summary) {
    return jsx('span', {
      className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] text-(--ui-text-quaternary)',
      children: 'Usage …',
    })
  }

  const providers = Array.isArray(summary.providers) ? summary.providers : []
  const active = providers.find((p) => p.id === activeProvider)
  if (!active) return null

  // OpenCode renders its three windows; other providers a single balance badge.
  let badges
  if (active.id === 'opencode' && Array.isArray(active.windows) && active.windows.length > 0) {
    badges = [
      jsx('span', { key: 'name', className: 'font-semibold text-(--ui-text-quaternary)', children: active.display }),
    ]
    active.windows.forEach((w) => {
      badges.push(jsx('span', { key: `sep-${w.id}`, className: 'text-(--ui-text-quaternary)', children: '·' }))
      badges.push(jsx(WindowBadge, { key: w.id, w }))
    })
  } else {
    badges = [jsx(ProviderBadge, { key: active.id, provider: active })]
  }

  return jsx('button', {
    className: cn(
      'inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] transition-colors',
      'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
    ),
    type: 'button',
    onClick: () => void refresh(),
    children: badges,
  })
}

export default {
  id: ID,
  name: 'Usage',
  description: 'Usage & balance for the active model’s provider (OpenCode, OpenRouter, DeepSeek).',
  defaultEnabled: false,
  register(ctx) {
    ctx.register({
      id: 'chip',
      area: 'statusBar.right',
      order: 200,
      render: () => jsx(UsageChip, { rest: ctx.rest }),
    })
  },
}