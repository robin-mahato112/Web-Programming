import { useSyncExternalStore } from 'react'
import { existingAdmins } from './mockAdmins.js'
import { existingEmployees } from './mockEmployees.js'
import { existingCustomers } from './mockCustomers.js'

const storageKey = 'entertainment-guild-users'
const addedKey = 'entertainment-guild-added-users'
const deletedKey = 'entertainment-guild-deleted-users'
export const userRoles = ['customer', 'employee', 'admin']
const emailPattern = /^\S+@\S+\.\S+$/
const strongPasswordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/
const listeners = new Set()
const sampleUsers = [...existingAdmins, ...existingEmployees, ...existingCustomers.map(user => ({ ...user, role: 'customer' }))]
const sampleIds = new Set(sampleUsers.map(user => user.userId))
let users = sampleUsers

const isText = value => typeof value === 'string' && value.trim() !== ''

try {
  const added = JSON.parse(localStorage.getItem(addedKey))
  if (Array.isArray(added)) {
    const valid = added.filter(user => Number.isInteger(user?.userId) && !sampleIds.has(user.userId) && isText(user.email) && isText(user.password))
    users = [...users, ...valid.filter((user, index) => valid.findIndex(other => other.userId === user.userId) === index)]
  }
  const saved = JSON.parse(localStorage.getItem(storageKey))
  if (Array.isArray(saved)) {
    const restored = users.map(user => {
      const record = saved.find(item => item?.userId === user.userId)
      if (!record || !isText(record.name) || !userRoles.includes(record.role)) return user
      const adminCode = typeof record.adminCode === 'string' ? record.adminCode.trim() : user.adminCode
      if (record.role === 'admin' && !adminCode) return user
      return { ...user, name: record.name.trim(), role: record.role, adminCode }
    })
    users = restored.filter(user => isText(user.name) && userRoles.includes(user.role))
  }
  const deleted = JSON.parse(localStorage.getItem(deletedKey))
  if (Array.isArray(deleted)) users = users.filter(user => !deleted.includes(user.userId))
  if (!users.some(user => user.role === 'admin')) users = sampleUsers
} catch {
  // Use sample accounts when browser storage is unavailable or invalid.
  users = sampleUsers
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export const getUsers = () => users
export function useUsers() {
  return useSyncExternalStore(subscribe, getUsers)
}

const isAdmin = actor => actor?.role === 'admin' && users.some(user => user.userId === actor.userId && user.role === 'admin')

function save() {
  let persisted = true
  try {
    localStorage.setItem(storageKey, JSON.stringify(users.map(({ userId, name, role, adminCode }) => ({ userId, name, role, adminCode }))))
    localStorage.setItem(addedKey, JSON.stringify(users.filter(user => !sampleIds.has(user.userId))))
    localStorage.setItem(deletedKey, JSON.stringify([...sampleIds].filter(id => !users.some(user => user.userId === id))))
  } catch {
    persisted = false
  }
  listeners.forEach(listener => listener())
  return persisted
}

export function addUser(values, actor) {
  if (!isAdmin(actor)) return { error: 'Only admins can add users.' }
  const errors = {}
  const name = values.name?.trim() || ''
  const email = values.email?.trim() || ''
  const adminCode = values.adminCode?.trim() || ''
  if (!name || name.length > 100) errors.name = 'Enter a name between 1 and 100 characters.'
  if (!emailPattern.test(email)) errors.email = 'Enter a valid email address.'
  else if (users.some(user => user.email.toLowerCase() === email.toLowerCase())) errors.email = 'This email is already registered.'
  if (!strongPasswordPattern.test(values.password || '')) errors.password = 'Use 8+ characters with letters and numbers.'
  if (!userRoles.includes(values.role)) errors.role = 'Choose a valid role.'
  if (values.role === 'admin' && !adminCode) errors.adminCode = 'Set an admin code for this account to use at admin sign in.'
  if (Object.keys(errors).length) return { errors }
  // Sample IDs are always counted so a deleted sample account's ID is never reused.
  const userId = Math.max(...sampleIds, ...users.map(user => user.userId)) + 1
  const user = { userId, name, email, password: values.password, role: values.role }
  users = [...users, values.role === 'admin' ? { ...user, adminCode } : user]
  return { persisted: save() }
}

export function updateUser(userId, values, actor) {
  if (!isAdmin(actor)) return { error: 'Only admins can manage users.' }
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
  return { persisted: save() }
}

export function deleteUser(userId, actor) {
  if (!isAdmin(actor)) return { error: 'Only admins can delete users.' }
  const user = users.find(record => record.userId === userId)
  if (!user) return { error: 'User not found.' }
  if (user.userId === actor.userId) return { error: 'You cannot delete your own account.' }
  if (user.role === 'admin' && users.filter(record => record.role === 'admin').length === 1) return { error: 'At least one admin account is required.' }
  users = users.filter(record => record.userId !== userId)
  return { persisted: save() }
}
