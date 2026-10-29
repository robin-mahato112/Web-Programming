import { validPassword } from './passwordRules.js'
import { validCustomerEmail } from './customerEmail.js'
import { courseRequest } from '../services/course-api.js'

export function getRecoveryDelivery() {
  return courseRequest('/api/customer/recovery', { signal: AbortSignal.timeout(15000) })
}
export async function requestRecoveryEmail(email) {
  if (!validCustomerEmail(email)) throw new Error('Enter a valid email address.')
  return courseRequest('/requestPasswordReset', {
    body: { email: email.trim().toLowerCase() },
    headers: { 'X-Customer-Request': '1' },
    signal: AbortSignal.timeout(15000),
  })
}
export function resetCustomerPassword({ token, password }) {
  return courseRequest('/resetPassword', {
    body: { token: token.trim().toLowerCase(), password },
    headers: { 'X-Customer-Request': '1' },
    signal: AbortSignal.timeout(15000),
  })
}

// AI-assisted: validate account recovery without changing the shared API client.
export function validatePasswordRecovery({ token, password, confirmPassword }) {
  const errors = {}
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token.trim()))
    errors.token = 'Enter a valid reset code.'
  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    errors.password = 'Use a password between 8 and 128 characters.'
  else if (!validPassword(password)) errors.password = 'Include at least one letter and one number.'
  if (password !== confirmPassword) errors.confirmPassword = 'Passwords do not match.'
  return errors
}
