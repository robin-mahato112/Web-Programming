import { useEffect, useSyncExternalStore } from 'react'
import api, { apiBaseUrl } from '../api.js'

const tablePath = table => `/api/inft3050/${table}`
const pageSize = 1000 // The API caps a page at 1000 rows.

// The API returns the same column with different casing on different endpoints (GenreID / genreID).
export function field(row, name) {
  if (name in row) return row[name]
  const key = Object.keys(row).find(candidate => candidate.toLowerCase() === name.toLowerCase())
  return key === undefined ? undefined : row[key]
}

export async function listAll(table, params = {}) {
  const rows = []
  for (let offset = 0; ; offset += pageSize) {
    const { data } = await api.get(tablePath(table), { params: { ...params, limit: pageSize, offset } })
    rows.push(...data.list)
    if (data.list.length < pageSize) return rows
  }
}

export const readRow = (table, id, params) => api.get(`${tablePath(table)}/${id}`, { params }).then(response => response.data)
export const countRows = (table, params) => api.get(`${tablePath(table)}/count`, { params }).then(response => response.data.count)
export const createRow = (table, values) => api.post(tablePath(table), values).then(response => response.data)
export const patchRow = (table, id, values) => api.patch(`${tablePath(table)}/${id}`, values).then(response => response.data)
export const deleteRow = (table, id) => api.delete(`${tablePath(table)}/${id}`).then(response => response.data)

export function errorMessage(error) {
  if (error.mockSession) return 'The demo admin is not a backend account, so this needs a real staff sign in (for example adminAccount).'
  if (!error.response) return `Cannot reach the backend at ${apiBaseUrl}. Check that the Docker backend is running.`
  if (error.response.status === 401) return 'Your session has expired. Sign in again.'
  if (error.response.status === 403) return 'Your account is not allowed to do this.'
  return error.response.data?.error || `The backend returned an error (${error.response.status}).`
}

const resources = new Set()

// Clears every loaded resource, e.g. on sign out so the next user never sees the previous user's data.
export function resetResources() {
  resources.forEach(resource => resource.reset())
}

// A shared, lazily loaded backend result. Components read it with useResource(); the first reader triggers the load.
export function createResource(loader) {
  const listeners = new Set()
  // Zehai: invalidate requests on account changes, including requests still in flight.
  let version = 0
  let state = { status: 'idle', error: '', data: null }
  const set = next => {
    state = { ...state, ...next }
    listeners.forEach(listener => listener())
  }
  const subscribe = listener => {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }
  const resource = {
    async load() {
      const requestVersion = ++version
      set({ status: 'loading', error: '' })
      try {
        const data = await loader()
        if (requestVersion === version) set({ status: 'ready', data })
      } catch (error) {
        if (requestVersion === version) set({ status: 'error', error: errorMessage(error) })
      }
    },
    update(change) {
      if (!state.data) return
      version++
      set({ status: 'ready', error: '', data: change(state.data) })
    },
    replace(data) {
      version++
      set({ status: 'ready', error: '', data })
    },
    reset() {
      version++
      set({ status: 'idle', error: '', data: null })
    },
    subscribe,
    getState: () => state,
  }
  resources.add(resource)
  return resource
}

export function useResource(resource) {
  const state = useSyncExternalStore(resource.subscribe, resource.getState)
  useEffect(() => {
    if (resource.getState().status === 'idle') resource.load()
  }, [resource, state.status])
  return state
}
