// Price and stock helpers shared by Home and the staff pages. Products themselves come from catalogue.js.
export function validateProduct(values) {
  const errors = {}
  if (
    !/^\d+(\.\d{1,2})?$/.test(String(values.price)) ||
    !Number.isFinite(Number(values.price)) ||
    Number(values.price) > 1000000
  )
    errors.price = 'Enter a price from 0 to 1,000,000 with up to 2 decimal places.'
  if (
    !/^\d+$/.test(String(values.quantity)) ||
    !Number.isSafeInteger(Number(values.quantity)) ||
    Number(values.quantity) > 2147483647
  )
    errors.quantity = 'Enter a whole number of units, 0 or more.'
  if (!/^\d+(\.\d{1,2})?$/.test(String(values.discount)) || Number(values.discount) > 100)
    errors.discount = 'Enter a discount from 0 to 100% with up to 2 decimal places.'
  return errors
}

export function salePrice(product) {
  return Math.round(product.price * (100 - product.discount)) / 100
}

export const formatPrice = (value) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)

// Cover colour for each genre; the colours come from product-art.css.
export const genreAccent = (genre) =>
  ({ Books: 'orange', Movies: 'rose', Games: 'cyan' })[genre] ?? 'violet'

// Cheapest format's price before discount, or null when the product has no formats.
export const lowestPrice = (product) =>
  product.stock.length ? Math.min(...product.stock.map((item) => item.price)) : null
