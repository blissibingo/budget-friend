// owns the transaction and category state, and every call that changes it

import { useCallback, useEffect, useState } from 'react'

import {
  deleteTransaction,
  getCategories,
  getTransactions,
  updateTransaction,
  type Category,
  type Transaction,
  type TransactionEdit,
} from './api'
import type { Period } from './period'

function errorMessage(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback
}

export function useTransactions(period: Period) {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // bumped to refetch the same month
  const [version, setVersion] = useState(0)
  const { month, year } = period

  // fetches the month along with the categories rows can be assigned to,
  // ignoring a response that a newer load has superseded
  useEffect(() => {
    let current = true
    // eslint-disable-next-line react-hooks/set-state-in-effect -- marks the load as started
    setLoading(true)

    Promise.all([getTransactions({ month, year }), getCategories()])
      .then(([loadedTransactions, loadedCategories]) => {
        if (!current) return
        setTransactions(loadedTransactions)
        setCategories(loadedCategories)
        setError(null)
      })
      .catch(err => {
        if (current) setError(errorMessage(err, 'Failed to load transactions'))
      })
      .finally(() => {
        if (current) setLoading(false)
      })

    return () => {
      current = false
    }
  }, [month, year, version])

  const reload = useCallback(() => setVersion(v => v + 1), [])

  // patches the row and swaps in what the server returned, reporting failure
  const editTransaction = useCallback(async (id: number, edit: TransactionEdit) => {
    setError(null)
    try {
      const updated = await updateTransaction(id, edit)
      setTransactions(current => current.map(t => (t.id === id ? updated : t)))
      return updated
    } catch (err) {
      setError(errorMessage(err, 'Failed to update transaction'))
      return null
    }
  }, [])

  const removeTransaction = useCallback(async (id: number) => {
    setError(null)
    try {
      await deleteTransaction(id)
      setTransactions(current => current.filter(t => t.id !== id))
    } catch (err) {
      setError(errorMessage(err, 'Failed to delete transaction'))
    }
  }, [])

  return {
    transactions,
    categories,
    loading,
    error,
    reload,
    editTransaction,
    removeTransaction,
  }
}
