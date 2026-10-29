import { validCustomerEmail } from '../src/data/customerEmail.js'

export function gmailSettings(input) {
  const email = typeof input.email === 'string' ? input.email.trim().toLowerCase() : ''
  const password = typeof input.appPassword === 'string' ? input.appPassword.replace(/\s/g, '') : ''
  if (!validCustomerEmail(email) || !/^[a-z0-9._+-]+@(gmail|googlemail)\.com$/.test(email))
    throw new Error('Enter your personal Gmail address.')
  if (!/^[a-z0-9]{16}$/i.test(password))
    throw new Error('Enter the 16-character Google app password, not your normal account password.')
  return {
    CUSTOMER_MAIL_MODE: 'smtp',
    SMTP_HOST: 'smtp.gmail.com',
    SMTP_PORT: '465',
    SMTP_FROM: email,
    SMTP_USER: email,
    SMTP_PASSWORD: password,
  }
}

export function gmailEnvironment(input) {
  return (
    '# Server-only Gmail settings. Never commit this file.\n' +
    Object.entries(gmailSettings(input))
      .map(([key, value]) => `${key}=${value}\n`)
      .join('')
  )
}
