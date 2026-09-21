import { useSyncExternalStore } from 'react'
import { mockProducts } from './mockProducts.js'

const storageKey = 'entertainment-guild-products'
const listeners = new Set()
let products = mockProducts

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

try {
  const saved = JSON.parse(localStorage.getItem(storageKey))
  if (Array.isArray(saved)) {
    products = mockProducts.map(product => {
      const record = saved.find(item => item?.id === product.id)
      if (!record || Object.keys(validateProduct(record)).length || typeof record.updatedBy !== 'string' || !Number.isFinite(Date.parse(record.updatedAt))) return product
      return {
        ...product,
        price: Number(record.price),
        quantity: Number(record.quantity),
        discount: Number(record.discount),
        previousPrice: typeof record.previousPrice === 'number' && Number.isFinite(record.previousPrice) && record.previousPrice >= 0 ? record.previousPrice : null,
        updatedBy: record.updatedBy,
        updatedAt: record.updatedAt,
      }
    })
  }
} catch {
  // Use the sample catalogue when browser storage is unavailable or invalid.
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useProducts() {
  return useSyncExternalStore(subscribe, () => products)
}

export function updateProduct(id, values, user) {
  if (user?.role !== 'admin') return { error: 'Only admins can update products.' }
  const errors = validateProduct(values)
  if (Object.keys(errors).length) return { errors }
  const product = products.find(item => item.id === id)
  if (!product) return { error: 'Product not found.' }

  const price = Number(values.price)
  products = products.map(item => item.id === id ? {
    ...item,
    price,
    quantity: Number(values.quantity),
    discount: Number(values.discount),
    previousPrice: price !== item.price ? item.price : item.previousPrice,
    updatedAt: new Date().toISOString(),
    updatedBy: user.name,
  } : item)

  let persisted = true
  try {
    localStorage.setItem(storageKey, JSON.stringify(products))
  } catch {
    persisted = false
  }
  listeners.forEach(listener => listener())
  return { persisted }
}
