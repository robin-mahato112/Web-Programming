import { useContext } from 'react'
import AuthContext from './AuthContext.js'

export default function useCustomerAuth() {
  const value = useContext(AuthContext)
  if (!value) throw new Error('useCustomerAuth must be used inside CustomerAuthProvider')
  return value
}
