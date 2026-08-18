/**
 * OpenCode Usage — Hermes Desktop status-bar plugin (multi-provider).
 *
 * Shows usage/balance for every provider that has an API key configured:
 *   OpenCode Go   → % used (rolling 5h / weekly / monthly)
 *   OpenRouter    → remaining credit balance ($)
 *   DeepSeek      → remaining balance ($)
 *
 * Each provider renders as a compact badge with a tooltip; click to refresh.
 */
import { Tip, cn } from '@hermes/plugin-sdk'
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

function toneFor(provider) {
  if (provider.error) return 'var(--ui-text-quaternary)'
  if (provider.kind === 'percent') return percentTone(provider.value)
  return balanceTone(provider.value)
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
        jsx('span', { style: { color: toneFor(provider) }, children: label }),
      ],
    }),
  })
}

function UsageChip({ rest }) {
  const [summary, setSummary] = useState(null)
  const [fetchError, setFetchError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const response = await rest('/summary', { method: 'GET', timeoutMs: 20_000 })
      setSummary(response)
      setFetchError(null)
    } catch (error) {
      setFetchError(error instanceof Error ? error.message : String(error))
    }
  }, [rest])

  useEffect(() => {
    void refresh()
    const timer = setInterval(() => void refresh(), REFRESH_MS)
    return () => clearInterval(timer)
  }, [refresh])

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
  if (providers.length === 0) return null

  const badges = []
  providers.forEach((provider, index) => {
    if (index > 0) {
      badges.push(jsx('span', { key: `sep-${provider.id}`, className: 'text-(--ui-text-quaternary)', children: '·' }))
    }
    badges.push(jsx(ProviderBadge, { key: provider.id, provider }))
  })

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
  description: 'Usage & balance for every configured provider (OpenCode, OpenRouter, DeepSeek).',
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