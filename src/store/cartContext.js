import { createContext, useContext } from 'react'

// Keep the context and hook outside the component module so Fast Refresh can preserve its boundary.
export const CartContext = createContext(null)

/**
 * Read detailed cart lines, derived totals and validated actions from the nearest CartProvider.
 * Consumers share that provider's state, so mutations update the header, product details and cart together.
 * A missing provider is a wiring error and throws immediately instead of supplying an independent cart.
 *
 * @returns {object} Current cart value containing items, itemCount, subtotal and mutation actions.
 * @throws {Error} When called by a component rendered outside CartProvider.
 */
export function useCart() {
  const cart = useContext(CartContext)
  if (!cart) throw new Error('useCart must be used within CartProvider.')
  return cart
}
