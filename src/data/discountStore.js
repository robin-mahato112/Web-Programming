import { useSyncExternalStore } from 'react'

// The database has no discount column, so discounts are kept per product in this browser only.
const storageKey = 'entertainment-guild-discounts'
const listeners = new Set()
let discounts = {}

try {
  const saved = JSON.parse(localStorage.getItem(storageKey))
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
    discounts = Object.fromEntries(Object.entries(saved).filter(([, value]) => typeof value === 'number' && value > 0 && value <= 100))
  }
} catch {
  // Start without discounts when browser storage is unavailable or invalid.
}

function subscribe(listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useDiscounts() {
  return useSyncExternalStore(subscribe, () => discounts)
}

// Returns whether the change was saved to browser storage (false means it only lasts for this session).
export function setDiscount(productId, value) {
  const { [productId]: _previous, ...rest } = discounts
  discounts = value > 0 ? { ...rest, [productId]: value } : rest
  listeners.forEach(listener => listener())
  try {
    localStorage.setItem(storageKey, JSON.stringify(discounts))
    return true
  } catch {
    return false
  }
}
