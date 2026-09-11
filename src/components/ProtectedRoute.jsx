import { Navigate, useLocation } from 'react-router-dom'
import useCustomerAuth from '../auth/useCustomerAuth.js'

export default function ProtectedRoute({ children }) {
  const { customer } = useCustomerAuth()
  const location = useLocation()

  if (!customer) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
