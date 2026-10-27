/**
 * Immutable cart changes identify the selected Stocktake offer by itemId.
 * The supplied catalogue provides client-side limits; checkout rechecks stock/prices on the server.
 * Invalid or unchanged requests preserve the original array reference.
 */
const source = import.meta.env?.VITE_CATALOGUE_SOURCE || ''
export const CART_STORAGE_KEY = 'entertainment-guild.cart.v1' + (source ? '.' + source : '')

/** Keep only unique SQL offer IDs and positive integer quantities; prices never enter storage. */
export function cartStorageItems(value) {
  const seen = new Set()
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (
      typeof item?.itemId !== 'string' ||
      !/^[1-9]\d*$/.test(item.itemId) ||
      Number(item.itemId) > 2147483647 ||
      seen.has(item.itemId) ||
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 2147483647
    )
      return []
    seen.add(item.itemId)
    return [{ itemId: item.itemId, quantity: item.quantity }]
  })
}

/** Read untrusted saved data without requiring browser storage in tests or server rendering. */
export function readSavedCart(storage) {
  let raw
  try {
    raw = (storage ?? (typeof window === 'undefined' ? undefined : window.localStorage))?.getItem(
      CART_STORAGE_KEY,
    )
  } catch {
    return { items: [], unavailable: true }
  }
  if (raw === null || raw === undefined) return { items: [], adjusted: false }
  try {
    const value = JSON.parse(raw)
    const items = cartStorageItems(value)
    return { items, adjusted: !Array.isArray(value) || items.length !== value.length }
  } catch {
    return { items: [], adjusted: true }
  }
}

/** Persist a compact cart after acceptance. Blocked storage does not reject an in-memory change. */
export function saveCart(items, storage) {
  try {
    const target = storage ?? (typeof window === 'undefined' ? undefined : window.localStorage)
    if (!target) return false
    target.setItem(CART_STORAGE_KEY, JSON.stringify(cartStorageItems(items)))
    return true
  } catch {
    return false
  }
}

/** Remove unavailable offers and cap saved quantities before obtaining a fresh cart estimate. */
export function reconcileCart(saved, products) {
  const compact = cartStorageItems(saved)
  let adjusted = !Array.isArray(saved) || compact.length !== saved.length
  const items = compact.flatMap((item) => {
    const product = getCartProduct(products, item.itemId)
    if (!product || !Number.isSafeInteger(product.stock) || product.stock < 1) {
      adjusted = true
      return []
    }
    const quantity = Math.min(item.quantity, product.stock)
    if (quantity !== item.quantity) adjusted = true
    return [{ itemId: item.itemId, quantity }]
  })
  return { items, adjusted }
}

/** Explain each changed selection without claiming that zero stock means permanently discontinued. */
export function cartAdjustmentNotice(previous, next) {
  return cartStorageItems(previous)
    .flatMap((item) => {
      const accepted = next.find((entry) => entry.itemId === item.itemId)
      if (!accepted)
        return [`Listing ${item.itemId} was removed because it is no longer available.`]
      if (accepted.quantity < item.quantity)
        return [
          `Listing ${item.itemId} was reduced from ${item.quantity} to ${accepted.quantity} to match current stock.`,
        ]
      return []
    })
    .join(' ')
}

/** Give a cart line its selected source's price and stock without changing the catalogue card.
 * The shared product still retains all offers so another source can be selected separately. */
export function getCartProduct(products, itemId) {
  for (const product of products) {
    const offer = product.offers.find((offer) => offer.itemId === itemId)
    if (offer)
      return { ...product, price: offer.price, stock: offer.stock, sourceName: offer.sourceName }
  }
  return null
}

/** Keep fresh quoted offers while deriving the catalogue summary from its cheapest available source. */
export function mergeQuotedProducts(products, items) {
  const quoted = new Map(items.map((item) => [item.productId, item.product]))
  return products.map((product) => {
    const update = quoted.get(product.id)
    if (!update) return product
    const preferred = [...update.offers].sort(
      (first, second) =>
        Number(second.stock > 0) - Number(first.stock > 0) || first.price - second.price,
    )[0]
    return { ...product, offers: update.offers, price: preferred.price, stock: preferred.stock }
  })
}

function available(products, itemId, quantity) {
  const product = getCartProduct(products, itemId)
  return product && Number.isSafeInteger(quantity) && quantity > 0 && quantity <= product.stock
}

/** Add units to one source offer; another offer of the same product remains a separate line. */
export function addCartItem(items, itemId, quantity = 1, products = []) {
  const existing = items.find((item) => item.itemId === itemId)
  if (
    !Number.isSafeInteger(quantity) ||
    quantity < 1 ||
    !available(products, itemId, (existing?.quantity || 0) + quantity)
  )
    return items
  return existing
    ? items.map((item) =>
        item.itemId === itemId ? { ...item, quantity: item.quantity + quantity } : item,
      )
    : [...items, { itemId, quantity }]
}

/** Replace a line's total quantity; zero and unavailable offers are rejected, not removed. */
export function setCartQuantity(items, itemId, quantity, products = []) {
  const existing = items.find((item) => item.itemId === itemId)
  if (!existing || existing.quantity === quantity || !available(products, itemId, quantity))
    return items
  return items.map((item) => (item.itemId === itemId ? { ...item, quantity } : item))
}

/** Removal is local and cannot increase stock demand or require a new price quote. */
export function removeCartItem(items, itemId) {
  return items.some((item) => item.itemId === itemId)
    ? items.filter((item) => item.itemId !== itemId)
    : items
}

/** Remove only purchased units, preserving other listings or additional units added meanwhile. */
export function consumeCartItems(items, purchased) {
  const quantities = new Map(purchased.map((item) => [item.itemId, item.quantity]))
  return items
    .map((item) => ({ ...item, quantity: item.quantity - (quantities.get(item.itemId) || 0) }))
    .filter((item) => item.quantity > 0)
}

/** Prices are compared only while a prior quote exists in memory; storage holds no old prices. */
export function cartPriceNotice(previous, next) {
  return next
    .flatMap((line) => {
      const oldPrice = previous.find((item) => item.itemId === line.itemId)?.product?.price
      return typeof oldPrice === 'number' && oldPrice !== line.product.price
        ? [
            `${line.product.title}: price changed from $${oldPrice.toFixed(2)} to $${line.product.price.toFixed(2)}.`,
          ]
        : []
    })
    .join(' ')
}
