import { useId, useMemo } from 'react'

import type { Category, Transaction } from './api'
import { formatPeriod, type Period } from './period'
import { summarize } from './summary'

const money = new Intl.NumberFormat('en-CA', {
  style: 'currency',
  currency: 'CAD',
})

type Props = {
  transactions: Transaction[]
  categories: Category[]
  period: Period
  loading: boolean
  error: string | null
}

function SummaryStrip({ transactions, categories, period, loading, error }: Props) {
  const headingId = useId()
  const summary = useMemo(
    () => summarize(transactions, categories),
    [transactions, categories],
  )

  // the loaded transactions belong to the previous period until a load settles
  const stale = loading || error !== null

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId}>Summary</h2>

      <p>
        Total spend for {formatPeriod(period)}{' '}
        <strong>{stale ? '—' : money.format(summary.spending)}</strong>
      </p>
      <p>
        Income <strong>{stale ? '—' : money.format(summary.income)}</strong>
      </p>
      <p>
        Net <strong>{stale ? '—' : money.format(summary.net)}</strong>
      </p>
      <p>
        Saved <strong>{stale ? '—' : money.format(summary.saved)}</strong>
      </p>

      {stale ? null : summary.byCategory.length === 0 ? (
        <p>Nothing to summarize yet.</p>
      ) : (
        <ul>
          {summary.byCategory.map(entry => (
            <li key={entry.key}>
              <span>{entry.name}</span>
              <span>{money.format(entry.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default SummaryStrip
