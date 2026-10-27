// the month being viewed, and the arithmetic that moves between months

import type { UploadResult } from './api'

export type Period = {
  month: number // 1-based
  year: number
}

export function currentPeriod(): Period {
  const now = new Date()
  return { month: now.getMonth() + 1, year: now.getFullYear() }
}

// moves the period by whole months, rolling over the year
export function shiftPeriod(period: Period, months: number): Period {
  const index = period.year * 12 + (period.month - 1) + months
  return { month: (index % 12) + 1, year: Math.floor(index / 12) }
}

export function isSamePeriod(a: Period, b: Period): boolean {
  return a.month === b.month && a.year === b.year
}

export function isAfterPeriod(a: Period, b: Period): boolean {
  return a.year * 12 + a.month > b.year * 12 + b.month
}

export function formatPeriod(period: Period): string {
  return new Date(period.year, period.month - 1, 1).toLocaleDateString('en-CA', {
    month: 'long',
    year: 'numeric',
  })
}

// writes the period as yyyy-mm, the form the url holds
export function toMonthParam(period: Period): string {
  return `${period.year}-${String(period.month).padStart(2, '0')}`
}

// reads a yyyy-mm url value, or null when it is not one
export function fromMonthParam(value: string | null): Period | null {
  const match = /^(\d{4})-(\d{2})$/.exec(value ?? '')
  if (!match) return null
  const month = Number(match[2])
  if (month < 1 || month > 12) return null
  return { month, year: Number(match[1]) }
}

// reads the month out of a yyyy-mm-dd date, ignoring any time part
function periodFromDate(date: string): Period | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(date)
  if (!match) return null
  return { month: Number(match[2]), year: Number(match[1]) }
}

// reads the month out of the end of a statement period like
// "January 15, 2024 to February 14, 2024"
function periodFromStatementRange(range: string): Period | null {
  const parts = range.split(/\bto\b/)
  if (parts.length < 2) return null

  const end = parts[parts.length - 1].trim()
  if (!end) return null

  const parsed = new Date(end)
  if (Number.isNaN(parsed.getTime())) return null

  return { month: parsed.getMonth() + 1, year: parsed.getFullYear() }
}

// the month an upload should leave the view on, or null when nothing says
export function uploadedPeriod(
  result: Pick<UploadResult, 'period' | 'transactions'>,
): Period | null {
  const dates = result.transactions.map(transaction => transaction.date)

  if (dates.length > 0) {
    const latest = dates.reduce((a, b) => (a > b ? a : b))
    const period = periodFromDate(latest)
    if (period) return period
  }

  return typeof result.period === 'string'
    ? periodFromStatementRange(result.period)
    : null
}
