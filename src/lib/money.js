/**
 * Shared currency rules keep displayed cart totals and server quotes consistent.
 * Prices enter as dollar amounts, arithmetic uses safe integer cents, and totals
 * return as dollar numbers for display and JSON. Invalid prices are never rounded
 * into acceptable inputs: parsing returns NaN and total calculation throws.
 */

/**
 * Parse a nonnegative number or trimmed decimal string with at most two places.
 * A digit before the decimal point is required; exponent strings and fractional
 * cents are rejected. The resulting cents must fit Number.MAX_SAFE_INTEGER.
 *
 * @param {unknown} value Dollar amount; strings preserve the user's original digits.
 * @returns {number} Integer cents, or NaN for an unsupported or invalid value.
 * @example toCents('19.95') // 1995; toCents('19.951') returns NaN.
 */
export function toCents(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return NaN
  const text = String(value).trim()
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return NaN
  const [whole, fraction = ''] = text.split('.')
  /*
   * Concatenating decimal digits avoids multiplying a binary floating-point price
   * by 100. This preserves cents such as 1.01 exactly instead of rounding a result.
   */
  const cents = Number(whole + fraction.padEnd(2, '0'))
  return Number.isSafeInteger(cents) ? cents : NaN
}

/**
 * Convert integer cents to a dollar number only when every cent survives.
 * A safe integer can still lose precision after division by 100, so require
 * parsing the resulting dollar value to recover the original cents exactly.
 *
 * @param {number} cents Nonnegative safe integer amount.
 * @returns {number} Dollar amount that preserves the input cents.
 * @throws {RangeError} For invalid cents or a conversion that would lose precision.
 */
export function fromCents(cents) {
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new RangeError('Enter a nonnegative safe integer amount in cents.')
  const dollars = cents / 100
  if (toCents(dollars) !== cents)
    throw new RangeError('Amount is too large to represent without losing cents.')
  return dollars
}

/**
 * Sum item prices using integer cents to avoid floating-point rounding errors.
 * Quantities must be positive safe integers; catalogue membership and stock are
 * checked by callers. An empty cart is valid and totals zero.
 *
 * @param {Array<{product: {price: number|string}, quantity: number}>} items Priced lines.
 * @returns {{subtotal: number}} The cart's item total in dollars.
 * @throws {RangeError} For invalid inputs, unsafe arithmetic or dollar conversion that loses cents.
 */
export function calculateTotals(items) {
  if (!Array.isArray(items)) throw new RangeError('Invalid cart items.')
  const subtotalCents = items.reduce((sum, item) => {
    const price = toCents(item?.product?.price)
    const quantity = item?.quantity
    if (!Number.isSafeInteger(price) || !Number.isSafeInteger(quantity) || quantity < 1) {
      throw new RangeError('Invalid cart price or quantity.')
    }
    const next = sum + price * quantity
    if (!Number.isSafeInteger(next)) throw new RangeError('Cart total is too large.')
    return next
  }, 0)
  return { subtotal: fromCents(subtotalCents) }
}
