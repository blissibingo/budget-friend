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
    <section aria-labelledby={headingId} className="grid gap-2">
      <h2 id={headingId} className="text-lg font-semibold">
        Summary
      </h2>

      <p>
        Total spend for {formatPeriod(period)}{' '}
        <strong className="tabular-nums">{stale ? '—' : money.format(summary.spending)}</strong>
      </p>
      <p>
        Income <strong className="tabular-nums">{stale ? '—' : money.format(summary.income)}</strong>
      </p>
      <p>
        Net <strong className="tabular-nums">{stale ? '—' : money.format(summary.net)}</strong>
      </p>
      <p>
        Saved <strong className="tabular-nums">{stale ? '—' : money.format(summary.saved)}</strong>
      </p>

      {stale ? null : summary.byCategory.length === 0 ? (
        <p className="text-muted-foreground">Nothing to summarize yet.</p>
      ) : (
        <ul className="mt-2 grid max-w-sm gap-1">
          {summary.byCategory.map(entry => (
            <li key={entry.key} className="flex justify-between">
              <span>{entry.name}</span>
              <span className="tabular-nums">{money.format(entry.total)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default SummaryStrip
