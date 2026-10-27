import { expect, test } from 'vitest'

import type { Category, Transaction } from './api'
import { summarize } from './summary'

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    amount: '-42.50',
    date: '2026-08-04',
    merchant: 'Loblaws',
    description: null,
    source: 'rbc_debit',
    occurrence: 1,
    created_at: '2026-08-05T12:00:00.000Z',
    user_id: 1,
    category_id: null,
    ...overrides,
  }
}

function category(overrides: Partial<Category> & Pick<Category, 'id' | 'name'>): Category {
  return { user_id: null, color: null, excluded_from_spend: false, ...overrides }
}

const CATEGORIES: Category[] = [
  category({ id: 7, name: 'Groceries' }),
  category({ id: 8, name: 'Transport' }),
  category({ id: 9, name: 'Income' }),
  category({ id: 10, name: 'Transfer', excluded_from_spend: true }),
  category({ id: 11, name: 'Savings', excluded_from_spend: true }),
]

test('totals the withdrawals as a positive spend figure', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-42.50' }),
      transaction({ id: 2, amount: '-7.25' }),
    ],
    CATEGORIES,
  )

  expect(summary.spending).toBe(49.75)
})

test('leaves deposits out of spend', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-42.50' }),
      transaction({ id: 2, amount: '1500.00', merchant: 'Payroll' }),
    ],
    CATEGORIES,
  )

  expect(summary.spending).toBe(42.5)
})

test('groups spend under the category names, largest first', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-42.50', category_id: 7 }),
      transaction({ id: 2, amount: '-60.00', category_id: 8 }),
      transaction({ id: 3, amount: '-7.25', category_id: 7 }),
    ],
    CATEGORIES,
  )

  expect(summary.byCategory).toEqual([
    { key: '8', name: 'Transport', total: 60 },
    { key: '7', name: 'Groceries', total: 49.75 },
  ])
})

test('buckets uncategorized spend last', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-500.00', category_id: null }),
      transaction({ id: 2, amount: '-60.00', category_id: 8 }),
    ],
    CATEGORIES,
  )

  expect(summary.byCategory).toEqual([
    { key: '8', name: 'Transport', total: 60 },
    { key: 'uncategorized', name: 'Uncategorized', total: 500 },
  ])
})

test('omits categories with no spend in the period', () => {
  const summary = summarize([transaction({ amount: '-42.50', category_id: 7 })], CATEGORIES)

  expect(summary.byCategory.map(entry => entry.name)).toEqual(['Groceries'])
})

test('names a category the list no longer knows about', () => {
  const summary = summarize([transaction({ amount: '-42.50', category_id: 99 })], CATEGORIES)

  expect(summary.byCategory).toEqual([{ key: '99', name: 'Other', total: 42.5 }])
})

test('reports zero for a period with no transactions', () => {
  const summary = summarize([], CATEGORIES)

  expect(summary.spending).toBe(0)
  expect(summary.byCategory).toEqual([])
})

test('ignores an amount that is not a number', () => {
  const summary = summarize(
    [transaction({ id: 1, amount: '-10.00' }), transaction({ id: 2, amount: '' })],
    CATEGORIES,
  )

  expect(summary.spending).toBe(10)
})

test('nets a refund against its category', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-200.00', category_id: 7 }),
      transaction({ id: 2, amount: '-42.50', category_id: 7 }),
      transaction({ id: 3, amount: '200.00', category_id: 7 }),
    ],
    CATEGORIES,
  )

  expect(summary.spending).toBe(42.5)
  expect(summary.byCategory).toEqual([{ key: '7', name: 'Groceries', total: 42.5 }])
})

test('a category credited more than it was spent counts as income, not spending', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-42.50', category_id: 8 }),
      transaction({ id: 2, amount: '-100.00', category_id: 9 }),
      transaction({ id: 3, amount: '1500.00', category_id: 9, merchant: 'Payroll' }),
    ],
    CATEGORIES,
  )

  expect(summary.spending).toBe(42.5)
  expect(summary.income).toBe(1400)
  expect(summary.byCategory).toEqual([{ key: '8', name: 'Transport', total: 42.5 }])
})

test('counts an uncategorized deposit as income rather than netting it', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-42.50', category_id: null }),
      transaction({ id: 2, amount: '1500.00', category_id: null, merchant: 'Payroll' }),
    ],
    CATEGORIES,
  )

  expect(summary.income).toBe(1500)
  expect(summary.byCategory).toEqual([
    { key: 'uncategorized', name: 'Uncategorized', total: 42.5 },
  ])
})

test('reports deposits in the Income category as income', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '2000.00', category_id: 9 }),
      transaction({ id: 2, amount: '150.25', category_id: 9 }),
    ],
    CATEGORIES,
  )

  expect(summary.income).toBe(2150.25)
  expect(summary.spending).toBe(0)
})

test('a refund reduces its category and is not counted as income', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-200.00', category_id: 7 }),
      transaction({ id: 2, amount: '50.00', category_id: 7 }),
    ],
    CATEGORIES,
  )

  expect(summary.spending).toBe(150)
  expect(summary.income).toBe(0)
})

test('reports net as income minus spending', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '2000.00', category_id: 9 }),
      transaction({ id: 2, amount: '-450.00', category_id: 7 }),
      transaction({ id: 3, amount: '-60.00', category_id: null }),
    ],
    CATEGORIES,
  )

  expect(summary.net).toBe(1490)
})

test('net is negative when spending exceeds income', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '100.00', category_id: 9 }),
      transaction({ id: 2, amount: '-250.00', category_id: 7 }),
    ],
    CATEGORIES,
  )

  expect(summary.net).toBe(-150)
})

test('leaves an excluded withdrawal out of spending and the breakdown', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-42.50', category_id: 7 }),
      transaction({ id: 2, amount: '-900.00', category_id: 10, merchant: 'Bank transaction' }),
    ],
    CATEGORIES,
  )

  expect(summary.spending).toBe(42.5)
  expect(summary.byCategory.map(entry => entry.name)).toEqual(['Groceries'])
})

test('leaves an excluded deposit out of income', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '1000.00', category_id: 9 }),
      transaction({ id: 2, amount: '500.00', category_id: 10 }),
    ],
    CATEGORIES,
  )

  expect(summary.income).toBe(1000)
})

test('spending drops by exactly the amount reassigned to Transfer', () => {
  const rows = [
    transaction({ id: 1, amount: '-42.50', category_id: 7 }),
    transaction({ id: 2, amount: '-913.27', category_id: null }),
  ]
  const before = summarize(rows, CATEGORIES)
  const after = summarize(
    [rows[0], { ...rows[1], category_id: 10 }],
    CATEGORIES,
  )

  expect(before.spending - after.spending).toBeCloseTo(913.27, 2)
})

test('reports money moved into Savings separately, not as spending', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-42.50', category_id: 7 }),
      transaction({ id: 2, amount: '-300.00', category_id: 11 }),
      transaction({ id: 3, amount: '-200.00', category_id: 11 }),
    ],
    CATEGORIES,
  )

  expect(summary.saved).toBe(500)
  expect(summary.spending).toBe(42.5)
  expect(summary.net).toBe(-42.5)
})

test('a withdrawal from Savings reduces the saved figure', () => {
  const summary = summarize(
    [
      transaction({ id: 1, amount: '-300.00', category_id: 11 }),
      transaction({ id: 2, amount: '100.00', category_id: 11 }),
    ],
    CATEGORIES,
  )

  expect(summary.saved).toBe(200)
  expect(summary.income).toBe(0)
})

test('only the default Savings category counts as saved', () => {
  const summary = summarize(
    [transaction({ id: 1, amount: '-300.00', category_id: 12 })],
    [...CATEGORIES, category({ id: 12, name: 'Savings', user_id: 1, excluded_from_spend: true })],
  )

  expect(summary.saved).toBe(0)
})

test('counts the transactions with no category', () => {
  const summary = summarize(
    [
      transaction({ id: 1, category_id: null }),
      transaction({ id: 2, category_id: 7 }),
      transaction({ id: 3, amount: '1500.00', category_id: null }),
    ],
    CATEGORIES,
  )

  expect(summary.uncategorizedCount).toBe(2)
})

test('reports every figure as zero for an empty period', () => {
  expect(summarize([], CATEGORIES)).toEqual({
    spending: 0,
    income: 0,
    net: 0,
    saved: 0,
    byCategory: [],
    uncategorizedCount: 0,
  })
})
