import { createContext, useContext } from 'react'
export const AuthContext = createContext({ user: null, loading: false, error: '' })
export const useAuth = () => useContext(AuthContext)
