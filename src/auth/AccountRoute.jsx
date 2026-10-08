import { Navigate } from 'react-router-dom'
import { useSession } from './SessionContext.js'
import Button from '../components/Button.jsx'

// Zehai's customer accounts section starts here: account page access and recovery.
export default function AccountRoute({ children, guest = false }) {
  const { user, status, error, refresh } = useSession()
  if (status === 'loading') return <section className="section shell" role="status">Checking your account...</section>
  if (status === 'error') return <section className="section shell">
    <h1>Account unavailable</h1><p role="alert">{error}</p>
    <Button onClick={refresh}>Try again</Button>
  </section>
  if (!guest && !user) return <Navigate to="/login" replace state={{ message: 'Please sign in to view your profile.' }} />
  if (guest && user) return <Navigate to="/profile" replace />
  return children
}
// Zehai's customer accounts section stops here.
