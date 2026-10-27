import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { createDemoPayments, validateDemoCard } from '../server/demo-payment.js'

const now = Date.UTC(2026, 9, 4)
const card = { holder: 'Demo Customer', number: '4242 4242 4242 4242', expiry: '10/26', cvc: '123' }
const key = 'synthetic-payment-test-key-'.repeat(3)

test('card validation permits the entire expiry month and approves only the approved fixture', () => {
  assert.equal(validateDemoCard(card, now).outcome, 'approved')
  assert.equal(
    validateDemoCard({ ...card, number: '4000000000000002', expiry: '10/2026' }, now).outcome,
    'declined',
  )
  assert.equal(validateDemoCard({ ...card, number: '4111111111111111' }, now).outcome, 'timed-out')
  for (const number of ['5555555555554444', '4242424242424241', '0000000000000000'])
    assert.equal(validateDemoCard({ ...card, number }, now).outcome, 'declined')
  for (const change of [
    { holder: '' },
    { holder: 'a\nb' },
    { number: '4242abcd42424242' },
    { number: 4242424242424242 },
    { number: '424242424242424' },
    { expiry: '09/26' },
    { expiry: '13/30' },
    { expiry: '00/30' },
    { expiry: '2030-12' },
    { cvc: '12' },
    { cvc: '1234' },
    { cvc: 'xyz' },
    { cvc: 123 },
  ])
    assert.throws(() => validateDemoCard({ ...card, ...change }, now), { status: 400 })
  assert.throws(() => validateDemoCard(card, Date.UTC(2026, 10, 1)), /expired/)
})

test('signed demo references expire and bind the account and attempt without retaining card fields', () => {
  let time = now
  const payments = createDemoPayments(key, () => time)
  const token = randomUUID(),
    user = { id: '42' }
  const method = payments.issue(card, token, user)
  assert.deepEqual(payments.verify(method.paymentToken, token, user), {
    outcome: 'approved',
    brand: 'Visa',
    last4: '4242',
  })
  const decoded = JSON.parse(Buffer.from(method.paymentToken.split('.')[0], 'base64url').toString())
  for (const field of ['number', 'holder', 'expiry', 'cvc']) assert.ok(!(field in decoded))
  assert.ok(!JSON.stringify(decoded).includes('4242424242424242'))
  assert.throws(() => payments.verify(method.paymentToken + 'x', token, user), { status: 400 })
  assert.throws(() => payments.verify(method.paymentToken, randomUUID(), user), { status: 400 })
  assert.throws(() => payments.verify(method.paymentToken, token, { id: '43' }), { status: 400 })
  assert.throws(
    () =>
      createDemoPayments('other-key-'.repeat(8), () => time).verify(
        method.paymentToken,
        token,
        user,
      ),
    { status: 400 },
  )
  time += 30 * 60 * 1000
  assert.throws(() => payments.verify(method.paymentToken, token, user), /expired/)
})

test('demo payments require a configured private signing key', () => {
  assert.throws(() => createDemoPayments('', () => now).issue(card, randomUUID(), { id: '42' }), {
    status: 503,
  })
})
