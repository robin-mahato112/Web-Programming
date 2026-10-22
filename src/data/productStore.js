import { mockProducts } from './mockProducts.js'

// Home still shows the Sprint 1 sample catalogue. Staff pages use the live catalogue in catalogue.js.
export function useProducts() {
  return mockProducts
}

export function validateProduct(values) {
  const errors = {}
  if (!/^\d+(\.\d{1,2})?$/.test(String(values.price)) || !Number.isFinite(Number(values.price)) || Number(values.price) > 1000000)
    errors.price = 'Enter a price from 0 to 1,000,000 with up to 2 decimal places.'
  if (!/^\d+$/.test(String(values.quantity)) || !Number.isSafeInteger(Number(values.quantity)))
    errors.quantity = 'Enter a whole number of units, 0 or more.'
  if (!/^\d+(\.\d{1,2})?$/.test(String(values.discount)) || Number(values.discount) > 100)
    errors.discount = 'Enter a discount from 0 to 100% with up to 2 decimal places.'
  return errors
}

export function salePrice(product) {
  return Math.round(product.price * (100 - product.discount)) / 100
}

export const formatPrice = value => new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(value)
