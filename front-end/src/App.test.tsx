import { beforeEach, expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

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
import App from './App'

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

function summary() {
  return screen.getByRole('region', { name: /summary/i })
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

async function uploadStatementFile(user: ReturnType<typeof userEvent.setup>) {
  await user.upload(
    screen.getByLabelText(/statement pdf/i),
    new File(['%PDF-1.4'], 'statement.pdf', { type: 'application/pdf' }),
  )
  await user.click(screen.getByRole('button', { name: /^upload/i }))
}

beforeEach(() => {
  getTransactionsMock.mockReset().mockResolvedValue([])
  getCategoriesMock.mockReset().mockResolvedValue(CATEGORIES)
  updateTransactionMock.mockReset()
  deleteTransactionMock.mockReset().mockResolvedValue(undefined)
  uploadStatementMock.mockReset()
})

test('loads the current month on mount', async () => {
  getTransactionsMock.mockResolvedValue([transaction()])
  const now = new Date()

  render(<App />)

  expect(screen.getByRole('heading', { name: 'Budget Friend' })).toBeInTheDocument()
  expect(screen.getByLabelText(/statement pdf/i)).toBeInTheDocument()

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

  render(<App />)

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

  render(<App />)

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

  render(<App />)

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
  render(<App />)

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

  render(<App />)

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

  render(<App />)

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

  render(<App />)

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

test('an empty month names the period and points at the uploader', async () => {
  const user = userEvent.setup()

  render(<App />)

  await screen.findByText(label(CURRENT))
  await user.click(stepButton('Previous'))

  expect(
    await screen.findByText(`No transactions for ${label(PREVIOUS)}.`),
  ).toBeInTheDocument()
  expect(screen.getByText(/upload a statement/i)).toBeInTheDocument()
})

test('assigning a category persists it and keeps it on screen', async () => {
  getTransactionsMock.mockResolvedValue([transaction()])
  updateTransactionMock.mockResolvedValue(transaction({ category_id: 7 }))
  const user = userEvent.setup()

  render(<App />)

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

  render(<App />)

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

test('summarizes the loaded month above the list', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ id: 1, amount: '-42.50', category_id: 7 }),
    transaction({ id: 2, amount: '-60.00', merchant: 'Petro-Canada' }),
  ])

  render(<App />)

  await screen.findByDisplayValue('Loblaws')
  expect(
    within(summary()).getByText(new RegExp(`total spend for ${label(CURRENT)}`, 'i')),
  ).toHaveTextContent('$102.50')
  expect(
    within(summary())
      .getAllByRole('listitem')
      .map(entry => entry.textContent),
  ).toEqual(['Groceries$42.50', 'Uncategorized$60.00'])

  // the strip precedes the list in the document
  expect(
    summary().compareDocumentPosition(screen.getByRole('region', { name: /transactions/i })),
  ).toBe(Node.DOCUMENT_POSITION_FOLLOWING)
})

test('the breakdown follows a category change in the list', async () => {
  getTransactionsMock.mockResolvedValue([transaction({ amount: '-42.50' })])
  updateTransactionMock.mockResolvedValue(
    transaction({ amount: '-42.50', category_id: 7 }),
  )
  const user = userEvent.setup()

  render(<App />)

  await screen.findByDisplayValue('Loblaws')
  expect(within(summary()).getByRole('listitem')).toHaveTextContent(
    'Uncategorized$42.50',
  )

  await user.selectOptions(within(rowFor('Loblaws')).getByLabelText(/category/i), '7')

  await waitFor(() => {
    expect(within(summary()).getByRole('listitem')).toHaveTextContent('Groceries$42.50')
  })
})

test('the total follows a deleted row', async () => {
  getTransactionsMock.mockResolvedValue([
    transaction({ id: 1, amount: '-42.50' }),
    transaction({ id: 2, amount: '-60.00', merchant: 'Petro-Canada' }),
  ])
  const user = userEvent.setup()

  render(<App />)

  await screen.findByDisplayValue('Loblaws')
  await user.click(within(rowFor('Loblaws')).getByRole('button', { name: /delete/i }))

  await waitFor(() => {
    expect(within(summary()).getByText(/total spend/i)).toHaveTextContent('$60.00')
  })
})

test('the summary follows the month stepper', async () => {
  getTransactionsMock
    .mockResolvedValueOnce([transaction({ amount: '-42.50' })])
    .mockResolvedValueOnce([
      transaction({ id: 2, amount: '-60.00', merchant: 'Petro-Canada' }),
    ])
  const user = userEvent.setup()

  render(<App />)

  await screen.findByDisplayValue('Loblaws')
  await user.click(stepButton('Previous'))

  await screen.findByDisplayValue('Petro-Canada')
  expect(
    within(summary()).getByText(new RegExp(`total spend for ${label(PREVIOUS)}`, 'i')),
  ).toHaveTextContent('$60.00')
})

test('a failed month load withholds the previous month total', async () => {
  getTransactionsMock
    .mockResolvedValueOnce([transaction({ amount: '-42.50' })])
    .mockRejectedValueOnce(new ApiError(500, 'Failed to fetch transactions'))
  const user = userEvent.setup()

  render(<App />)

  await screen.findByDisplayValue('Loblaws')
  await user.click(stepButton('Previous'))

  await waitFor(() => {
    expect(listAlert()).toHaveTextContent('Failed to fetch transactions')
  })
  expect(within(summary()).queryByText('$42.50')).not.toBeInTheDocument()
  expect(
    within(summary()).getByText(new RegExp(`total spend for ${label(PREVIOUS)}`, 'i')),
  ).toHaveTextContent('—')
})

test('an empty month summarizes as zero', async () => {
  const user = userEvent.setup()

  render(<App />)

  await screen.findByText(label(CURRENT))
  await user.click(stepButton('Previous'))

  await waitFor(() => {
    expect(within(summary()).getByText(/total spend/i)).toHaveTextContent('$0.00')
  })
  expect(within(summary()).getByText(/nothing to summarize/i)).toBeInTheDocument()
})

test('shows the server error message when an edit fails', async () => {
  getTransactionsMock.mockResolvedValue([transaction()])
  updateTransactionMock.mockRejectedValue(new ApiError(404, 'Transaction not found'))
  const user = userEvent.setup()

  render(<App />)

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

  render(<App />)

  await waitFor(() => {
    expect(listAlert()).toHaveTextContent('Failed to fetch transactions')
  })
})
