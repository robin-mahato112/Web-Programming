import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createCustomerMailer, customerMailOptions } from '../server/customer-mail.js'
import { gmailEnvironment, gmailSettings } from '../scripts/customer-gmail-config.js'

const settings = {
  CUSTOMER_MAIL_MODE: 'smtp',
  SMTP_HOST: 'smtp.gmail.com',
  SMTP_PORT: '465',
  SMTP_FROM: 'sender@gmail.com',
  SMTP_USER: 'sender@gmail.com',
  SMTP_PASSWORD: 'fixture-app-password',
}

test('Gmail setup normalizes app-password spacing and writes only known server settings', () => {
  const input = {
    email: ' Sender@Gmail.com ',
    appPassword: 'abcd efgh ijkl mnop',
    JWT_SECRET: 'do-not-copy',
  }
  assert.equal(gmailSettings(input).SMTP_PASSWORD, 'abcdefghijklmnop')
  assert.equal(gmailSettings(input).SMTP_USER, 'sender@gmail.com')
  assert.ok(!gmailEnvironment(input).includes('JWT_SECRET'))
  for (const change of [
    { email: 'user@uon.edu.au' },
    { appPassword: 'normal-password' },
    { email: 'a@gmail.com\nSMTP_PORT=25' },
  ])
    assert.throws(() => gmailSettings({ ...input, ...change }))
})

test('Gmail uses authenticated TLS and requires the sender to match the mailbox', () => {
  const options = customerMailOptions(settings)
  assert.equal(options.local, false)
  assert.equal(options.transport.secure, true)
  assert.equal(options.transport.logger, false)
  assert.deepEqual(options.transport.auth, {
    user: settings.SMTP_USER,
    pass: settings.SMTP_PASSWORD,
  })
  const starttls = customerMailOptions({ ...settings, SMTP_PORT: '587' }).transport
  assert.equal(starttls.secure, false)
  assert.equal(starttls.requireTLS, true)
  assert.throws(() => customerMailOptions({ ...settings, SMTP_FROM: 'another@gmail.com' }))
  assert.throws(() => customerMailOptions({ ...settings, SMTP_PASSWORD: '' }))
})

test('bad email configuration cannot crash the shared API or expose credentials', () => {
  for (const change of [
    { SMTP_PORT: 'wrong' },
    { SMTP_HOST: 'bad\r\nhost' },
    { CUSTOMER_MAIL_MODE: 'unknown' },
  ]) {
    const messages = []
    assert.equal(
      createCustomerMailer({ ...settings, ...change }, { report: (text) => messages.push(text) }),
      null,
    )
    assert.equal(messages.length, 1)
    assert.ok(!messages[0].includes(settings.SMTP_PASSWORD))
    assert.ok(!messages[0].includes(settings.SMTP_USER))
  }
})

test('legacy recipient addresses reach the mail transport while header injection is rejected', async () => {
  const recipients = []
  const mailer = createCustomerMailer(settings, {
    createTransport: () => ({
      sendMail: async ({ to }) => {
        recipients.push(to)
        return { accepted: [to] }
      },
    }),
  })
  await mailer.sendReset('customer@bücher.example', 'fixture-code')
  assert.deepEqual(recipients, ['customer@bücher.example'])
  await assert.rejects(
    mailer.sendReset('customer@example.test\r\nBcc: other@example.test', 'fixture-code'),
  )
  assert.equal(recipients.length, 1)
})

test('reset and setup emails use the configured transport and do not claim rejected delivery', async () => {
  const messages = []
  let reject = false
  const mailer = createCustomerMailer(settings, {
    createTransport: () => ({
      verify: async () => true,
      sendMail: async (message) => {
        messages.push(message)
        return { accepted: reject ? [] : [message.to] }
      },
    }),
  })
  await mailer.verify()
  await mailer.sendReset('customer@example.test', 'test-reset-code')
  await mailer.sendVerification('sender@gmail.com', 'abc12345')
  assert.equal(messages[0].from, settings.SMTP_FROM)
  assert.equal(messages[0].to, 'customer@example.test')
  assert.match(messages[0].text, /test-reset-code/)
  assert.match(messages[1].text, /not a password reset/)
  assert.ok(!JSON.stringify(messages).includes(settings.SMTP_PASSWORD))
  reject = true
  await assert.rejects(mailer.sendReset('customer@example.test', 'unused'), /not accepted/)
})
