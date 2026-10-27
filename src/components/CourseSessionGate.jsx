import { Link, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../store/authContext.js'
import { loginPath } from '../lib/auth-navigation.js'
import { catalogueQuery } from '../lib/search.js'

/** This UI guard preserves the destination; the API independently verifies the cookie and role. */
export default function CourseSessionGate({ children }) {
  const { user, loading } = useAuth()
  const location = useLocation()
  if (loading)
    return (
      <p className="shell section" role="status">
        Checking customer session...
      </p>
    )
  if (!user) return <Navigate to={loginPath(location.pathname + location.search)} replace />
  if (user.role !== 'customer')
    return (
      <section className="section shell">
        <h1>Customer account required</h1>
        <p role="alert">Staff accounts cannot use checkout. Sign out to use a customer account.</p>
        <Link to={'/products' + catalogueQuery(location.search)}>Continue shopping</Link>
      </section>
    )
  return children
}
