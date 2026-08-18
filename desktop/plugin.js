/**
 * OpenCode Usage — Hermes Desktop status-bar plugin.
 */
import { Tip, cn } from '@hermes/plugin-sdk'
import { jsx } from 'react/jsx-runtime'
import { useCallback, useEffect, useState } from 'react'

const ID = 'opencode-usage'
const REFRESH_MS = 60_000

function formatPercent(value) {
  if (value == null || Number.isNaN(Number(value))) return '—'
  return `${Math.round(Number(value))}%`
}

function tone(percent) {
  if (percent == null) return 'var(--ui-text-quaternary)'
  if (percent >= 90) return 'var(--destructive)'
  if (percent >= 70) return 'var(--ui-accent)'
  return 'var(--ui-text-secondary)'
}

function WindowBadge({ label, value }) {
  if (!value) return null
  const tooltip = value.resetsAt
    ? `${label}: ${formatPercent(value.percent)} used — resets ${new Date(value.resetsAt).toLocaleString()}`
    : `${label}: ${formatPercent(value.percent)} used`

  return jsx(Tip, {
    label: tooltip,
    children: jsx('span', {
      className: 'inline-flex items-center gap-0.5 text-[0.625rem] font-mono',
      children: [
        jsx('span', { className: 'text-(--ui-text-quaternary)', children: label }),
        jsx('span', { style: { color: tone(value.percent) }, children: formatPercent(value.percent) }),
      ],
    }),
  })
}

function UsageChip({ rest }) {
  const [result, setResult] = useState(null)
  const [fetchError, setFetchError] = useState(null)

  const refresh = useCallback(async () => {
    try {
      const response = await rest('/usage', { method: 'GET', timeoutMs: 20_000 })
      setResult(response)
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

  if (fetchError && !result) {
    return jsx(Tip, {
      label: `OpenCode Usage — ${fetchError}`,
      children: jsx('span', {
        className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] text-(--ui-text-quaternary)',
        children: 'OC ⚠',
      }),
    })
  }

  if (!result) {
    return jsx('span', {
      className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] text-(--ui-text-quaternary)',
      children: 'OC …',
    })
  }

  if (result.error || !result.usage) {
    const message = result.error === 'no-api-key'
      ? 'OPENCODE_GO_API_KEY is not configured in the active Hermes profile'
      : `OpenCode Usage — ${result.error || 'no data'}`
    return jsx(Tip, {
      label: message,
      children: jsx('span', {
        className: 'inline-flex h-full items-center px-1.5 text-[0.6875rem] text-(--ui-text-quaternary)',
        children: 'OC ⚠',
      }),
    })
  }

  const badges = []
  for (const window of result.windows || []) {
    const value = result.usage[window.id]
    if (!value) continue
    if (badges.length > 0) {
      badges.push(jsx('span', { key: `sep-${window.id}`, className: 'text-(--ui-text-quaternary)', children: '·' }))
    }
    badges.push(jsx(WindowBadge, { key: window.id, label: window.label, value }))
  }

  return jsx('button', {
    className: cn(
      'inline-flex h-full items-center gap-1 px-1.5 text-[0.6875rem] transition-colors',
      'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground',
    ),
    type: 'button',
    onClick: () => void refresh(),
    children: [
      jsx('span', { key: 'name', className: 'font-semibold text-(--ui-text-quaternary)', children: 'OC' }),
      ...badges,
    ],
  })
}

export default {
  id: ID,
  name: 'OpenCode Usage',
  description: 'OpenCode Go rolling, weekly, and monthly usage in the status bar.',
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
