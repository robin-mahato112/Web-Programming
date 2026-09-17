import { useContext } from 'react'
import AuthContext from './AuthContext.js'

// Zehai's Assignment 1.2 code starts here: access to the shared customer authentication state.
export default function useCustomerAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider')
  return value
}
// Zehai's Assignment 1.2 code stops here.
