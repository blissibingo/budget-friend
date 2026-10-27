// rolls the fetched transactions up into the month's figures and breakdown

import type { Category, Transaction } from './api'

// the breakdown key uncategorized spending is filed under
export const UNCATEGORIZED = 'uncategorized'

// the default category whose withdrawals are reported as saved
const SAVINGS = 'Savings'

export type CategorySpend = {
  key: string
  name: string
  total: number
}

export type Summary = {
  spending: number
  income: number
  net: number
  saved: number
  byCategory: CategorySpend[]
  uncategorizedCount: number
}

// the signed amount, or 0 when it is not a number
function value(amount: string): number {
  const parsed = Number(amount)
  return Number.isFinite(parsed) ? parsed : 0
}

// rounds to whole cents
export function round(value: number): number {
  return Math.round(value * 100) / 100
}

export function summarize(
  transactions: Transaction[],
  categories: Category[],
): Summary {
  const byId = new Map(categories.map(category => [String(category.id), category]))
  const savingsId = categories.find(
    category => category.name === SAVINGS && category.user_id === null,
  )?.id

  let uncategorizedSpend = 0
  let uncategorizedIncome = 0
  let saved = 0
  let uncategorizedCount = 0
  const netByCategory = new Map<string, number>()

  // Uncategorized rows split by sign; categorized rows net per category, so a
  // refund offsets its own category.
  for (const transaction of transactions) {
    const amount = value(transaction.amount)

    if (transaction.category_id === null) {
      uncategorizedCount += 1
      if (amount < 0) uncategorizedSpend -= amount
      else uncategorizedIncome += amount
      continue
    }

    if (transaction.category_id === savingsId) {
      saved -= amount
      continue
    }

    const key = String(transaction.category_id)
    if (byId.get(key)?.excluded_from_spend) continue
    netByCategory.set(key, (netByCategory.get(key) ?? 0) + amount)
  }

  // a category netting positive counts toward income, not the breakdown
  let income = uncategorizedIncome
  const byCategory: CategorySpend[] = []
  for (const [key, net] of netByCategory) {
    const total = round(-net)
    if (total > 0) byCategory.push({ key, name: byId.get(key)?.name ?? 'Other', total })
    else income -= total
  }
  byCategory.sort((a, b) => b.total - a.total)
  if (round(uncategorizedSpend) > 0) {
    byCategory.push({ key: UNCATEGORIZED, name: 'Uncategorized', total: round(uncategorizedSpend) })
  }

  const spending = round(byCategory.reduce((sum, entry) => sum + entry.total, 0))
  income = round(income)

  return {
    spending,
    income,
    net: round(income - spending),
    saved: round(saved),
    byCategory,
    uncategorizedCount,
  }
}
