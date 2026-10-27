import TransactionList from '../TransactionList'
import { useShell } from '../useShell'

function TransactionsView() {
  const { transactions, categories, period, loading, error, editTransaction, removeTransaction } =
    useShell()

  return (
    <TransactionList
      transactions={transactions}
      categories={categories}
      period={period}
      loading={loading}
      error={error}
      onEdit={editTransaction}
      onDelete={removeTransaction}
    />
  )
}

export default TransactionsView
