// the viewed month, held in the url's ?month= search param

import { useCallback, useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router'

import {
  currentPeriod,
  fromMonthParam,
  isAfterPeriod,
  toMonthParam,
  type Period,
} from './period'

export function useMonth() {
  const [searchParams, setSearchParams] = useSearchParams()
  const param = searchParams.get('month')

  // falls back to the current month when the url holds none, an unreadable
  // one, or one in the future
  const period = useMemo(() => {
    const now = currentPeriod()
    const parsed = fromMonthParam(param)
    return parsed && !isAfterPeriod(parsed, now) ? parsed : now
  }, [param])

  const setPeriod = useCallback(
    (target: Period, options?: { replace?: boolean }) => {
      setSearchParams(
        current => {
          const next = new URLSearchParams(current)
          next.set('month', toMonthParam(target))
          return next
        },
        options,
      )
    },
    [setSearchParams],
  )

  // rewrites a missing or fallen-back month into the url in place
  useEffect(() => {
    if (param !== toMonthParam(period)) setPeriod(period, { replace: true })
  }, [param, period, setPeriod])

  return [period, setPeriod] as const
}
