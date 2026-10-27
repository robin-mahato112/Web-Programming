import { AuthContext } from './authContext.js'
import {
  restoreSession,
  signOut,
  useSession,
  useSessionError,
  useSessionStatus,
} from '../data/session.js'

// Shopping and accounts share one cookie-backed session, including logout and expiry.
export default function AuthProvider({ children }) {
  const session = useSession()
  const status = useSessionStatus()
  const error = useSessionError()
  const user = session && {
    ...session,
    id: String(session.userId),
    patronId: session.role === 'customer' ? String(session.userId) : null,
  }
  return (
    <AuthContext.Provider
      value={{
        user,
        loading: status === 'loading',
        error,
        reload: restoreSession,
        logout: signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
