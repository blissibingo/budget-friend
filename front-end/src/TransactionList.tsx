import { useId, useState } from 'react'

import { Button } from '@/components/ui/button'
import type { Category, Transaction, TransactionEdit } from './api'
import { formatPeriod, type Period } from './period'

// the editable text fields, held as strings while the row is being typed into
type Draft = {
  date: string
  merchant: string
  description: string
  amount: string
}

function toDraft(transaction: Transaction): Draft {
  return {
    date: transaction.date.slice(0, 10),
    merchant: transaction.merchant,
    description: transaction.description ?? '',
    amount: transaction.amount,
  }
}

type RowProps = {
  transaction: Transaction
  categories: Category[]
  onEdit: (id: number, edit: TransactionEdit) => Promise<Transaction | null>
  onDelete: (id: number) => void
}

function TransactionRow({ transaction, categories, onEdit, onDelete }: RowProps) {
  const [draft, setDraft] = useState(() => toDraft(transaction))

  // sends the field if it changed, then resyncs that one field with the
  // server's copy, leaving fields being typed into meanwhile untouched
  async function commit(field: keyof Draft, edit: TransactionEdit) {
    const stored = toDraft(transaction)
    if (draft[field] === stored[field]) return

    // date and amount are required, so an emptied field reverts
    if (draft[field] === '' && field !== 'description') {
      setDraft(current => ({ ...current, [field]: stored[field] }))
      return
    }

    const next = toDraft((await onEdit(transaction.id, edit)) ?? transaction)
    setDraft(current => ({ ...current, [field]: next[field] }))
  }

  return (
    <tr className="[&>td]:py-1 [&>td]:pr-2">
      <td>
        <input
          aria-label="Date"
          type="date"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={draft.date}
          onChange={event => setDraft({ ...draft, date: event.target.value })}
          onBlur={() => commit('date', { date: draft.date })}
        />
      </td>
      <td>
        <input
          aria-label="Merchant"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={draft.merchant}
          onChange={event => setDraft({ ...draft, merchant: event.target.value })}
          onBlur={() => commit('merchant', { merchant: draft.merchant })}
        />
      </td>
      <td>
        <input
          aria-label="Description"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={draft.description}
          onChange={event => setDraft({ ...draft, description: event.target.value })}
          onBlur={() => commit('description', { description: draft.description || null })}
        />
      </td>
      <td>
        <input
          aria-label="Amount"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm w-28 text-right tabular-nums"
          type="number"
          step="0.01"
          value={draft.amount}
          onChange={event => setDraft({ ...draft, amount: event.target.value })}
          onBlur={() => commit('amount', { amount: draft.amount })}
        />
      </td>
      <td>
        <select
          aria-label="Category"
          className="h-8 rounded-md border border-input bg-transparent px-2 text-sm"
          value={transaction.category_id === null ? '' : String(transaction.category_id)}
          onChange={event =>
            onEdit(transaction.id, {
              category_id: event.target.value === '' ? null : Number(event.target.value),
            })
          }
        >
          <option value="">Uncategorized</option>
          {categories.map(category => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
      </td>
      <td>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDelete(transaction.id)}
        >
          Delete
        </Button>
      </td>
    </tr>
  )
}

type ListProps = {
  transactions: Transaction[]
  categories: Category[]
  period: Period
  loading: boolean
  error: string | null
  onEdit: (id: number, edit: TransactionEdit) => Promise<Transaction | null>
  onDelete: (id: number) => void
}

function TransactionList({
  transactions,
  categories,
  period,
  loading,
  error,
  onEdit,
  onDelete,
}: ListProps) {
  const headingId = useId()

  return (
    <section aria-labelledby={headingId} className="grid gap-3">
      <h2 id={headingId} className="text-lg font-semibold">
        Transactions
      </h2>

      {/* always-mounted live region for the outcome of an edit */}
      <p role="alert" className="text-destructive">
        {error}
      </p>

      {loading ? (
        <p className="text-muted-foreground">Loading transactions…</p>
      ) : transactions.length === 0 ? (
        <>
          <p>No transactions for {formatPeriod(period)}.</p>
          <p>Use Import to add a statement for that month.</p>
        </>
      ) : (
        <table className="text-left text-sm">
          <thead>
            <tr className="text-muted-foreground [&>th]:pb-2 [&>th]:font-medium">
              <th scope="col">Date</th>
              <th scope="col">Merchant</th>
              <th scope="col">Description</th>
              <th scope="col">Amount</th>
              <th scope="col">Category</th>
              <th scope="col">
                <span aria-hidden="true">Remove</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {transactions.map(transaction => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                categories={categories}
                onEdit={onEdit}
                onDelete={onDelete}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}

export default TransactionList
