import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createCustomerMailer } from '../server/customer-mail.js'
import { validCustomerEmail } from '../src/data/customerEmail.js'
import { gmailEnvironment, gmailSettings } from './customer-gmail-config.js'

try {
  let text = ''
  for await (const chunk of process.stdin) {
    text += chunk
    if (text.length > 10000) throw new Error('Configuration input is too large.')
  }
  const input = JSON.parse(text)
  const settings = gmailSettings(input)
  if (process.argv[2] === 'verify') {
    if (!validCustomerEmail(input.recipient) || !/^[a-f0-9]{8}$/.test(input.code))
      throw new Error('Enter a valid test recipient.')
    const mailer = createCustomerMailer(settings)
    if (!mailer) throw new Error('Invalid Gmail configuration.')
    await mailer.verify()
    await mailer.sendVerification(input.recipient, input.code)
    console.log('Gmail accepted the test message. Check the recipient inbox and Spam/Junk folder.')
  } else if (process.argv[2] === 'save') {
    if (typeof input.backendDirectory !== 'string' || !input.backendDirectory)
      throw new Error('Provide the extracted course backend directory.')
    const directory = resolve(input.backendDirectory)
    const source = await readFile(resolve(directory, 'auth/server.js'), 'utf8')
    const compose = await readFile(resolve(directory, 'compose.yml'), 'utf8')
    if (!source.includes('mountCourseCustomerAccounts(app,') || !compose.includes('.customer.env'))
      throw new Error('Install the customer API extension in this backend first.')
    await writeFile(resolve(directory, '.customer.env'), gmailEnvironment(input), { mode: 0o600 })
    console.log('Verified Gmail configuration saved in the backend only.')
  } else throw new Error('Choose verify or save.')
} catch (error) {
  const smtpCodes = [
    'EAUTH',
    'ETIMEDOUT',
    'ECONNECTION',
    'ECONNREFUSED',
    'EDNS',
    'ESOCKET',
    'EENVELOPE',
    'EMESSAGE',
  ]
  if (smtpCodes.includes(error.code)) {
    console.error(
      error.code === 'EAUTH'
        ? 'Gmail sign-in failed. Check the mailbox, 2-Step Verification and app password.'
        : 'Gmail could not accept the test email. Check your connection and recipient, then retry.',
    )
  } else
    console.error(
      'Configuration was not completed. Check your inputs and the backend path; no credentials are printed.',
    )
  process.exitCode = 1
}
