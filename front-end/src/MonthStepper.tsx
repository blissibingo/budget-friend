import { Button } from '@/components/ui/button'
import { currentPeriod, formatPeriod, isSamePeriod, shiftPeriod, type Period } from './period'

type Props = {
  period: Period
  onChange: (period: Period) => void
}

function MonthStepper({ period, onChange }: Props) {
  const atCurrentMonth = isSamePeriod(period, currentPeriod())

  return (
    <nav aria-label="Month" className="flex items-center gap-3">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Previous month"
        onClick={() => onChange(shiftPeriod(period, -1))}
      >
        ‹
      </Button>

      <span className="min-w-32 text-center text-sm font-medium">{formatPeriod(period)}</span>

      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Next month"
        disabled={atCurrentMonth}
        onClick={() => onChange(shiftPeriod(period, 1))}
      >
        ›
      </Button>
    </nav>
  )
}

export default MonthStepper
