import { countRows, createResource, createRow, deleteRow, errorMessage, field, listAll, patchRow } from './backend.js'
import { catalogue } from './catalogue.js'

// Staff accounts come from the User table; customers are Patrons. Password hashes are never requested.
async function loadAccounts() {
  const [staff, customers] = await Promise.all([
    listAll('User', { fields: 'UserID,UserName,Email,Name,IsAdmin' }),
    listAll('Patrons', { fields: 'UserID,Name,Email' }),
  ])
  return {
    staff: staff.map(row => ({
      userId: field(row, 'UserID'),
      username: field(row, 'UserName'),
      email: field(row, 'Email'),
      name: field(row, 'Name') || field(row, 'UserName'),
      role: field(row, 'IsAdmin') ? 'admin' : 'employee',
    })),
    customers: customers.map(row => ({ userId: field(row, 'UserID'), name: field(row, 'Name'), email: field(row, 'Email') })),
  }
}

export const accounts = createResource(loadAccounts)
export const staffRoles = ['employee', 'admin']

export async function updateStaffUser(account, values, actor) {
  if (actor?.role !== 'admin') return { error: 'Only admins can manage users.' }
  const staff = accounts.getState().data?.staff ?? []
  const errors = {}
  const name = values.name?.trim() || ''
  if (!name || name.length > 100) errors.name = 'Enter a name between 1 and 100 characters.'
  if (!staffRoles.includes(values.role)) errors.role = 'Choose a valid role.'
  // Roles are read from the login cookie, so a change to your own role would not apply until you sign in again.
  else if (account.userId === actor.userId && values.role !== account.role) errors.role = 'You cannot change your own role.'
  else if (account.role === 'admin' && values.role !== 'admin' && staff.filter(user => user.role === 'admin').length === 1) errors.role = 'At least one admin account is required.'
  if (Object.keys(errors).length) return { errors }

  try {
    await patchRow('User', account.userId, { Name: name, IsAdmin: values.role === 'admin' })
  } catch (error) {
    return { error: errorMessage(error) }
  }
  accounts.update(data => ({ ...data, staff: data.staff.map(user => user.userId === account.userId ? { ...user, name, role: values.role } : user) }))
  return {}
}

const usernamePattern = /^[A-Za-z0-9._-]{3,50}$/
const emailPattern = /^\S+@\S+\.\S+$/
const strongPasswordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

export function validateNewStaffUser(values, staff) {
  const errors = {}
  const username = values.username.trim()
  if (!values.name.trim() || values.name.trim().length > 100) errors.name = 'Enter a name between 1 and 100 characters.'
  if (!usernamePattern.test(username)) errors.username = 'Use 3 to 50 letters, numbers, dots, dashes, or underscores.'
  else if (staff.some(user => user.username.toLowerCase() === username.toLowerCase())) errors.username = 'This username is already taken.'
  if (values.email.trim() && (!emailPattern.test(values.email.trim()) || values.email.trim().length > 255)) errors.email = 'Enter a valid email address.'
  if (!staffRoles.includes(values.role)) errors.role = 'Choose a valid role.'
  if (!strongPasswordPattern.test(values.password)) errors.password = 'Use 8+ characters with letters and numbers.'
  if (values.confirm !== values.password) errors.confirm = 'Passwords must match.'
  return errors
}

export async function createStaffUser(values, actor) {
  if (actor?.role !== 'admin') return { error: 'Only admins can add users.' }
  const errors = validateNewStaffUser(values, accounts.getState().data?.staff ?? [])
  if (Object.keys(errors).length) return { errors }

  let row
  try {
    // The backend salts and hashes a plain password sent in HashPW.
    row = await createRow('User', {
      UserName: values.username.trim(),
      Name: values.name.trim(),
      Email: values.email.trim() || null,
      IsAdmin: values.role === 'admin',
      HashPW: values.password,
    })
  } catch (error) {
    if (error.response?.status === 409) return { errors: { username: 'This username is already taken.' } }
    return { error: errorMessage(error) }
  }
  const user = { userId: field(row, 'UserID'), username: field(row, 'UserName'), email: field(row, 'Email'), name: field(row, 'Name'), role: values.role }
  accounts.update(data => ({ ...data, staff: [...data.staff, user] }))
  return { user }
}

// Product.LastUpdatedBy must name an existing user, so products this user last updated are handed to the admin deleting them.
export const countProductsUpdatedBy = username => countRows('Product', { where: `(LastUpdatedBy,eq,${username})` })

export function deleteBlocker(account, actor, staff) {
  if (actor?.role !== 'admin') return 'Only admins can delete users.'
  if (account.userId === actor.userId) return 'You cannot delete your own account.'
  if (account.role === 'admin' && staff.filter(user => user.role === 'admin').length === 1) return 'At least one admin account is required.'
  return ''
}

export async function deleteStaffUser(account, actor) {
  const blocker = deleteBlocker(account, actor, accounts.getState().data?.staff ?? [])
  if (blocker) return { error: blocker }
  try {
    const products = await listAll('Product', { where: `(LastUpdatedBy,eq,${account.username})`, fields: 'ID' })
    for (let start = 0; start < products.length; start += 20) {
      await Promise.all(products.slice(start, start + 20).map(product => patchRow('Product', field(product, 'ID'), { LastUpdatedBy: actor.username })))
    }
    await deleteRow('User', account.userId)
  } catch (error) {
    catalogue.reset() // Some products may have been reassigned; reload them next time they are shown.
    return { error: errorMessage(error) }
  }
  accounts.update(data => ({ ...data, staff: data.staff.filter(user => user.userId !== account.userId) }))
  catalogue.update(data => ({ ...data, products: data.products.map(product => product.updatedBy === account.username ? { ...product, updatedBy: actor.username } : product) }))
  return {}
}
