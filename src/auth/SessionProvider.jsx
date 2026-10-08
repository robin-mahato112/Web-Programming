import { useCallback, useEffect, useRef, useState } from 'react'
import { getSession, logout } from '../services/customerApi.js'
import { SessionContext } from './SessionContext.js'

// Zehai's customer accounts section starts here: restore and update the cookie session.
export default function SessionProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading')
  const [error, setError] = useState('')
  const version = useRef(0)

  const acceptSession = useCallback(user => {
    version.current += 1
    setUser(user)
    setError('')
    setStatus('ready')
  }, [])

  const refresh = useCallback(async () => {
    const current = ++version.current
    try {
      const user = await getSession()
      if (current === version.current) acceptSession(user)
    } catch (error) {
      if (current !== version.current) return
      if (error.status === 401) acceptSession(null)
      else { setError(error.message); setStatus('error') }
    }
  }, [acceptSession])

  useEffect(() => {
    const current = ++version.current
    getSession().then(user => {
      if (current === version.current) acceptSession(user)
    }).catch(error => {
      if (current !== version.current) return
      if (error.status === 401) acceptSession(null)
      else { setError(error.message); setStatus('error') }
    })
    const expire = () => acceptSession(null)
    window.addEventListener('customer-session-expired', expire)
    window.addEventListener('focus', refresh)
    return () => {
      version.current += 1
      window.removeEventListener('customer-session-expired', expire)
      window.removeEventListener('focus', refresh)
    }
  }, [refresh, acceptSession])

  async function signOut() {
    await logout()
    acceptSession(null)
  }

  return <SessionContext.Provider value={{ user, status, error, refresh, acceptSession, signOut }}>
    {children}
  </SessionContext.Provider>
}
// Zehai's customer accounts section stops here.
