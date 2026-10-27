import { useState } from 'react'
import { restoreSession, useSessionError, useSessionStatus } from '../data/session.js'

export default function SessionStatus() {
  const status = useSessionStatus()
  const error = useSessionError()
  const [pending, setPending] = useState(false)
  if (status === 'loading') return <p role="status">Checking your sign in...</p>
  if (!error) return null
  const retry = async () => {
    setPending(true)
    try {
      await restoreSession()
    } finally {
      setPending(false)
    }
  }
  return (
    <div className="notice notice--error">
      <p role="alert">{error}</p>
      <button className="button button--secondary" type="button" disabled={pending} onClick={retry}>
        {pending ? 'Checking account...' : 'Try again'}
      </button>
    </div>
  )
}
