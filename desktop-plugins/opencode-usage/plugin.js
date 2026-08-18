/**
 * OpenCode Usage — Desktop plugin for Hermes.
 *
 * Shows OpenCode Go API usage as a chip in the status bar area.
 * Displays three usage windows: rolling (5h), weekly (W), monthly (M)
 * with percent and status indicators.
 */

import * as sdk from '@hermes/plugin-sdk'
import { atom, cn, host, useQuery, useValue } from '@hermes/plugin-sdk'
import { useEffect, useState } from 'react'
import { jsx, jsxs } from 'react/jsx-runtime'

const ID = 'opencode-usage'

/** Usage data cache */
const $usageData = atom(null)
const $loading = atom(true)
const $error = atom(null)

/** Poll interval (30 seconds) */
const POLL_INTERVAL_MS = 30_000

/**
 * Fetch usage data from the plugin backend.
 */
async function fetchUsage(ctx) {
  try {
    $loading.set(true)
    $error.set(null)
    const data = await ctx.rest('/usage')
    $usageData.set(data)
  } catch (err) {
    console.error('[opencode-usage] Failed to fetch usage:', err)
    $error.set(err?.message || 'Failed to fetch usage')
  } finally {
    $loading.set(false)
  }
}

/**
 * Get status color based on usage percentage.
 */
function getStatusColor(percent) {
  if (percent >= 90) return 'text-red-500'
  if (percent >= 70) return 'text-yellow-500'
  return 'text-green-500'
}

/**
 * Get status label based on usage percentage.
 */
function getStatusLabel(percent) {
  if (percent >= 90) return 'critical'
  if (percent >= 70) return 'warning'
  return 'ok'
}

/**
 * Format usage window for display.
 */
function formatWindow(windowData, label) {
  if (!windowData) return null

  const percent = Math.round((windowData.used || 0) / (windowData.limit || 1) * 100)
  const status = getStatusLabel(percent)
  const colorClass = getStatusColor(percent)

  return {
    label,
    used: windowData.used || 0,
    limit: windowData.limit || 0,
    percent,
    status,
    colorClass,
  }
}

/**
 * Usage chip component for the status bar.
 */
function UsageChip({ ctx }) {
  const usageData = useValue($usageData)
  const loading = useValue($loading)
  const error = useValue($error)

  useEffect(() => {
    fetchUsage(ctx)
    const interval = setInterval(() => fetchUsage(ctx), POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [ctx])

  if (loading && !usageData) {
    return jsx('div', {
      className: 'flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground',
      children: 'Loading...'
    })
  }

  if (error && !usageData) {
    return jsx('div', {
      className: 'flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground',
      title: error,
      children: 'No data'
    })
  }

  if (!usageData) {
    return null
  }

  // Extract usage windows from API response
  const rolling = formatWindow(usageData.rolling || usageData.five_hour, '5h')
  const weekly = formatWindow(usageData.weekly, 'W')
  const monthly = formatWindow(usageData.monthly, 'M')

  const windows = [rolling, weekly, monthly].filter(Boolean)

  if (windows.length === 0) {
    return jsx('div', {
      className: 'flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground',
      children: 'No usage data'
    })
  }

  return jsxs('div', {
    className: 'flex items-center gap-2 px-2 py-1',
    children: [
      jsx('span', {
        className: 'text-xs font-medium text-muted-foreground',
        children: 'OpenCode'
      }),
      windows.map((w) => jsxs('span', {
        className: cn(
          'text-xs font-mono',
          w.colorClass
        ),
        title: `${w.label}: ${w.used}/${w.limit} (${w.percent}%) - ${w.status}`,
        children: [
          jsx('span', { children: w.label }),
          jsx('span', { className: 'opacity-70', children: ' ' }),
          jsx('span', { children: `${w.percent}%` }),
        ]
      }, w.label))
    ]
  })
}

/**
 * Full usage detail panel (for potential expansion).
 */
function UsageDetail({ ctx }) {
  const usageData = useValue($usageData)
  const loading = useValue($loading)
  const error = useValue($error)

  if (loading) {
    return jsx('div', {
      className: 'flex items-center justify-center p-8',
      children: 'Loading usage data...'
    })
  }

  if (error) {
    return jsxs('div', {
      className: 'flex flex-col items-center justify-center p-8 text-center',
      children: [
        jsx('div', {
          className: 'text-destructive mb-2',
          children: 'Error loading usage'
        }),
        jsx('div', {
          className: 'text-sm text-muted-foreground',
          children: error
        })
      ]
    })
  }

  if (!usageData) {
    return jsx('div', {
      className: 'flex items-center justify-center p-8 text-muted-foreground',
      children: 'No usage data available'
    })
  }

  const rolling = formatWindow(usageData.rolling || usageData.five_hour, 'Rolling (5h)')
  const weekly = formatWindow(usageData.weekly, 'Weekly')
  const monthly = formatWindow(usageData.monthly, 'Monthly')

  const windows = [rolling, weekly, monthly].filter(Boolean)

  return jsxs('div', {
    className: 'p-4 space-y-4',
    children: [
      jsx('h2', {
        className: 'text-lg font-semibold',
        children: 'OpenCode Go Usage'
      }),
      windows.map((w) => jsxs('div', {
        className: 'border rounded-lg p-3 space-y-2',
        children: [
          jsxs('div', {
            className: 'flex items-center justify-between',
            children: [
              jsx('span', {
                className: 'font-medium',
                children: w.label
              }),
              jsx('span', {
                className: cn('text-sm', w.colorClass),
                children: w.status.toUpperCase()
              })
            ]
          }),
          jsxs('div', {
            className: 'text-sm text-muted-foreground',
            children: [
              jsx('span', { children: w.used.toLocaleString() }),
              ' / ',
              jsx('span', { children: w.limit.toLocaleString() }),
              ' (',
              jsx('span', { children: `${w.percent}%` }),
              ')'
            ]
          }),
          jsx('div', {
            className: 'h-2 bg-secondary rounded-full overflow-hidden',
            children: jsx('div', {
              className: cn(
                'h-full transition-all',
                w.percent >= 90 ? 'bg-red-500' : w.percent >= 70 ? 'bg-yellow-500' : 'bg-green-500'
              ),
              style: { width: `${Math.min(100, w.percent)}%` }
            })
          })
        ]
      }, w.label))
    ]
  })
}

/**
 * Plugin registration.
 */
export default {
  id: ID,
  name: 'OpenCode Usage',
  description: 'Track OpenCode Go API usage across rolling, weekly, and monthly windows',
  defaultEnabled: true,

  register(ctx) {
    // Register status bar chip contribution
    ctx.register({
      id: 'status-bar-chip',
      kind: 'status-bar',
      position: 'before:clock',
      component: () => jsx(UsageChip, { ctx }),
    })

    // Register cleanup
    ctx.onDispose(() => {
      $usageData.set(null)
      $loading.set(true)
      $error.set(null)
    })
  }
}
