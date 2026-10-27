import { apiBaseUrl } from '../api-config.js'
import { courseRequest } from './course-api.js'

const ATTEMPT_KEY = 'entertainment-guild.checkout.v2.' + apiBaseUrl

/** Scope recovery to the signed-in customer. No card data or session secrets are stored. */
export function readAttempt(accountId) {
  try {
    const value = JSON.parse(sessionStorage.getItem(ATTEMPT_KEY + accountId))
    return typeof value?.token === 'string' ? value : null
  } catch {
    return null
  }
}
/** Save the exact reviewed submission before Pay, allowing the same attempt to be retried.
 * The payment reference is signed by the simulator; it contains no raw card number or CVC.
 * Return false when storage is blocked so checkout can stop before losing its recovery record. */
export function saveAttempt(value, accountId) {
  try {
    if (value) {
      // Explicitly allow only retry fields: never serialize form state or raw card details.
      const { token, applied, payload } = value
      const safePayload = payload && {
        token: payload.token,
        items: payload.items,
        customer: payload.customer,
        paymentToken: payload.paymentToken,
      }
      sessionStorage.setItem(
        ATTEMPT_KEY + accountId,
        JSON.stringify({ token, applied, payload: safePayload }),
      )
    } else sessionStorage.removeItem(ATTEMPT_KEY + accountId)
    return true
  } catch {
    return false
  }
}
export async function checkoutRequest(action, body) {
  return courseRequest('/api/checkout/' + encodeURIComponent(action), {
    body,
    headers: { 'X-Checkout-Request': '1' },
    signal: AbortSignal.timeout(20000),
  })
}
