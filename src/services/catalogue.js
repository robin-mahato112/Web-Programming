import { calculateTotals, toCents } from '../lib/money.js'
import { COURSE_MODE, courseFetch } from './course-api.js'
import { validateCartItems, quoteCart as quoteListings } from '../lib/catalogue-records.js'

const isText = (value) => typeof value === 'string' && value.trim().length > 0
const isPrice = (value) => typeof value === 'number' && Number.isSafeInteger(toCents(value))
const isStock = (value) => Number.isSafeInteger(value) && value >= 0

function validProduct(product) {
  return (
    product &&
    ['id', 'title', 'category', 'accent'].every((key) => isText(product[key])) &&
    typeof product.description === 'string' &&
    isPrice(product.price) &&
    isStock(product.stock) &&
    Array.isArray(product.offers) &&
    product.offers.length > 0 &&
    product.offers.every(
      (offer) =>
        offer &&
        isText(offer.itemId) &&
        isText(offer.sourceName) &&
        isPrice(offer.price) &&
        isStock(offer.stock),
    )
  )
}

async function readResponse(response, signal) {
  const body = await response.json()
  signal?.throwIfAborted()
  if (!response.ok) {
    const message = typeof body?.errors?.items === 'string' ? body.errors.items : body?.error
    throw new Error(
      isText(message) ? message : 'The product service is unavailable. Please try again.',
    )
  }
  return body
}

/** Read the complete course catalogue through its paginated resources, or send keywords to SQL.
 * Search results may be a subset, so cart validation requests the full catalogue without keywords.
 * Both paths reject malformed responses rather than substituting sample products. */
export async function fetchCatalogue(signal, query = '') {
  const search = query ? '?' + new URLSearchParams({ q: query }) : ''
  const body = await readResponse(
    await (COURSE_MODE ? courseFetch : fetch)('/api/products' + search, { signal }),
    signal,
  )
  if (!Array.isArray(body?.products) || !body.products.every(validProduct)) {
    throw new Error('The product service returned an invalid catalogue.')
  }
  const productIds = body.products.map((product) => product.id)
  const itemIds = body.products.flatMap((product) => product.offers.map((offer) => offer.itemId))
  if (new Set(productIds).size !== productIds.length || new Set(itemIds).size !== itemIds.length) {
    throw new Error('The product service returned duplicate catalogue entries.')
  }
  return body.products
}

/** Price listing IDs and quantities against current records. Course mode calculates a browser
 * estimate after reloading the API; the legacy path validates a server quote response.
 * Neither path reserves stock. The checkout backend calculates its own trusted quote. */
export async function quoteCart(items, signal) {
  const requested = items.map(({ itemId, quantity }) => ({ itemId, quantity }))
  if (COURSE_MODE) {
    // A current catalogue estimate, not a trusted checkout authorization or stock reservation.
    const products = await fetchCatalogue(signal)
    const errors = validateCartItems(requested, products)
    if (errors.items) throw new Error(errors.items)
    return quoteListings(requested, products)
  }
  const body = await readResponse(
    await fetch('/api/cart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: requested }),
      signal,
    }),
    signal,
  )
  if (
    !Array.isArray(body?.items) ||
    body.items.length !== requested.length ||
    new Set(body.items.map((item) => item?.itemId)).size !== body.items.length ||
    !body.items.every(
      (item) =>
        item &&
        validProduct(item.product) &&
        isText(item.product.sourceName) &&
        item.productId === item.product.id &&
        Number.isSafeInteger(item.quantity) &&
        item.quantity > 0 &&
        item.quantity <= item.product.stock &&
        requested.some(
          (expected) => expected.itemId === item.itemId && expected.quantity === item.quantity,
        ) &&
        item.product.offers.some(
          (offer) =>
            offer.itemId === item.itemId &&
            offer.price === item.product.price &&
            offer.stock === item.product.stock &&
            offer.sourceName === item.product.sourceName,
        ),
    )
  ) {
    throw new Error('The cart service returned an invalid cart. Please try again.')
  }
  const { subtotal } = calculateTotals(body.items)
  if (!isPrice(body.subtotal) || toCents(body.subtotal) !== toCents(subtotal)) {
    throw new Error('The cart service returned an invalid total. Please try again.')
  }
  return { items: body.items, subtotal }
}
