import { useSyncExternalStore } from 'react'
import { useUsers } from './userStore.js'

const sessionKey = 'entertainment-guild-staff'
const listeners = new Set()
let currentUser = null

try {
  const saved = JSON.parse(sessionStorage.getItem(sessionKey))
  if (saved && ['admin', 'employee'].includes(saved.role) && typeof saved.name === 'string') currentUser = saved
} catch {
  // Start signed out when saved session data is unavailable or invalid.
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useStaffSession() {
  const session = useSyncExternalStore(subscribe, () => currentUser)
  const users = useUsers()
  const account = users.find(user => user.userId === session?.userId)
  return account && ['admin', 'employee'].includes(account.role) ? account : null
}

export function signInStaff({ userId, name, role }) {
  currentUser = { userId, name, role }
  try {
    sessionStorage.setItem(sessionKey, JSON.stringify(currentUser))
  } catch {
    // The in-memory session still works if browser storage is unavailable.
  }
  listeners.forEach(listener => listener())
}

export function signOutStaff() {
  currentUser = null
  try {
    sessionStorage.removeItem(sessionKey)
  } catch {
    // Clear the in-memory session even if browser storage is unavailable.
  }
  listeners.forEach(listener => listener())
}
