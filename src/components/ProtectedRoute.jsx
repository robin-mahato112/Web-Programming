import { Navigate, useLocation } from 'react-router-dom'
import useCustomerAuth from '../auth/useCustomerAuth.js'

// Zehai's Assignment 1.2 code starts here: redirect signed-out customers to login.
export default function ProtectedRoute({ children }) {
  const { customer } = useCustomerAuth()
  const location = useLocation()

  if (!customer) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />
  }

  return children
}
// Zehai's Assignment 1.2 code stops here.
