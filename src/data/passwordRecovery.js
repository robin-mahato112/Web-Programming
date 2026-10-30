import { validPassword } from './passwordRules.js'
import { basicCustomerEmail } from './customerEmail.js'
import { courseRequest } from '../services/course-api.js'

export async function requestRecoveryEmail(email) {
  if (!basicCustomerEmail(email)) throw new Error('Enter a valid email address.')
  const result = await courseRequest('/requestPasswordReset', {
    body: { email: email.trim().toLowerCase() },
    signal: AbortSignal.timeout(15000),
  })
  // Development tokens simulate delivery; the generic API message does not prove an email was sent.
  if (result?.ok !== true)
    throw new Error('The reset request could not be confirmed. Please retry.')
  if (
    Object.hasOwn(result, 'token') &&
    (typeof result.token !== 'string' || !/^[a-f0-9]{64}$/i.test(result.token))
  )
    throw new Error('The reset service returned an invalid code. Please retry.')
  return { code: typeof result.token === 'string' ? result.token.toLowerCase() : '' }
}
export function resetCustomerPassword({ token, password }) {
  return courseRequest('/resetPassword', {
    body: { token: token.trim().toLowerCase(), password },
    signal: AbortSignal.timeout(15000),
  })
}

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
