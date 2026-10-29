import nodemailer from 'nodemailer'
import { basicCustomerEmail, validCustomerEmail } from '../src/data/customerEmail.js'

export function customerMailOptions(env = process.env) {
  const local = env.CUSTOMER_MAIL_MODE === 'local'
  if (!env.SMTP_HOST || !validCustomerEmail(env.SMTP_FROM)) return null
  if (!['local', 'smtp', undefined, ''].includes(env.CUSTOMER_MAIL_MODE))
    throw new Error('Invalid mail mode')
  const port = Number(env.SMTP_PORT || 587)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port')
  if (!/^[a-z0-9.-]+$/i.test(env.SMTP_HOST)) throw new Error('Invalid SMTP host')
  if (local && !['mailpit', 'localhost', '127.0.0.1'].includes(env.SMTP_HOST))
    throw new Error('Local inbox mode requires a local mail server')
  if (local && env.NODE_ENV === 'production') throw new Error('Local mail is for development only')
  if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
    throw new Error('Both SMTP username and password are required')
  if (
    env.SMTP_HOST.toLowerCase() === 'smtp.gmail.com' &&
    (!env.SMTP_USER || env.SMTP_FROM.toLowerCase() !== env.SMTP_USER.toLowerCase())
  )
    throw new Error('Gmail sender must match the authenticated mailbox')
  return {
    local,
    from: env.SMTP_FROM,
    transport: {
      host: env.SMTP_HOST,
      port,
      secure: port === 465,
      requireTLS: !local && port !== 465,
      ...(env.SMTP_USER ? { auth: { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } } : {}),
      connectionTimeout: 5000,
      greetingTimeout: 5000,
      socketTimeout: 10000,
      disableFileAccess: true,
      disableUrlAccess: true,
      logger: false,
      debug: false,
    },
  }
}

// Invalid email settings disable only recovery; never prevent the shared API from starting.
export function createCustomerMailer(env = process.env, dependencies = {}) {
  let options
  let transport
  try {
    options = customerMailOptions(env)
    if (!options) return null
    transport = (dependencies.createTransport || nodemailer.createTransport)(options.transport)
  } catch {
    const report = dependencies.report || console.error
    report('Customer email disabled: invalid mail configuration. Other services remain available.')
    return null
  }
  const send = async (email, subject, text) => {
    if (!basicCustomerEmail(email)) throw new Error('Invalid recipient')
    const result = await transport.sendMail({ from: options.from, to: email, subject, text })
    if (!result.accepted?.length) throw new Error('Mail was not accepted')
  }
  return {
    local: options.local,
    verify: () => transport.verify(),
    sendReset(email, code) {
      return send(
        email,
        'Entertainment Guild password reset',
        `A password reset was requested for your Entertainment Guild account.\n\nYour reset code is:\n${code}\n\nPaste this code into the password recovery page. It expires in 15 minutes and can be used once.\nIf you did not request this, ignore this email. Your password has not changed.`,
      )
    },
    // Used only by the interactive local setup script, not exposed as a web endpoint.
    sendVerification(email, code) {
      return send(
        email,
        'Entertainment Guild email delivery check',
        `This email checks delivery from your Entertainment Guild project.\n\nEnter this verification code in the local configuration program:\n${code}\n\nThis is not a password reset. No customer password has been changed.`,
      )
    },
  }
}
