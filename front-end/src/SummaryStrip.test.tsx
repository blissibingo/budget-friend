import { expect, test } from 'vitest'
import { render, screen, within } from '@testing-library/react'

import type { Category, Transaction } from './api'
import SummaryStrip from './SummaryStrip'

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

const CATEGORIES: Category[] = [
  { id: 7, name: 'Groceries', user_id: null, color: null, excluded_from_spend: false },
  { id: 8, name: 'Transport', user_id: null, color: null, excluded_from_spend: false },
  { id: 9, name: 'Income', user_id: null, color: null, excluded_from_spend: false },
  { id: 10, name: 'Transfer', user_id: null, color: null, excluded_from_spend: true },
  { id: 11, name: 'Savings', user_id: null, color: null, excluded_from_spend: true },
]

type Props = Parameters<typeof SummaryStrip>[0]

function renderStrip(overrides: Partial<Props> = {}) {
  const props: Props = {
    transactions: [transaction()],
    categories: CATEGORIES,
    period: { month: 8, year: 2026 },
    loading: false,
    error: null,
    ...overrides,
  }

  return render(<SummaryStrip {...props} />)
}

function strip() {
  return screen.getByRole('region', { name: /summary/i })
}

test('shows the total spend for the period', () => {
  renderStrip({
    transactions: [
      transaction({ id: 1, amount: '-42.50' }),
      transaction({ id: 2, amount: '-7.25' }),
    ],
  })

  expect(
    within(strip()).getByText(/total spend for August 2026/i),
  ).toHaveTextContent('$49.75')
})

test('lists spend per category', () => {
  renderStrip({
    transactions: [
      transaction({ id: 1, amount: '-42.50', category_id: 7 }),
      transaction({ id: 2, amount: '-60.00', category_id: 8 }),
      transaction({ id: 3, amount: '-10.00', category_id: null }),
    ],
  })

  const entries = within(strip()).getAllByRole('listitem')
  expect(entries.map(entry => entry.textContent)).toEqual([
    'Transport$60.00',
    'Groceries$42.50',
    'Uncategorized$10.00',
  ])
})

test('shows income, net, and saved for the period', () => {
  renderStrip({
    transactions: [
      transaction({ id: 1, amount: '2000.00', category_id: 9 }),
      transaction({ id: 2, amount: '-450.00', category_id: 7 }),
      transaction({ id: 3, amount: '-300.00', category_id: 11 }),
    ],
  })

  expect(within(strip()).getByText(/^income/i)).toHaveTextContent('$2,000.00')
  expect(within(strip()).getByText(/^net/i)).toHaveTextContent('$1,550.00')
  expect(within(strip()).getByText(/^saved/i)).toHaveTextContent('$300.00')
})

test('leaves a transfer out of the spend total and the list', () => {
  renderStrip({
    transactions: [
      transaction({ id: 1, amount: '-42.50', category_id: 7 }),
      transaction({ id: 2, amount: '-900.00', category_id: 10 }),
    ],
  })

  expect(within(strip()).getByText(/total spend for August 2026/i)).toHaveTextContent('$42.50')
  const entries = within(strip()).getAllByRole('listitem')
  expect(entries.map(entry => entry.textContent)).toEqual(['Groceries$42.50'])
})

test('withholds a total while the period is loading', () => {
  renderStrip({ loading: true })

  expect(within(strip()).getByText(/total spend for August 2026/i)).toHaveTextContent('—')
  expect(within(strip()).getByText(/^income/i)).toHaveTextContent('—')
  expect(within(strip()).getByText(/^net/i)).toHaveTextContent('—')
  expect(within(strip()).getByText(/^saved/i)).toHaveTextContent('—')
  expect(within(strip()).queryByText('$42.50')).not.toBeInTheDocument()
  expect(within(strip()).queryAllByRole('listitem')).toHaveLength(0)
})

test('withholds a total when the period failed to load', () => {
  renderStrip({ error: 'Failed to load transactions' })

  expect(within(strip()).getByText(/total spend for August 2026/i)).toHaveTextContent('—')
  expect(within(strip()).queryByText('$42.50')).not.toBeInTheDocument()
})

test('degrades to a zero total when the period is empty', () => {
  renderStrip({ transactions: [] })

  expect(within(strip()).getByText(/total spend for August 2026/i)).toHaveTextContent('$0.00')
  expect(within(strip()).queryAllByRole('listitem')).toHaveLength(0)
  expect(within(strip()).getByText(/nothing to summarize/i)).toBeInTheDocument()
})
