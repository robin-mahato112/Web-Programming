import api from '../api.js'
import { saveDelivery } from '../lib/delivery-draft.js'
import { createResource, createRow, errorMessage, field, listAll, patchRow } from './backend.js'
import { getSessionUser, signInCustomer } from './session.js'
import { validPassword } from './passwordRules.js'
import { validCustomerEmail } from './customerEmail.js'

// Customers are Patrons (name, email, password). Their phone and delivery address live in the TO table,
// which only a signed-in patron can write, and the backend only returns the patron's own TO rows.
export const australianStates = ['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA']

const phonePattern = /^\+?[\d\s()-]+$/
const postcodePattern = /^\d{4}$/

export function validateDeliveryDetails(values) {
  const errors = {}
  if (!values.phoneNumber.trim()) errors.phoneNumber = 'Enter your phone number.'
  else if (
    !phonePattern.test(values.phoneNumber.trim()) ||
    !/^\d{8,15}$/.test(values.phoneNumber.replace(/\D/g, ''))
  )
    errors.phoneNumber = 'Enter a valid phone number with 8 to 15 digits.'
  if (
    values.streetAddress.trim().length > 255 ||
    !/\p{L}/u.test(values.streetAddress) ||
    !/[0-9]/.test(values.streetAddress) ||
    /[\r\n\t]/.test(values.streetAddress)
  )
    errors.streetAddress = 'Include a street number and street name (up to 255 characters).'
  if (!values.suburb.trim() || values.suburb.trim().length > 50)
    errors.suburb = 'Enter your suburb.'
  if (!australianStates.includes(values.state)) errors.state = 'Choose your state or territory.'
  if (!postcodePattern.test(values.postcode.trim())) errors.postcode = 'Postcode must be 4 digits.'
  return errors
}

export function validateRegistration(values) {
  const errors = {}
  if (!values.name.trim() || values.name.trim().length > 100) errors.name = 'Enter your full name.'
  if (!values.email.trim()) errors.email = 'Enter your email address.'
  else if (!validCustomerEmail(values.email)) errors.email = 'Enter a valid email address.'
  if (!values.password) errors.password = 'Enter your password.'
  else if (!validPassword(values.password) || values.password.length > 128)
    errors.password = 'Use 8+ characters with letters and numbers.'
  if (values.confirm !== values.password) errors.confirm = 'Passwords must match.'
  return { ...errors, ...validateDeliveryDetails(values) }
}

// PostCode is an integer column, so a postcode such as 0800 comes back as 800.
const toDetails = (row) => ({
  customerId: field(row, 'CustomerID'),
  phoneNumber: field(row, 'PhoneNumber') ?? '',
  streetAddress: field(row, 'StreetAddress') ?? '',
  suburb: field(row, 'Suburb') ?? '',
  state: field(row, 'State') ?? '',
  postcode:
    field(row, 'PostCode') === null || field(row, 'PostCode') === undefined
      ? ''
      : String(field(row, 'PostCode')).padStart(4, '0'),
})

// The signed-in customer's most recent TO row, or null if they have not saved delivery details yet.
export const deliveryDetails = createResource(async () => {
  if (getSessionUser()?.role !== 'customer') return { details: null }
  const rows = await listAll('TO', {
    fields: 'CustomerID,PhoneNumber,StreetAddress,PostCode,Suburb,State',
    sort: '-CustomerID',
  })
  return { details: rows[0] ? toDetails(rows[0]) : null }
})

// Creates the customer's TO row the first time, then updates that row.
export async function saveDeliveryDetails(values, current) {
  const user = getSessionUser()
  if (user?.role !== 'customer') return { error: 'Sign in as a customer to save delivery details.' }
  const errors = validateDeliveryDetails(values)
  if (Object.keys(errors).length) return { errors }

  const row = {
    Email: user.email,
    PhoneNumber: values.phoneNumber.trim(),
    StreetAddress: values.streetAddress.trim(),
    Suburb: values.suburb.trim(),
    State: values.state,
    PostCode: Number(values.postcode.trim()),
  }
  let saved
  try {
    saved = current
      ? await patchRow('TO', current.customerId, row)
      : await createRow('TO', { PatronId: user.userId, ...row })
  } catch (error) {
    return { error: errorMessage(error) }
  }
  const details = toDetails(saved)
  const activeUser = getSessionUser()
  if (activeUser?.userId !== user.userId || activeUser?.role !== user.role)
    return { error: 'Your account changed. Reload your delivery details before saving again.' }
  saveDelivery(
    {
      name: user.name,
      email: user.email,
      phone: details.phoneNumber,
      street: details.streetAddress,
      suburb: details.suburb,
      state: details.state,
      postcode: details.postcode,
    },
    String(user.userId),
  )
  deliveryDetails.replace({ details })
  return { details }
}

async function emailRegistered(email) {
  try {
    await api.get('/patronLookup', { params: { email } })
    return true
  } catch (error) {
    if (error.response?.status === 404) return false
    throw error
  }
}

// Creates the Patrons row, signs the new customer in, then saves their delivery details.
export async function registerCustomer(values) {
  const errors = validateRegistration(values)
  if (Object.keys(errors).length) return { errors }
  const email = values.email.trim()

  try {
    if (await emailRegistered(email))
      return { errors: { email: 'This email is already registered.' } }
    // The backend salts and hashes a plain password sent in HashPW.
    await createRow('Patrons', { Name: values.name.trim(), Email: email, HashPW: values.password })
  } catch (error) {
    if (error.response?.status === 409)
      return { errors: { email: 'This email is already registered.' } }
    return { error: errorMessage(error) }
  }

  const signedIn = await signInCustomer(email, values.password)
  if (signedIn.error)
    return { error: `Your account was created, but signing in failed. ${signedIn.error}` }
  const saved = await saveDeliveryDetails(values, null)
  return {
    user: signedIn.user,
    detailsError: saved.error || (saved.errors ? 'Please check your delivery details.' : ''),
  }
}
