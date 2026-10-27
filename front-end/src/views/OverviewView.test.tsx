import { beforeEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import {
  getCategories,
  getTransactions,
  type Category,
  type Transaction,
} from '../api'
import { routes } from '../routes'

// mocks the api module rather than fetch
vi.mock('../api', async () => {
  const actual = await vi.importActual<typeof import('../api')>('../api')
  return {
    ...actual,
    getTransactions: vi.fn(),
    getCategories: vi.fn(),
    updateTransaction: vi.fn(),
    deleteTransaction: vi.fn(),
    uploadStatement: vi.fn(),
  }
})

const getTransactionsMock = vi.mocked(getTransactions)
const getCategoriesMock = vi.mocked(getCategories)

let nextId = 1

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: nextId++,
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

function category(id: number, name: string, overrides: Partial<Category> = {}): Category {
  return { id, name, user_id: null, color: null, excluded_from_spend: false, ...overrides }
}

const CATEGORIES: Category[] = [
  category(1, 'Groceries'),
  category(2, 'Dining'),
  category(3, 'Transport'),
  category(4, 'Bills'),
  category(5, 'Shopping'),
  category(6, 'Health', { color: '#123456' }),
  category(7, 'Pets'),
  category(8, 'Gifts'),
  category(9, 'Income'),
  category(10, 'Transfer', { excluded_from_spend: true }),
  category(11, 'Savings', { excluded_from_spend: true }),
]

function renderApp(url = '/?month=2026-08') {
  const router = createMemoryRouter(routes, { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  return router
}

function overview() {
  return screen.getByRole('region', { name: /overview/i })
}

beforeEach(() => {
  nextId = 1
  getTransactionsMock.mockReset().mockResolvedValue([])
  getCategoriesMock.mockReset().mockResolvedValue(CATEGORIES)
})

test('the headline says the month finished up by the net', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ amount: '2000.00', category_id: 9 }),
    transaction({ amount: '-702.19', category_id: 1 }),
  ])

  renderApp()

  expect(
    await screen.findByRole('heading', { name: 'You finished the month up $1,297.81' }),
  ).toBeInTheDocument()
})

test('the headline says the month finished down when spending beat income', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ amount: '100.00', category_id: 9 }),
    transaction({ amount: '-150.00', category_id: 1 }),
  ])

  renderApp()

  expect(
    await screen.findByRole('heading', { name: 'You finished the month down $50.00' }),
  ).toBeInTheDocument()
})

test('income, spent, and saved sit beneath the headline', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ amount: '2000.00', category_id: 9 }),
    transaction({ amount: '-702.19', category_id: 1 }),
    transaction({ amount: '-300.00', category_id: 11 }),
    transaction({ amount: '-500.00', category_id: 10 }),
  ])

  renderApp()

  const figures = within(await screen.findByRole('group', { name: /month figures/i }))
  expect(figures.getByText(/^Income/)).toHaveTextContent('Income $2,000.00')
  expect(figures.getByText(/^Spent/)).toHaveTextContent('Spent $702.19')
  expect(figures.getByText(/^Saved/)).toHaveTextContent('Saved $300.00')
})

function donut() {
  return within(overview()).getByRole('figure', { name: /spending by category/i })
}

function rankedEntries() {
  return within(within(overview()).getByRole('list', { name: /ranked/i }))
    .getAllByRole('listitem')
    .map(entry => entry.textContent)
}

test('the donut holds the month total and the ranked list sits beside it', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ amount: '-20.00', category_id: 3 }),
    transaction({ amount: '-50.00', category_id: 1 }),
    transaction({ amount: '-10.00' }),
    transaction({ amount: '-30.00', category_id: 2 }),
  ])

  renderApp()

  expect(await screen.findByRole('figure', { name: /spending by category/i })).toHaveTextContent(
    'Spent$110.00',
  )
  expect(rankedEntries()).toEqual([
    'Groceries$50.00',
    'Dining$30.00',
    'Transport$20.00',
    'Uncategorized$10.00',
  ])
})

// seven spending categories, largest first, plus some uncategorized
const SEVEN_CATEGORIES = [
  transaction({ amount: '-70.00', category_id: 1 }),
  transaction({ amount: '-60.00', category_id: 2 }),
  transaction({ amount: '-50.00', category_id: 3 }),
  transaction({ amount: '-40.00', category_id: 4 }),
  transaction({ amount: '-30.00', category_id: 5 }),
  transaction({ amount: '-20.00', category_id: 6 }),
  transaction({ amount: '-10.00', category_id: 7 }),
  transaction({ amount: '-5.00' }),
]

test('beyond the largest five categories the rest fold into Other', async () => {
  getTransactionsMock.mockResolvedValue(SEVEN_CATEGORIES)

  renderApp()

  await screen.findByRole('figure', { name: /spending by category/i })
  expect(rankedEntries()).toEqual([
    'Groceries$70.00',
    'Dining$60.00',
    'Transport$50.00',
    'Bills$40.00',
    'Shopping$30.00',
    'Other$30.00',
    'Uncategorized$5.00',
  ])
})

test('hovering Other reveals the categories it contains', async () => {
  getTransactionsMock.mockResolvedValue(SEVEN_CATEGORIES)
  const user = userEvent.setup()

  renderApp()

  await screen.findByRole('figure', { name: /spending by category/i })
  expect(donut()).not.toHaveTextContent('Health')

  const other = within(within(overview()).getByRole('list', { name: /ranked/i }))
    .getAllByRole('listitem')
    .find(entry => entry.textContent?.startsWith('Other'))!
  await user.hover(other)

  expect(donut()).toHaveTextContent('Health $20.00')
  expect(donut()).toHaveTextContent('Pets $10.00')

  await user.unhover(other)
  expect(donut()).not.toHaveTextContent('Health')
  expect(donut()).toHaveTextContent('Spent$285.00')
})

// the colour of the named category's bar in the ranked list
function barColor(name: string) {
  const entry = within(within(overview()).getByRole('list', { name: /ranked/i }))
    .getAllByRole('listitem')
    .find(item => item.textContent?.startsWith(name))!
  return (entry.querySelector('[style*="background"]') as HTMLElement).style.backgroundColor
}

test('each category renders in its assigned colour, uncategorized in grey', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ amount: '-50.00', category_id: 1 }),
    transaction({ amount: '-40.00', category_id: 6 }),
    transaction({ amount: '-10.00' }),
  ])

  renderApp()

  await screen.findByRole('figure', { name: /spending by category/i })
  expect(barColor('Groceries')).toBe('var(--chart-1)')
  expect(barColor('Health')).toBe('rgb(18, 52, 86)')
  expect(barColor('Uncategorized')).toBe('var(--chart-none)')
})

test('a category keeps its colour when the others with spending change', async () => {
  getTransactionsMock
    .mockResolvedValueOnce([
      transaction({ amount: '-50.00', category_id: 1 }),
      transaction({ amount: '-40.00', category_id: 3 }),
    ])
    .mockResolvedValueOnce([
      transaction({ amount: '-40.00', category_id: 3 }),
      transaction({ amount: '-90.00', category_id: 5 }),
    ])
  const user = userEvent.setup()

  renderApp()

  await screen.findByRole('figure', { name: /spending by category/i })
  expect(barColor('Transport')).toBe('var(--chart-3)')

  await user.click(screen.getByRole('button', { name: /previous month/i }))

  await waitFor(() => expect(rankedEntries()[0]).toBe('Shopping$90.00'))
  expect(barColor('Transport')).toBe('var(--chart-3)')
})

test('a count of transactions needing a category links to the review queue', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ amount: '-10.00' }),
    transaction({ amount: '-20.00' }),
    transaction({ amount: '500.00' }),
    transaction({ amount: '-30.00', category_id: 1 }),
  ])
  const user = userEvent.setup()

  const router = renderApp()

  await user.click(
    await within(await screen.findByRole('region', { name: /overview/i })).findByRole('link', {
      name: /3 transactions still need a category/i,
    }),
  )

  expect(router.state.location.pathname).toBe('/review')
  expect(router.state.location.search).toBe('?month=2026-08')
})

test('one transaction needing a category reads in the singular', async () => {
  getTransactionsMock.mockResolvedValue([transaction({ amount: '-10.00' })])

  renderApp()

  expect(
    await screen.findByRole('link', { name: /1 transaction still needs a category/i }),
  ).toBeInTheDocument()
})

test('a fully categorized month offers no review link', async () => {
  getTransactionsMock.mockResolvedValue([transaction({ amount: '-30.00', category_id: 1 })])

  renderApp()

  expect(await screen.findByText(/every transaction has a category/i)).toBeInTheDocument()
  expect(
    within(overview()).queryByRole('link', { name: /need.* a category/i }),
  ).not.toBeInTheDocument()
})

test('a month with no data points at import', async () => {
  const user = userEvent.setup()

  renderApp()

  expect(
    await screen.findByRole('heading', { name: 'Nothing imported for August 2026' }),
  ).toBeInTheDocument()
  expect(screen.queryByRole('heading', { name: /you finished the month/i })).not.toBeInTheDocument()
  expect(within(overview()).queryByRole('figure')).not.toBeInTheDocument()

  await user.click(within(overview()).getByRole('button', { name: /import a statement/i }))

  expect(await screen.findByRole('dialog', { name: /import a statement/i })).toBeInTheDocument()
})

test('a month with income but no spending says so in place of the chart', async () => {
  getTransactionsMock.mockResolvedValue([transaction({ amount: '900.00', category_id: 9 })])

  renderApp()

  expect(
    await screen.findByRole('heading', { name: 'You finished the month up $900.00' }),
  ).toBeInTheDocument()
  expect(within(overview()).getByText(/no spending this month/i)).toBeInTheDocument()
  expect(within(overview()).queryByRole('figure')).not.toBeInTheDocument()
})

test('the overview shows no transaction list', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ amount: '-42.50', merchant: 'Loblaws', category_id: 1 }),
  ])

  renderApp()

  await screen.findByRole('figure', { name: /spending by category/i })
  expect(within(overview()).queryByText(/loblaws/i)).not.toBeInTheDocument()
  expect(within(overview()).queryByRole('table')).not.toBeInTheDocument()
})

test('focusing Other from the keyboard reveals the categories it contains', async () => {
  getTransactionsMock.mockResolvedValue(SEVEN_CATEGORIES)
  const user = userEvent.setup()

  renderApp()

  await screen.findByRole('figure', { name: /spending by category/i })
  const other = within(within(overview()).getByRole('list', { name: /ranked/i }))
    .getAllByRole('listitem')
    .find(entry => entry.textContent?.startsWith('Other'))!
  for (let i = 0; i < 30 && document.activeElement !== other; i++) await user.tab()

  expect(donut()).toHaveTextContent('Health $20.00')
})

test('a month that broke exactly even says so', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ amount: '100.00', category_id: 9 }),
    transaction({ amount: '-100.00', category_id: 1 }),
  ])

  renderApp()

  expect(
    await screen.findByRole('heading', { name: 'You finished the month even' }),
  ).toBeInTheDocument()
})
