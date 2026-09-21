import { useSyncExternalStore } from 'react'
import { existingAdmins } from './mockAdmins.js'
import { existingEmployees } from './mockEmployees.js'
import { existingCustomers } from './mockCustomers.js'

const storageKey = 'entertainment-guild-users'
export const userRoles = ['customer', 'employee', 'admin']
const listeners = new Set()
let users = [...existingAdmins, ...existingEmployees, ...existingCustomers.map(user => ({ ...user, role: 'customer' }))]

try {
  const saved = JSON.parse(localStorage.getItem(storageKey))
  if (Array.isArray(saved)) {
    const restored = users.map(user => {
      const record = saved.find(item => item?.userId === user.userId)
      if (!record || typeof record.name !== 'string' || !record.name.trim() || !userRoles.includes(record.role)) return user
      const adminCode = typeof record.adminCode === 'string' ? record.adminCode.trim() : user.adminCode
      if (record.role === 'admin' && !adminCode) return user
      return { ...user, name: record.name.trim(), role: record.role, adminCode }
    })
    if (restored.some(user => user.role === 'admin')) users = restored
  }
} catch {
  // Use sample accounts when browser storage is unavailable or invalid.
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getUsers = () => users
export function useUsers() {
  return useSyncExternalStore(subscribe, getUsers)
}

export function updateUser(userId, values, actor) {
  if (actor?.role !== 'admin' || !users.some(user => user.userId === actor.userId && user.role === 'admin')) return { error: 'Only admins can manage users.' }
  const user = users.find(record => record.userId === userId)
  if (!user) return { error: 'User not found.' }
  const errors = {}
  const name = values.name?.trim() || ''
  if (!name || name.length > 100) errors.name = 'Enter a name between 1 and 100 characters.'
  if (!userRoles.includes(values.role)) errors.role = 'Choose a valid role.'
  const adminCode = user.adminCode || values.adminCode?.trim()
  if (values.role === 'admin' && !adminCode) errors.adminCode = 'Set an admin code for this account to use at admin sign in.'
  if (user.role === 'admin' && values.role !== 'admin' && users.filter(record => record.role === 'admin').length === 1) errors.role = 'At least one admin account is required.'
  if (Object.keys(errors).length) return { errors }
  users = users.map(record => record.userId === userId ? { ...record, name, role: values.role, adminCode } : record)
  let persisted = true
  try {
    localStorage.setItem(storageKey, JSON.stringify(users.map(({ userId, name, role, adminCode }) => ({ userId, name, role, adminCode }))))
  } catch {
    persisted = false
  }
  listeners.forEach(listener => listener())
  return { persisted }
}
