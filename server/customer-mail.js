import nodemailer from 'nodemailer'
import { validCustomerEmail } from '../src/data/customerEmail.js'

// AI-assisted: SMTP is server-only. Local inbox mode captures mail and never delivers externally.
export function createCustomerMailer(env = process.env) {
  const local = env.CUSTOMER_MAIL_MODE === 'local'
  if (!env.SMTP_HOST || !validCustomerEmail(env.SMTP_FROM)) return null
  const port = Number(env.SMTP_PORT || 587)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SMTP port')
  if (local && !['mailpit', 'localhost', '127.0.0.1'].includes(env.SMTP_HOST))
    throw new Error('Local inbox mode requires a local mail server')
  if (local && env.NODE_ENV === 'production') throw new Error('Local mail is for development only')
  const transport = nodemailer.createTransport({
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
  })
  return {
    local,
    verify: () => transport.verify(),
    async sendReset(email, code) {
      const result = await transport.sendMail({
        from: env.SMTP_FROM,
        to: email,
        subject: 'Entertainment Guild password reset',
        text: `A password reset was requested for your Entertainment Guild account.\n\nYour reset code is:\n${code}\n\nPaste this code into the password recovery page. It expires in 15 minutes and can be used once.\nIf you did not request this, ignore this email. Your password has not changed.`,
      })
      if (!result.accepted?.length) throw new Error('Mail was not accepted')
    },
  }
}
