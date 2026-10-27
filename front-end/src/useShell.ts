// the month and transaction state the app shell shares with every view

import { useOutletContext } from 'react-router'

import type { Period } from './period'
import type { useTransactions } from './useTransactions'

export type Shell = ReturnType<typeof useTransactions> & {
  period: Period
  // opens the header's import dialog
  openImport: () => void
}

export function useShell() {
  return useOutletContext<Shell>()
}
