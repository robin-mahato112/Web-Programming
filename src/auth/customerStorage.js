import { existingCustomers } from '../data/mockCustomers.js'

// Zehai's Assignment 1.2 code starts here: temporary browser persistence until the API is connected.
const CUSTOMERS_KEY = 'entertainment-guild-customers-v1'
const SESSION_KEY = 'entertainment-guild-session-v1'

function publicCustomer(customer) {
  if (!customer) return null
  const { password: _password, ...safeCustomer } = customer
  return safeCustomer
}

export function loadCustomers() {
  try {
    const saved = JSON.parse(localStorage.getItem(CUSTOMERS_KEY))
    if (Array.isArray(saved)) return saved
  } catch {
    localStorage.removeItem(CUSTOMERS_KEY)
  }

  return existingCustomers.map(customer => ({ ...customer }))
}

function saveCustomers(customers) {
  localStorage.setItem(CUSTOMERS_KEY, JSON.stringify(customers))
}

export function emailExists(email, ignoredUserId = null) {
  const normalisedEmail = email.trim().toLowerCase()
  return loadCustomers().some(customer => (
    customer.userId !== ignoredUserId && customer.email.toLowerCase() === normalisedEmail
  ))
}

export function authenticateCustomer(email, password) {
  const normalisedEmail = email.trim().toLowerCase()
  const customer = loadCustomers().find(record => (
    record.email.toLowerCase() === normalisedEmail && record.password === password
  ))
  return publicCustomer(customer)
}

export function createCustomer(details) {
  if (emailExists(details.email)) return null

  const customers = loadCustomers()
  const nextUserId = customers.reduce((largest, customer) => Math.max(largest, customer.userId), 0) + 1
  const customer = {
    userId: nextUserId,
    ...details,
    email: details.email.trim().toLowerCase(),
  }

  saveCustomers([...customers, customer])
  startCustomerSession(customer.userId)
  return publicCustomer(customer)
}

export function updateCustomer(userId, details) {
  if (emailExists(details.email, userId)) return null

  const customers = loadCustomers()
  const index = customers.findIndex(customer => customer.userId === userId)
  if (index < 0) return null

  const updated = {
    ...customers[index],
    ...details,
    email: details.email.trim().toLowerCase(),
  }
  const nextCustomers = [...customers]
  nextCustomers[index] = updated
  saveCustomers(nextCustomers)
  return publicCustomer(updated)
}

export function startCustomerSession(userId) {
  localStorage.setItem(SESSION_KEY, String(userId))
}

export function clearCustomerSession() {
  localStorage.removeItem(SESSION_KEY)
}

export function getSessionCustomer() {
  const userId = Number(localStorage.getItem(SESSION_KEY))
  if (!userId) return null

  const customer = loadCustomers().find(record => record.userId === userId)
  if (!customer) clearCustomerSession()
  return publicCustomer(customer)
}
// Zehai's Assignment 1.2 code stops here.
