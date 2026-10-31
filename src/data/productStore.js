// Price and stock helpers shared by Home and the staff pages. Products themselves come from catalogue.js.
export function validateProduct(values) {
  const errors = {}
  if (!/^\d+(\.\d{1,2})?$/.test(String(values.price)) || !Number.isFinite(Number(values.price)) || Number(values.price) > 1000000)
    errors.price = 'Enter a price from 0 to 1,000,000 with up to 2 decimal places.'
  if (!/^\d+$/.test(String(values.quantity)) || !Number.isSafeInteger(Number(values.quantity)))
    errors.quantity = 'Enter a whole number of units, 0 or more.'
  return errors
}

export const formatPrice = value => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)

// Cover colour for each genre; the colours come from product-art.css.
export const genreAccent = genre => ({ Books: 'orange', Movies: 'rose', Games: 'cyan' })[genre] ?? 'violet'

// Cheapest format's price, or null when the product has no formats.
export const lowestPrice = product => product.stock.length ? Math.min(...product.stock.map(item => item.price)) : null
