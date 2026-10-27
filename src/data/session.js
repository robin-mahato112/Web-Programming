import { useSyncExternalStore } from 'react'
import api from '../api.js'
import { errorMessage, field, listAll, readRow, resetResources } from './backend.js'

// A revision prevents a delayed request from restoring a previous customer after logout.
const listeners = new Set()
let state = { status: 'loading', user: null, error: '' }
let revision = 0
const setState = (next) => {
  state = next
  listeners.forEach((listener) => listener())
}
const subscribe = (listener) => {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
const snapshot = () => state
export const roleLabel = (role) => role.charAt(0).toUpperCase() + role.slice(1)
export const staffHome = (user) => (user.role === 'admin' ? '/admin' : '/employee')
export const isStaff = (user) => user?.role === 'admin' || user?.role === 'employee'
const roleFromToken = (role) =>
  ({ ADMIN: 'admin', STAFF: 'employee', PATRON: 'customer' })[role] ?? null

async function loadUser(id, role) {
  const record =
    role === 'customer'
      ? await readRow('Patrons', id, { fields: 'UserID,Name,Email' })
      : (
          await listAll('User', {
            where: `(UserID,eq,${id})`,
            fields: 'UserID,UserName,Email,Name',
          })
        )[0]
  if (!record) throw new Error('Signed-in account not found.')
  return {
    userId: id,
    username: field(record, 'UserName'),
    name: field(record, 'Name') || field(record, 'Email'),
    email: field(record, 'Email'),
    role,
  }
}

function expireSession() {
  ++revision
  resetResources()
  setState({
    status: 'ready',
    user: null,
    error: 'Your session has expired. Sign in again; your bag has been kept.',
  })
}
globalThis.addEventListener?.('entertainment-guild:course-session-expired', expireSession)

export async function restoreSession() {
  const version = ++revision
  let identityChanged = false
  try {
    const { data } = await api.get('/me')
    const role = roleFromToken(data.role)
    if (!role || !/^[1-9]\d*$/.test(String(data.id))) throw new Error('Invalid session response.')
    identityChanged = data.id !== state.user?.userId || role !== state.user?.role
    if (version !== revision) return
    if (identityChanged) {
      resetResources()
      setState({ status: 'loading', user: null, error: '' })
    }
    const user = await loadUser(data.id, role)
    if (version === revision) setState({ status: 'ready', user, error: '' })
  } catch (error) {
    if (version !== revision) return
    if (error.response?.status === 401) {
      if (error.response?.data?.error === 'Invalid or expired token')
        await api.post('/logout').catch(() => {})
      if (version === revision) setState({ status: 'ready', user: null, error: '' })
    } else
      setState({
        status: state.user && !identityChanged ? 'ready' : 'error',
        user: identityChanged ? null : state.user,
        error: errorMessage(error),
      })
  }
}
restoreSession()
globalThis.addEventListener?.('focus', restoreSession)
api.interceptors.response.use(undefined, (error) => {
  if (
    error.response?.status === 401 &&
    state.user &&
    !/\/(login|patronLogin|me)$/.test(error.config?.url ?? '')
  )
    expireSession()
  return Promise.reject(error)
})
export function useSession() {
  return useSyncExternalStore(subscribe, snapshot).user
}
export function useSessionStatus() {
  return useSyncExternalStore(subscribe, snapshot).status
}
export function useSessionError() {
  return useSyncExternalStore(subscribe, snapshot).error
}
export function useStaffSession() {
  const user = useSession()
  return isStaff(user) ? user : null
}
export const getSessionUser = () => state.user

async function signIn(path, username, password, staff) {
  const version = ++revision
  try {
    const { data } = await api.post(path, { username, password })
    const role = roleFromToken(data.role)
    if (staff ? !isStaff({ role }) : role !== 'customer') throw new Error('Incorrect account type.')
    const user = await loadUser(data.id, role)
    if (version !== revision) return { error: 'The session changed. Please try again.' }
    resetResources()
    setState({ status: 'ready', user, error: '' })
    return { user }
  } catch (error) {
    if (version === revision) setState({ status: 'ready', user: null, error: '' })
    return {
      error:
        error.response?.status === 401
          ? staff
            ? 'Username or password is incorrect.'
            : 'Email or password is incorrect.'
          : errorMessage(error),
    }
  }
}
export const signInStaff = (username, password) => signIn('/login', username, password, true)
export const signInCustomer = (email, password) => signIn('/patronLogin', email, password, false)

export async function signOut() {
  const version = ++revision
  // Keep the UI signed in when the server could not remove its cookie.
  try {
    await api.post('/logout')
  } catch {
    throw new Error('Could not sign out. Please try again.')
  }
  if (version !== revision) return
  resetResources()
  setState({ status: 'ready', user: null, error: '' })
}
