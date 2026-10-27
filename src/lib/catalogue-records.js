import { calculateTotals, fromCents, toCents } from './money.js'

// The ODBC driver can return identity columns as strings even when their SQL type is int.
const sqlId = (value) => {
  const id = typeof value === 'number' || typeof value === 'string' ? String(value) : ''
  return /^[1-9]\d*$/.test(id) && Number(id) <= 2147483647 ? id : null
}
const text = (value, fallback = '') =>
  typeof value === 'string' && value.trim() ? value.trim() : fallback

/** Normalize SQL float noise while rejecting actual fractional cents and unsafe prices. */
export function databasePrice(value) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return null
  const cents = Math.round(value * 100)
  if (Math.abs(value * 100 - cents) > 0.000001) return null
  try {
    return fromCents(cents)
  } catch {
    return null
  }
}

/**
 * Group joined rows into products and source-specific offers without changing the schema.
 * Invalid prices/references are excluded; unknown quantities become unavailable.
 * Summaries choose the cheapest available offer, breaking ties by Stocktake ID.
 */
export function mapCatalogueRows(rows) {
  const products = new Map()
  const seen = new Set()
  for (const row of rows) {
    const id = sqlId(row.productId)
    const itemId = sqlId(row.itemId)
    const sourceId = sqlId(row.sourceId)
    const price = databasePrice(row.price)
    if (!id || !itemId || !sourceId || price === null || seen.has(itemId)) continue
    seen.add(itemId)
    const category = text(row.category, 'Other')
    if (!products.has(id))
      products.set(id, {
        id,
        title: text(row.title, `Product ${id}`),
        category,
        description: text(row.description, 'No description available.'),
        author: text(row.author),
        subGenreId: sqlId(row.subGenreId),
        accent: /book/i.test(category)
          ? 'orange'
          : /game/i.test(category)
            ? 'violet'
            : /movie|film/i.test(category)
              ? 'rose'
              : 'cyan',
        offers: [],
      })
    products.get(id).offers.push({
      itemId,
      sourceId,
      sourceName: text(row.sourceName, `Source ${sourceId}`),
      price,
      stock:
        Number.isInteger(row.stock) && row.stock >= 0 && row.stock <= 2147483647 ? row.stock : 0,
    })
  }
  return [...products.values()].map((product) => {
    product.offers.sort(
      (a, b) =>
        Number(b.stock > 0) - Number(a.stock > 0) ||
        a.price - b.price ||
        Number(a.itemId) - Number(b.itemId),
    )
    const offer = product.offers[0]
    return { ...product, price: offer.price, stock: offer.stock }
  })
}

/**
 * Check source-specific Stocktake IDs against an explicit current catalogue.
 * Duplicate offer lines cannot bypass stock limits. An empty cart is valid.
 */
export function validateCartItems(items, products) {
  if (!Array.isArray(products))
    return { items: 'The product catalogue is unavailable. Please try again.' }
  const offers = new Map(
    products.flatMap((product) =>
      product.offers.map((offer) => [offer.itemId, { product, offer }]),
    ),
  )
  if (!Array.isArray(items) || items.length > offers.size) {
    return { items: 'Your cart must contain available products.' }
  }
  const seen = new Set()
  const pricedItems = []
  for (const item of items) {
    if (
      typeof item?.itemId !== 'string' ||
      !/^[1-9]\d*$/.test(item.itemId) ||
      Number(item.itemId) > 2147483647 ||
      seen.has(item.itemId) ||
      !offers.has(item.itemId)
    ) {
      return { items: 'Your cart contains an unknown, invalid or duplicate offer.' }
    }
    const { product, offer } = offers.get(item.itemId)
    if (
      !Number.isSafeInteger(item.quantity) ||
      item.quantity < 1 ||
      item.quantity > 2147483647 ||
      !Number.isSafeInteger(offer.stock) ||
      item.quantity > offer.stock ||
      !Number.isSafeInteger(toCents(offer.price))
    ) {
      return {
        items: `Choose an available quantity for ${product.title} from ${offer.sourceName}.`,
      }
    }
    seen.add(item.itemId)
    pricedItems.push({ product: { price: offer.price }, quantity: item.quantity })
  }
  try {
    calculateTotals(pricedItems)
  } catch {
    return { items: 'The cart total is too large. Reduce the quantities.' }
  }
  return {}
}

/** Resolve validated item IDs against the same snapshot used for their stock checks. */
export function quoteCart(lines, products) {
  const offers = new Map(
    products.flatMap((product) =>
      product.offers.map((offer) => [offer.itemId, { product, offer }]),
    ),
  )
  const items = lines.map(({ itemId, quantity }) => {
    const { product, offer } = offers.get(itemId)
    return {
      itemId,
      productId: product.id,
      quantity,
      product: { ...product, price: offer.price, stock: offer.stock, sourceName: offer.sourceName },
    }
  })
  return { items, subtotal: calculateTotals(items).subtotal }
}
