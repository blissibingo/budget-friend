import SummaryStrip from '../SummaryStrip'
import { useShell } from '../useShell'

function OverviewView() {
  const { transactions, categories, period, loading, error } = useShell()

  return (
    <SummaryStrip
      transactions={transactions}
      categories={categories}
      period={period}
      loading={loading}
      error={error}
    />
  )
}

export default OverviewView
