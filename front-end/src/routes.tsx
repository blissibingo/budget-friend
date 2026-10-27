// the route table: three views inside the app shell

import type { RouteObject } from 'react-router'

import AppShell from './AppShell'
import OverviewView from './views/OverviewView'
import ReviewView from './views/ReviewView'
import ToOverview from './views/ToOverview'
import TransactionsView from './views/TransactionsView'

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <OverviewView /> },
      { path: 'transactions', element: <TransactionsView /> },
      { path: 'review', element: <ReviewView /> },
      { path: '*', element: <ToOverview /> },
    ],
  },
]
