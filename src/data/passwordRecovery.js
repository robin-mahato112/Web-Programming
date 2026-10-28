import { validPassword } from './passwordRules.js'

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
