import api from '../api.js'
import { readDelivery, saveDelivery } from '../lib/delivery-draft.js'
import { errorMessage } from './backend.js'
import { validCustomerEmail } from './customerEmail.js'
import { getSessionUser, restoreSession } from './session.js'

// AI-assisted: profile writes use a dedicated own-account endpoint, never generic Patron permissions.
export function validateCustomerProfile(values) {
  const errors = {}
  if (
    !values.name?.trim() ||
    values.name.trim().length > 100 ||
    [...values.name].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    errors.profileName = 'Enter your full name (up to 100 characters).'
  if (!validCustomerEmail(values.email)) errors.profileEmail = 'Enter a valid email address.'
  if (!values.currentPassword || values.currentPassword.length > 128)
    errors.currentPassword = 'Enter your current password.'
  return errors
}
export async function saveCustomerProfile(values) {
  const user = getSessionUser()
  if (user?.role !== 'customer') return { error: 'Sign in as a customer.' }
  const errors = validateCustomerProfile(values)
  if (Object.keys(errors).length) return { errors }
  try {
    const { data } = await api.patch(
      '/api/customer/profile',
      {
        name: values.name.trim(),
        email: values.email.trim().toLowerCase(),
        currentPassword: values.currentPassword,
      },
      { headers: { 'X-Customer-Request': '1' } },
    )
    if (getSessionUser()?.userId !== user.userId)
      return { error: 'Your account changed. Sign in again.' }
    // Checkout reads its identity from the same session and keeps its existing cart and delivery draft.
    saveDelivery({ ...readDelivery(String(user.userId)), name: data.name }, String(user.userId))
    await restoreSession()
    return { saved: true, profile: data }
  } catch (error) {
    if (error.response?.status === 404)
      return { error: 'Account editing is unavailable on this backend. Please contact support.' }
    if ([400, 403, 409, 429].includes(error.response?.status))
      return { error: error.response.data?.error || 'Account details could not be saved.' }
    return { error: errorMessage(error) }
  }
}
