import { useMemo, useState } from 'react'
import AuthContext from './AuthContext.js'
import {
  authenticateCustomer,
  clearCustomerSession,
  createCustomer,
  emailExists,
  getSessionCustomer,
  startCustomerSession,
  updateCustomer,
} from './customerStorage.js'

// Zehai's Assignment 1.2 code starts here: customer session and account actions.
export default function CustomerAuthProvider({ children }) {
  const [customer, setCustomer] = useState(getSessionCustomer)

  const value = useMemo(() => ({
    customer,
    emailExists,
    signIn(email, password) {
      const matchedCustomer = authenticateCustomer(email, password)
      if (!matchedCustomer) return false
      startCustomerSession(matchedCustomer.userId)
      setCustomer(matchedCustomer)
      return true
    },
    signUp(details) {
      const newCustomer = createCustomer(details)
      if (!newCustomer) return false
      setCustomer(newCustomer)
      return true
    },
    signOut() {
      clearCustomerSession()
      setCustomer(null)
    },
    saveProfile(details) {
      const updatedCustomer = updateCustomer(customer.userId, details)
      if (!updatedCustomer) return false
      setCustomer(updatedCustomer)
      return true
    },
  }), [customer])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
// Zehai's Assignment 1.2 code stops here.
