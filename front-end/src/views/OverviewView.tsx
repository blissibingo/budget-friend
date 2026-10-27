// how the month went: the net headline, the figures, and where the spending went

import { useMemo } from 'react'
import { Link, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import SpendingBreakdown from '../SpendingBreakdown'
import { money } from '../money'
import { formatPeriod } from '../period'
import { summarize } from '../summary'
import { useShell } from '../useShell'

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <span>
      {label} <strong className="font-medium text-foreground tabular-nums">{money.format(value)}</strong>
    </span>
  )
}

function ReviewLine({ count }: { count: number }) {
  const { search } = useLocation()

  if (count === 0) {
    return <p className="text-sm text-muted-foreground">Every transaction has a category.</p>
  }

  return (
    <Link
      to={{ pathname: '/review', search }}
      className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <span className="size-2 rounded-full bg-chart-none" aria-hidden />
      {count} {count === 1 ? 'transaction still needs' : 'transactions still need'} a category
      <span aria-hidden>→</span>
    </Link>
  )
}

function OverviewView() {
  const { transactions, categories, period, loading, error, openImport } = useShell()
  const summary = useMemo(
    () => summarize(transactions, categories),
    [transactions, categories],
  )

  // shows the error, or a loading line, until the month's load settles
  if (loading || error !== null) {
    return (
      <section aria-label="Overview" aria-busy={loading}>
        {error !== null ? (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        ) : (
          <p className="text-muted-foreground">Loading {formatPeriod(period)}…</p>
        )}
      </section>
    )
  }

  if (transactions.length === 0) {
    return (
      <section
        aria-label="Overview"
        className="grid justify-items-center gap-3 rounded-xl border border-dashed px-6 py-16 text-center"
      >
        <h2 className="text-lg font-semibold">Nothing imported for {formatPeriod(period)}</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Import a statement covering this month to see how it went.
        </p>
        <Button onClick={openImport}>Import a statement</Button>
      </section>
    )
  }


  return (
    <section aria-label="Overview" className="grid gap-8">
      <div className="grid gap-2">
        <p className="text-sm text-muted-foreground">{formatPeriod(period)}</p>
        <h2 className="text-3xl font-semibold tracking-tight">
          You finished the month{' '}
          {summary.net === 0 ? (
            'even'
          ) : (
            <span className={summary.net > 0 ? 'text-emerald-400' : 'text-destructive'}>
              {summary.net > 0 ? 'up' : 'down'} {money.format(Math.abs(summary.net))}
            </span>
          )}
        </h2>
        <p
          role="group"
          aria-label="Month figures"
          className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
          <Figure label="Income" value={summary.income} />
          <Figure label="Spent" value={summary.spending} />
          <Figure label="Saved" value={summary.saved} />
        </p>
      </div>

      {summary.byCategory.length === 0 ? (
        <p className="text-muted-foreground">No spending this month.</p>
      ) : (
        <SpendingBreakdown
          byCategory={summary.byCategory}
          categories={categories}
          total={summary.spending}
        />
      )}

      <ReviewLine count={summary.uncategorizedCount} />
    </section>
  )
}

export default OverviewView
