import { Navigate, useLocation } from 'react-router'

// sends an unknown path to the overview, keeping the month
function ToOverview() {
  const { search } = useLocation()
  return <Navigate to={{ pathname: '/', search }} replace />
}

export default ToOverview
