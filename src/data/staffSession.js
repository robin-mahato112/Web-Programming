import { useSyncExternalStore } from 'react'
import api from '../api.js'
import { errorMessage, field, listAll, resetResources } from './backend.js'

// The login cookie is HttpOnly, so the browser cannot read it. GET /me tells us whether it is still valid.
const listeners = new Set()
let state = { status: 'loading', user: null }

// Admins also enter an admin code. The backend has no such field, so the code is checked here and the
// verified admin's id is remembered so a page reload does not skip the check.
const adminCode = import.meta.env.VITE_ADMIN_CODE || 'ADMIN001'
const verifiedKey = 'entertainment-guild-admin-verified'

function readVerified() {
  try {
    return localStorage.getItem(verifiedKey)
  } catch {
    return null
  }
}

function writeVerified(userId) {
  try {
    if (userId === null) localStorage.removeItem(verifiedKey)
    else localStorage.setItem(verifiedKey, String(userId))
  } catch {
    // Without storage the admin is asked for the code again after a reload.
  }
}

function setState(next) {
  state = next
  listeners.forEach(listener => listener())
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

// Backend roles: ADMIN (User.IsAdmin) and STAFF map to the app's admin and employee areas. Patrons are customers.
const roleFromToken = role => ({ ADMIN: 'admin', STAFF: 'employee' })[role] ?? null

async function loadStaffUser(id, role) {
  const [record] = await listAll('User', { where: `(UserID,eq,${id})`, fields: 'UserID,UserName,Email,Name' })
  if (!record) throw new Error('Signed-in user not found.')
  const username = field(record, 'UserName')
  return { userId: id, username, name: field(record, 'Name') || username, email: field(record, 'Email'), role }
}

async function restoreSession() {
  try {
    const { data } = await api.get('/me')
    const role = roleFromToken(data.role)
    if (role === 'admin' && readVerified() !== String(data.id)) {
      await api.post('/logout')
      setState({ status: 'ready', user: null })
      return
    }
    setState({ status: 'ready', user: role ? await loadStaffUser(data.id, role) : null })
  } catch {
    setState({ status: 'ready', user: null })
  }
}

restoreSession()

// When the cookie expires mid-session, the next staff request fails with 401; treat that as being signed out.
api.interceptors.response.use(undefined, error => {
  const url = error.config?.url ?? ''
  if (error.response?.status === 401 && state.user && !url.endsWith('/login') && !url.endsWith('/me')) {
    resetResources()
    setState({ status: 'ready', user: null })
  }
  return Promise.reject(error)
})

export function useStaffSession() {
  return useSyncExternalStore(subscribe, () => state).user
}

export function useStaffSessionStatus() {
  return useSyncExternalStore(subscribe, () => state).status
}

export async function signInStaff(username, password, code = '') {
  try {
    const { data } = await api.post('/login', { username, password })
    const role = roleFromToken(data.role)
    if (!role) return { error: 'This account cannot use the staff area.' }
    if (role === 'admin' && code.trim() !== adminCode) {
      await api.post('/logout')
      return { error: code.trim() ? 'Admin code is incorrect.' : 'This is an admin account. Enter your admin code.', field: 'adminCode' }
    }
    writeVerified(role === 'admin' ? data.id : null)
    const user = await loadStaffUser(data.id, role)
    resetResources()
    setState({ status: 'ready', user })
    return { user }
  } catch (error) {
    return { error: error.response?.status === 401 ? 'Username or password is incorrect.' : errorMessage(error) }
  }
}

export async function signOutStaff() {
  writeVerified(null)
  resetResources()
  setState({ status: 'ready', user: null })
  try {
    await api.post('/logout')
  } catch {
    // The local session is already cleared; the cookie expires on its own if the backend is unreachable.
  }
}
