import { createHmac } from 'node:crypto'
import { equal, fail, inputText } from './security.js'

// These are local simulator fixtures, not university credentials or bank authorizations.
const cards = {
  4242424242424242: 'approved',
  4000000000000002: 'declined',
  4111111111111111: 'timed-out',
}
const outcomes = new Set(Object.values(cards))

export function validateDemoCard(card, now = Date.now()) {
  const holder = inputText(card?.holder, 'cardholder name', 100)
  const number = typeof card?.number === 'string' ? card.number.replace(/ /g, '') : ''
  if (!/^\d{16}$/.test(number)) fail('Enter a 16-digit card number.')
  const expiry =
    typeof card.expiry === 'string' && /^(0[1-9]|1[0-2])\/(\d{2}|\d{4})$/.exec(card.expiry)
  if (!expiry) fail('Enter the expiry as MM/YY, with a month from 01 to 12.')
  const year = Number(expiry[2]) + (expiry[2].length === 2 ? 2000 : 0)
  // Midnight after the expiry month gives the card its complete final month of validity.
  if (Date.UTC(year, Number(expiry[1]), 1) <= now)
    fail('This card has expired. Check the expiry date.')
  if (typeof card.cvc !== 'string' || !/^\d{3}$/.test(card.cvc))
    fail('Enter a three-digit security code.')
  // Only the approved fixture succeeds; every other number declines, apart from the timeout fixture.
  // Format checks alone never authorize a payment or imply that a bank verified the card.
  return {
    holder,
    brand: number.startsWith('4') ? 'Visa' : 'Credit card',
    last4: number.slice(-4),
    outcome: cards[number] || 'declined',
  }
}

/** Exchange transient demo card fields for a signed, customer/attempt-bound reference.
 * Only this reference is saved for retries; no full card number, expiry or CVC is retained. */
export function createDemoPayments(key, now = Date.now) {
  function signature(value) {
    if (typeof key !== 'string' || key.length < 64)
      fail('Payment is temporarily unavailable. Please try again later.', 503)
    return createHmac('sha256', key).update(value).digest('base64url')
  }
  return {
    issue(card, attempt, user) {
      const { holder, ...payment } = validateDemoCard(card, now())
      const claims = {
        ...payment,
        attempt,
        account: user.id,
        expires: now() + 30 * 60 * 1000,
      }
      const value = Buffer.from(JSON.stringify(claims)).toString('base64url')
      return {
        paymentToken: `${value}.${signature(value)}`,
        holder,
        brand: payment.brand,
        last4: payment.last4,
      }
    },
    verify(token, attempt, user) {
      // Verify the signature before trusting decoded claims. Base64 encoding alone provides no
      // protection against a browser changing a decline into an approval or swapping customers.
      if (typeof token !== 'string' || token.length > 1024) fail('Enter your card again.')
      const [value, signed, extra] = token.split('.')
      if (!value || extra !== undefined || !equal(signature(value), signed))
        fail('The payment reference is invalid. Enter your card again.')
      let payment
      try {
        payment = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
      } catch {
        fail('The payment reference is invalid. Enter your card again.')
      }
      if (
        payment?.attempt !== attempt ||
        payment.account !== user.id ||
        !outcomes.has(payment.outcome) ||
        !Number.isFinite(payment.expires) ||
        payment.expires <= now()
      )
        fail('The payment reference expired or belongs to another checkout. Enter your card again.')
      return { outcome: payment.outcome, brand: payment.brand, last4: payment.last4 }
    },
  }
}
