import { existingCustomers } from './mockCustomers.js'

// Customer sign in and registration still validate against sample records. Staff accounts come from the backend.
const users = existingCustomers.map(user => ({ ...user, role: 'customer' }))

export const roleLabel = role => role.charAt(0).toUpperCase() + role.slice(1)
export const getUsers = () => users
