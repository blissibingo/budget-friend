import { beforeEach, expect, test, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router'

import {
  ApiError,
  deleteTransaction,
  getCategories,
  getTransactions,
  updateTransaction,
  uploadStatement,
  type Category,
  type Transaction,
  type UploadResult,
} from './api'
import { routes } from './routes'

const NOW = new Date()
const CURRENT = { month: NOW.getMonth() + 1, year: NOW.getFullYear() }
const PREVIOUS =
  CURRENT.month === 1
    ? { month: 12, year: CURRENT.year - 1 }
    : { month: CURRENT.month - 1, year: CURRENT.year }

function label({ month, year }: { month: number; year: number }) {
  return new Date(year, month - 1, 1).toLocaleDateString('en-CA', {
    month: 'long',
    year: 'numeric',
  })
}

// mocks the api module rather than fetch
vi.mock('./api', async () => {
  const actual = await vi.importActual<typeof import('./api')>('./api')
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
const updateTransactionMock = vi.mocked(updateTransaction)
const deleteTransactionMock = vi.mocked(deleteTransaction)
const uploadStatementMock = vi.mocked(uploadStatement)

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    amount: '42.50',
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

const CATEGORIES: Category[] = [{ id: 7, name: 'Groceries', user_id: null, color: null, excluded_from_spend: false }]

function rowFor(merchant: string) {
  return screen.getByDisplayValue(merchant).closest('tr') as HTMLElement
}

function overview() {
  return screen.getByRole('region', { name: /overview/i })
}

function spent() {
  return within(within(overview()).getByRole('group', { name: /month figures/i })).getByText(
    /^Spent/,
  )
}

// the list has its own alert region, separate from the uploader's
function listAlert() {
  return within(screen.getByRole('region', { name: /transactions/i })).getByRole('alert')
}

function stepButton(direction: 'Previous' | 'Next') {
  return screen.getByRole('button', { name: new RegExp(`${direction} month`, 'i') })
}

function uploadResult(overrides: Partial<UploadResult> = {}): UploadResult {
  return {
    period: 'August 1, 2026 to August 31, 2026',
    opening_balance: 0,
    closing_balance: 0,
    transactions: [],
    inserted_count: 0,
    skipped_count: 0,
    ...overrides,
  }
}

// opens the import dialog from the header and uploads a statement through it
async function uploadStatementFile(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Import' }))
  await user.upload(
    screen.getByLabelText(/statement pdf/i),
    new File(['%PDF-1.4'], 'statement.pdf', { type: 'application/pdf' }),
  )
  await user.click(screen.getByRole('button', { name: /^upload/i }))
}

// renders the whole app in a memory router opened at the given url
function renderApp(url = '/') {
  const router = createMemoryRouter(routes, { initialEntries: [url] })
  render(<RouterProvider router={router} />)
  return router
}

function tab(name: string) {
  return screen.getByRole('link', { name })
}

beforeEach(() => {
  getTransactionsMock.mockReset().mockResolvedValue([])
  getCategoriesMock.mockReset().mockResolvedValue(CATEGORIES)
  updateTransactionMock.mockReset()
  deleteTransactionMock.mockReset().mockResolvedValue(undefined)
  uploadStatementMock.mockReset()
})

test('opens on the overview for the current month', async () => {
  const router = renderApp()

  expect(await screen.findByRole('region', { name: /overview/i })).toBeInTheDocument()
  expect(tab('Overview')).toHaveAttribute('aria-current', 'page')
  expect(router.state.location.pathname).toBe('/')
  await waitFor(() => expect(getTransactionsMock).toHaveBeenCalledWith(CURRENT))
})

test('the tabs move between the three views', async () => {
  getTransactionsMock.mockResolvedValue([transaction()])
  const user = userEvent.setup()

  renderApp()

  await user.click(await screen.findByRole('link', { name: 'Transactions' }))
  expect(await screen.findByDisplayValue('Loblaws')).toBeInTheDocument()
  expect(screen.queryByRole('region', { name: /overview/i })).not.toBeInTheDocument()

  await user.click(tab('Review'))
  expect(await screen.findByRole('heading', { name: 'Review' })).toBeInTheDocument()
  expect(screen.queryByDisplayValue('Loblaws')).not.toBeInTheDocument()

  await user.click(tab('Overview'))
  expect(await screen.findByRole('region', { name: /overview/i })).toBeInTheDocument()
})

test('the month is read from the url', async () => {
  renderApp('/transactions?month=2026-03')

  expect(await screen.findByText('March 2026')).toBeInTheDocument()
  await waitFor(() =>
    expect(getTransactionsMock).toHaveBeenCalledWith({ month: 3, year: 2026 }),
  )
  expect(tab('Transactions')).toHaveAttribute('aria-current', 'page')
})

test('an unreadable month in the url falls back to the current month', async () => {
  renderApp('/?month=banana')

  expect(await screen.findByText(label(CURRENT))).toBeInTheDocument()
  await waitFor(() => expect(getTransactionsMock).toHaveBeenCalledWith(CURRENT))
})

test('the month is written to the url when none is given', async () => {
  const router = renderApp('/transactions')

  await screen.findByText(label(CURRENT))
  await waitFor(() =>
    expect(router.state.location.search).toBe(
      `?month=${CURRENT.year}-${String(CURRENT.month).padStart(2, '0')}`,
    ),
  )
  expect(router.state.location.pathname).toBe('/transactions')
})

test('a future month in the url is replaced by the current month', async () => {
  renderApp(`/?month=${CURRENT.year + 1}-01`)

  expect(await screen.findByText(label(CURRENT))).toBeInTheDocument()
  expect(stepButton('Next')).toBeDisabled()
  expect(getTransactionsMock).not.toHaveBeenCalledWith({ month: 1, year: CURRENT.year + 1 })
})

test('an unknown path returns to the overview keeping the month', async () => {
  const router = renderApp('/nowhere?month=2026-03')

  expect(await screen.findByText('March 2026')).toBeInTheDocument()
  expect(router.state.location.pathname).toBe('/')
  expect(router.state.location.search).toBe('?month=2026-03')
})

test('stepping the month writes it to the url and keeps the view', async () => {
  const user = userEvent.setup()
  const router = renderApp('/transactions?month=2026-03')

  await screen.findByText('March 2026')
  await user.click(stepButton('Previous'))

  expect(router.state.location.pathname).toBe('/transactions')
  expect(router.state.location.search).toBe('?month=2026-02')
  expect(await screen.findByText('February 2026')).toBeInTheDocument()
})

test('switching views keeps the month', async () => {
  const user = userEvent.setup()
  const router = renderApp('/?month=2026-03')

  await screen.findByText('March 2026')
  await user.click(tab('Review'))

  expect(router.state.location.pathname).toBe('/review')
  expect(router.state.location.search).toBe('?month=2026-03')
  expect(screen.getByText('March 2026')).toBeInTheDocument()
})

test('going back returns to the previous view', async () => {
  const user = userEvent.setup()
  const router = renderApp('/?month=2026-03')

  await screen.findByText('March 2026')
  await user.click(tab('Transactions'))
  expect(router.state.location.pathname).toBe('/transactions')

  await act(() => router.navigate(-1))

  expect(router.state.location.pathname).toBe('/')
  expect(router.state.location.search).toBe('?month=2026-03')
  expect(await screen.findByRole('region', { name: /overview/i })).toBeInTheDocument()
})

test('the header carries the import and category actions', async () => {
  renderApp()

  expect(await screen.findByRole('heading', { name: 'Budget Friend' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: 'Import' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /categories/i })).toBeInTheDocument()
})

test('loads the current month on mount', async () => {
  getTransactionsMock.mockResolvedValue([transaction()])
  const now = new Date()

  renderApp('/transactions')

  await waitFor(() => {
    expect(getTransactionsMock).toHaveBeenCalledWith({
      month: now.getMonth() + 1,
      year: now.getFullYear(),
    })
  })
  expect(await screen.findByDisplayValue('Loblaws')).toBeInTheDocument()
})

test('a successful upload reloads the transaction list', async () => {
  getTransactionsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([transaction()])
  uploadStatementMock.mockResolvedValue(
    uploadResult({
      transactions: [
        transaction({
          date: `${CURRENT.year}-${String(CURRENT.month).padStart(2, '0')}-01`,
        }),
      ],
      inserted_count: 1,
    }),
  )
  const user = userEvent.setup()

  renderApp('/transactions')

  expect(await screen.findByText(/no transactions/i)).toBeInTheDocument()
  await uploadStatementFile(user)

  await waitFor(() => {
    expect(screen.getByDisplayValue('Loblaws')).toBeInTheDocument()
  })
})

test('stepping back requests and renders the previous month', async () => {
  getTransactionsMock
    .mockResolvedValueOnce([])
    .mockResolvedValueOnce([transaction({ merchant: 'Petro-Canada' })])
  const user = userEvent.setup()

  renderApp('/transactions')

  expect(await screen.findByText(label(CURRENT))).toBeInTheDocument()
  await user.click(stepButton('Previous'))

  await waitFor(() => {
    expect(getTransactionsMock).toHaveBeenLastCalledWith(PREVIOUS)
  })
  expect(await screen.findByDisplayValue('Petro-Canada')).toBeInTheDocument()
  expect(screen.getByText(label(PREVIOUS))).toBeInTheDocument()
})

test('stepping forward returns to the current month', async () => {
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByText(label(CURRENT))
  await user.click(stepButton('Previous'))
  await waitFor(() => expect(stepButton('Next')).toBeEnabled())

  await user.click(stepButton('Next'))

  await waitFor(() => {
    expect(getTransactionsMock).toHaveBeenLastCalledWith(CURRENT)
  })
  expect(screen.getByText(label(CURRENT))).toBeInTheDocument()
})

test('the forward arrow is disabled on the current month', async () => {
  renderApp('/transactions')

  await screen.findByText(label(CURRENT))
  expect(stepButton('Next')).toBeDisabled()
  expect(stepButton('Previous')).toBeEnabled()
})

test('an upload lands on the month of the latest inserted transaction', async () => {
  uploadStatementMock.mockResolvedValue(
    uploadResult({
      period: 'June 15, 2026 to July 14, 2026',
      transactions: [
        transaction({ id: 1, date: '2026-06-20' }),
        transaction({ id: 2, date: '2026-07-02', merchant: 'Petro-Canada' }),
      ],
      inserted_count: 2,
    }),
  )
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByText(label(CURRENT))
  await uploadStatementFile(user)

  await waitFor(() => {
    expect(getTransactionsMock).toHaveBeenLastCalledWith({ month: 7, year: 2026 })
  })
  expect(screen.getByText('July 2026')).toBeInTheDocument()
})

test('a fully duplicate re-upload falls back to the statement period end month', async () => {
  uploadStatementMock.mockResolvedValue(
    uploadResult({
      period: 'June 15, 2026 to July 14, 2026',
      transactions: [],
      skipped_count: 12,
    }),
  )
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByText(label(CURRENT))
  await uploadStatementFile(user)

  await waitFor(() => {
    expect(getTransactionsMock).toHaveBeenLastCalledWith({ month: 7, year: 2026 })
  })
})

test('an upload with nothing to go on leaves the period alone', async () => {
  uploadStatementMock.mockResolvedValue(
    uploadResult({ period: 'statement', transactions: [] }),
  )
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByText(label(CURRENT))
  await user.click(stepButton('Previous'))
  await waitFor(() => expect(getTransactionsMock).toHaveBeenLastCalledWith(PREVIOUS))

  await uploadStatementFile(user)

  await waitFor(() => {
    expect(uploadStatementMock).toHaveBeenCalled()
  })
  expect(getTransactionsMock).toHaveBeenLastCalledWith(PREVIOUS)
  expect(screen.getByText(label(PREVIOUS))).toBeInTheDocument()
})

test('an empty month names the period and points at import', async () => {
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByText(label(CURRENT))
  await user.click(stepButton('Previous'))

  expect(
    await screen.findByText(`No transactions for ${label(PREVIOUS)}.`),
  ).toBeInTheDocument()
  expect(screen.getByText(/use import to add a statement/i)).toBeInTheDocument()
})

test('assigning a category persists it and keeps it on screen', async () => {
  getTransactionsMock.mockResolvedValue([transaction()])
  updateTransactionMock.mockResolvedValue(transaction({ category_id: 7 }))
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByDisplayValue('Loblaws')
  const category = within(rowFor('Loblaws')).getByLabelText(/category/i)
  await user.selectOptions(category, '7')

  await waitFor(() => {
    expect(updateTransactionMock).toHaveBeenCalledWith(1, { category_id: 7 })
  })
  await waitFor(() => {
    expect(category).toHaveValue('7')
  })
})

test('deleting a row removes it from the list', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ id: 1, merchant: 'Loblaws' }),
    transaction({ id: 2, merchant: 'Petro-Canada' }),
  ])
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByDisplayValue('Loblaws')
  await user.click(within(rowFor('Loblaws')).getByRole('button', { name: /delete/i }))

  await waitFor(() => {
    expect(deleteTransactionMock).toHaveBeenCalledWith(1)
  })
  await waitFor(() => {
    expect(screen.queryByDisplayValue('Loblaws')).not.toBeInTheDocument()
  })
  expect(screen.getByDisplayValue('Petro-Canada')).toBeInTheDocument()
})

test('the overview follows a category change made in the transactions view', async () => {
  getTransactionsMock.mockResolvedValue([transaction({ amount: '-42.50' })])
  updateTransactionMock.mockResolvedValue(
    transaction({ amount: '-42.50', category_id: 7 }),
  )
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByDisplayValue('Loblaws')
  await user.selectOptions(within(rowFor('Loblaws')).getByLabelText(/category/i), '7')
  await waitFor(() => expect(updateTransactionMock).toHaveBeenCalled())

  await user.click(tab('Overview'))

  await waitFor(() => {
    expect(within(overview()).getByRole('listitem')).toHaveTextContent('Groceries$42.50')
  })
  expect(getTransactionsMock).toHaveBeenCalledTimes(1)
})

test('the overview total follows a row deleted in the transactions view', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ id: 1, amount: '-42.50' }),
    transaction({ id: 2, amount: '-60.00', merchant: 'Petro-Canada' }),
  ])
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByDisplayValue('Loblaws')
  await user.click(within(rowFor('Loblaws')).getByRole('button', { name: /delete/i }))
  await waitFor(() => expect(screen.queryByDisplayValue('Loblaws')).not.toBeInTheDocument())

  await user.click(tab('Overview'))

  await waitFor(() => {
    expect(spent()).toHaveTextContent('$60.00')
  })
})

test('the overview follows the month stepper', async () => {
  getTransactionsMock
    .mockResolvedValueOnce([transaction({ amount: '-42.50' })])
    .mockResolvedValueOnce([
      transaction({ id: 2, amount: '-60.00', merchant: 'Petro-Canada' }),
    ])
  const user = userEvent.setup()

  renderApp('/')

  await waitFor(() => expect(spent()).toHaveTextContent('$42.50'))
  await user.click(stepButton('Previous'))

  await waitFor(() => expect(within(overview()).getByText(label(PREVIOUS))).toBeInTheDocument())
  expect(spent()).toHaveTextContent('$60.00')
})

test('a failed month load withholds the previous month total', async () => {
  getTransactionsMock
    .mockResolvedValueOnce([transaction({ amount: '-42.50' })])
    .mockRejectedValueOnce(new ApiError(500, 'Failed to fetch transactions'))
  const user = userEvent.setup()

  renderApp('/')

  await waitFor(() => expect(spent()).toHaveTextContent('$42.50'))
  await user.click(stepButton('Previous'))

  await waitFor(() => {
    expect(within(overview()).getByRole('alert')).toHaveTextContent('Failed to fetch transactions')
  })
  expect(within(overview()).queryByText(/\$42\.50/)).not.toBeInTheDocument()

  await user.click(tab('Transactions'))
  expect(listAlert()).toHaveTextContent('Failed to fetch transactions')
})

test('shows the server error message when an edit fails', async () => {
  getTransactionsMock.mockResolvedValue([transaction()])
  updateTransactionMock.mockRejectedValue(new ApiError(404, 'Transaction not found'))
  const user = userEvent.setup()

  renderApp('/transactions')

  await screen.findByDisplayValue('Loblaws')
  await user.selectOptions(
    within(rowFor('Loblaws')).getByLabelText(/category/i),
    '7',
  )

  await waitFor(() => {
    expect(listAlert()).toHaveTextContent('Transaction not found')
  })
})

test('shows the server error message when the load fails', async () => {
  getTransactionsMock.mockRejectedValue(new ApiError(500, 'Failed to fetch transactions'))

  renderApp('/transactions')

  await waitFor(() => {
    expect(listAlert()).toHaveTextContent('Failed to fetch transactions')
  })
})
