// the persistent header and the content column every view renders into

import { NavLink, Outlet, useLocation } from 'react-router'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import MonthStepper from './MonthStepper'
import UploadStatement from './UploadStatement'
import type { UploadResult } from './api'
import { isSamePeriod, uploadedPeriod } from './period'
import { useMonth } from './useMonth'
import type { Shell } from './useShell'
import { useTransactions } from './useTransactions'

const VIEWS = [
  { to: '/', label: 'Overview' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/review', label: 'Review' },
]

function AppShell() {
  const [period, setPeriod] = useMonth()
  const data = useTransactions(period)
  const { search } = useLocation()

  // moves to the uploaded month, or refetches when it is already in view
  function handleUploaded(result: UploadResult) {
    const target = uploadedPeriod(result) ?? period
    if (isSamePeriod(target, period)) data.reload()
    else setPeriod(target)
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b bg-background">
        <div className="mx-auto grid max-w-5xl grid-cols-[1fr_auto_1fr] items-center gap-y-3 px-8 pt-4">
          <h1 className="text-base font-semibold tracking-tight">Budget Friend</h1>

          <MonthStepper period={period} onChange={setPeriod} />

          <div className="flex justify-end gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                  Import
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Import a statement</DialogTitle>
                  <DialogDescription>
                    Choose a statement PDF and the account it came from.
                  </DialogDescription>
                </DialogHeader>
                <UploadStatement onUploaded={handleUploaded} />
              </DialogContent>
            </Dialog>
            <Button variant="outline" size="sm" disabled>
              Categories
            </Button>
          </div>

          <nav aria-label="Views" className="col-span-full flex gap-6">
            {VIEWS.map(({ to, label }) => (
              <NavLink
                key={to}
                to={{ pathname: to, search }}
                end
                className={({ isActive }) =>
                  cn(
                    'border-b-2 border-transparent pt-2 pb-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground',
                    isActive && 'border-foreground text-foreground',
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-7">
        <Outlet context={{ ...data, period } satisfies Shell} />
      </main>
    </div>
  )
}

export default AppShell
