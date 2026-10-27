import { expect, test, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Category, Transaction } from './api'
import TransactionList from './TransactionList'

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

const CATEGORIES: Category[] = [
  { id: 7, name: 'Groceries', user_id: null, color: null, excluded_from_spend: false },
  { id: 8, name: 'Transport', user_id: null, color: null, excluded_from_spend: false },
]

type Props = Parameters<typeof TransactionList>[0]

function renderList(overrides: Partial<Props> = {}) {
  const onEdit = vi.fn<Props['onEdit']>().mockResolvedValue(null)
  const onDelete = vi.fn()

  const props: Props = {
    transactions: [transaction()],
    categories: CATEGORIES,
    period: { month: 8, year: 2026 },
    loading: false,
    error: null,
    onEdit,
    onDelete,
    ...overrides,
  }

  return { ...render(<TransactionList {...props} />), onEdit, onDelete, props }
}

// finds the row whose merchant field holds `merchant`
function rowFor(merchant: string) {
  return screen.getByDisplayValue(merchant).closest('tr') as HTMLElement
}

test('renders a row per transaction', () => {
  renderList({
    transactions: [
      transaction({ id: 1, merchant: 'Loblaws' }),
      transaction({ id: 2, merchant: 'Petro-Canada', amount: '60.00' }),
    ],
  })

  expect(screen.getByDisplayValue('Loblaws')).toBeInTheDocument()
  expect(screen.getByDisplayValue('Petro-Canada')).toBeInTheDocument()
  expect(screen.getByDisplayValue('42.50')).toBeInTheDocument()
  expect(screen.getAllByDisplayValue('2026-08-04')).toHaveLength(2)
})

test('says so while loading and when the month is empty', () => {
  const { rerender, props } = renderList({ transactions: [], loading: true })
  expect(screen.getByText(/loading/i)).toBeInTheDocument()

  rerender(<TransactionList {...props} transactions={[]} loading={false} />)
  expect(screen.getByText('No transactions for August 2026.')).toBeInTheDocument()
  expect(screen.getByText(/use import to add a statement/i)).toBeInTheDocument()
})

test('assigning a category patches the row', async () => {
  const { onEdit } = renderList()
  const user = userEvent.setup()

  await user.selectOptions(within(rowFor('Loblaws')).getByLabelText(/category/i), '7')

  await waitFor(() => {
    expect(onEdit).toHaveBeenCalledWith(1, { category_id: 7 })
  })
})

test('clearing a category patches a null', async () => {
  const { onEdit } = renderList({ transactions: [transaction({ category_id: 7 })] })
  const user = userEvent.setup()

  await user.selectOptions(within(rowFor('Loblaws')).getByLabelText(/category/i), '')

  await waitFor(() => {
    expect(onEdit).toHaveBeenCalledWith(1, { category_id: null })
  })
})

test('editing the merchant patches it on blur', async () => {
  const { onEdit } = renderList()
  const user = userEvent.setup()

  const merchant = within(rowFor('Loblaws')).getByLabelText(/merchant/i)
  await user.clear(merchant)
  await user.type(merchant, 'No Frills')
  await user.tab()

  await waitFor(() => {
    expect(onEdit).toHaveBeenCalledWith(1, { merchant: 'No Frills' })
  })
})

test('editing the amount patches it on blur', async () => {
  const { onEdit } = renderList()
  const user = userEvent.setup()

  const amount = within(rowFor('Loblaws')).getByLabelText(/amount/i)
  await user.clear(amount)
  await user.type(amount, '13.25')
  await user.tab()

  await waitFor(() => {
    expect(onEdit).toHaveBeenCalledWith(1, { amount: '13.25' })
  })
})

test('editing the description patches it on blur', async () => {
  const { onEdit } = renderList()
  const user = userEvent.setup()

  await user.type(
    within(rowFor('Loblaws')).getByLabelText(/description/i),
    'Weekly shop',
  )
  await user.tab()

  await waitFor(() => {
    expect(onEdit).toHaveBeenCalledWith(1, { description: 'Weekly shop' })
  })
})

test('editing the date patches it on blur', async () => {
  const { onEdit } = renderList()
  const user = userEvent.setup()

  const date = within(rowFor('Loblaws')).getByLabelText(/date/i)
  await user.clear(date)
  await user.type(date, '2026-08-11')
  await user.tab()

  await waitFor(() => {
    expect(onEdit).toHaveBeenCalledWith(1, { date: '2026-08-11' })
  })
})

test('leaving a field untouched patches nothing', async () => {
  const { onEdit } = renderList()
  const user = userEvent.setup()

  await user.click(within(rowFor('Loblaws')).getByLabelText(/merchant/i))
  await user.tab()

  expect(onEdit).not.toHaveBeenCalled()
})

test('a resolving edit leaves other fields the user is typing into alone', async () => {
  // holds the merchant patch open while the amount is typed into
  let resolveEdit: (t: Transaction) => void = () => {}
  const onEdit = vi.fn<Props['onEdit']>().mockReturnValue(
    new Promise(resolve => {
      resolveEdit = resolve
    }),
  )
  renderList({ onEdit })
  const user = userEvent.setup()

  const row = rowFor('Loblaws')
  const merchant = within(row).getByLabelText(/merchant/i)
  await user.clear(merchant)
  await user.type(merchant, 'No Frills')

  const amount = within(row).getByLabelText(/amount/i)
  await user.click(amount)
  await user.clear(amount)
  await user.type(amount, '13.25')

  resolveEdit(transaction({ merchant: 'No Frills' }))

  await waitFor(() => {
    expect(within(row).getByLabelText(/merchant/i)).toHaveValue('No Frills')
  })
  expect(within(row).getByLabelText(/amount/i)).toHaveValue(13.25)
})

test('clearing the date or amount reverts instead of patching an empty value', async () => {
  const { onEdit } = renderList()
  const user = userEvent.setup()

  const row = rowFor('Loblaws')
  await user.clear(within(row).getByLabelText(/date/i))
  await user.tab()
  await user.clear(within(row).getByLabelText(/amount/i))
  await user.tab()

  expect(onEdit).not.toHaveBeenCalled()
  expect(within(row).getByLabelText(/date/i)).toHaveValue('2026-08-04')
  expect(within(row).getByLabelText(/amount/i)).toHaveValue(42.5)
})

test('deleting a row hands the id up', async () => {
  const { onDelete } = renderList()
  const user = userEvent.setup()

  await user.click(within(rowFor('Loblaws')).getByRole('button', { name: /delete/i }))

  expect(onDelete).toHaveBeenCalledWith(1)
})

test('shows the error it is given', () => {
  renderList({ error: 'Transaction not found' })

  expect(screen.getByRole('alert')).toHaveTextContent('Transaction not found')
})
