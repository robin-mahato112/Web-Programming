import { useCallback, useEffect, useRef, useState } from 'react'
import {
  addCartItem,
  consumeCartItems,
  cartAdjustmentNotice,
  cartPriceNotice,
  getCartProduct,
  mergeQuotedProducts,
  readSavedCart,
  reconcileCart,
  removeCartItem,
  saveCart,
  setCartQuantity,
} from '../lib/cart.js'
import { calculateTotals } from '../lib/money.js'
import { fetchCatalogue, quoteCart } from '../services/catalogue.js'
import { CartContext } from './cartContext.js'

const serviceError = (error) =>
  error.name === 'TimeoutError'
    ? 'The product service timed out. Please try again.'
    : error instanceof TypeError || error instanceof SyntaxError
      ? 'The product service is unavailable. Please try again.'
      : error.message

/**
 * Share one database catalogue and restore compact cart identifiers after loading current offers.
 * Offer IDs distinguish different sources of the same product. Additions and quantity updates
 * commit only after a fresh catalogue estimate; failed requests leave the last accepted cart intact.
 * Browser storage holds only itemId and quantity. Checkout independently validates prices and stock
 * on the server; accepting a cart estimate neither reserves inventory nor authorizes a purchase.
 * Explicit initial data is supported for isolated route tests and is never a runtime fallback.
 */
export function CartProvider({ children, initialProducts, initialItems = [] }) {
  const persist = initialProducts === undefined
  const [products, setProducts] = useState(initialProducts || [])
  const [loading, setLoading] = useState(initialProducts === undefined)
  const [error, setError] = useState('')
  const [items, setItems] = useState(() =>
    initialItems
      .map((item) => {
        const product = getCartProduct(initialProducts || [], item.itemId)
        return product ? { ...item, productId: product.id, product } : null
      })
      .filter(Boolean),
  )
  const [cartPending, setCartPending] = useState(false)
  const [cartError, setCartError] = useState('')
  const [cartNotice, setCartNotice] = useState('')
  // Refs expose the latest accepted values inside async callbacks before the next render.
  // State drives the UI; request refs also identify responses superseded by a newer action.
  const currentItems = useRef(items)
  const currentProducts = useRef(products)
  const catalogueRequest = useRef(null)
  const cartRequest = useRef(null)
  const restoreRequired = useRef(persist)
  const completedOrders = useRef(new Set())

  // Search results refresh matching detail records without narrowing the cart's catalogue.
  const rememberProducts = useCallback((next, replace = false) => {
    const merged = replace
      ? next
      : [
          ...new Map(
            [...currentProducts.current, ...next].map((product) => [product.id, product]),
          ).values(),
        ]
    currentProducts.current = merged
    setProducts(merged)
  }, [])

  // Persist only accepted changes, never the empty initial render. This keeps saved selections
  // intact while catalogue restoration is loading or an API request has failed.
  const commit = useCallback(
    (next, notice = '') => {
      currentItems.current = next
      setItems(next)
      const saved = !persist || saveCart(next)
      setCartNotice(
        saved ? notice : 'Your browser could not save this cart. Changes will last for this visit.',
      )
    },
    [persist],
  )

  const loadProducts = useCallback(() => {
    catalogueRequest.current?.abort()
    if (restoreRequired.current) {
      cartRequest.current?.abort()
      cartRequest.current = null
    }
    const controller = new AbortController()
    catalogueRequest.current = controller
    let restorationRequest
    return fetchCatalogue(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]))
      .then(async (next) => {
        if (controller.signal.aborted || catalogueRequest.current !== controller) return
        currentProducts.current = next
        setProducts(next)
        if (!restoreRequired.current) return

        const saved = readSavedCart()
        const restored = reconcileCart(saved.items, next)
        let quote = { items: [] }
        if (saved.items.length) {
          restorationRequest = new AbortController()
          cartRequest.current = restorationRequest
          setCartPending(true)
          quote = await quoteCart(
            restored.items,
            AbortSignal.any([
              controller.signal,
              restorationRequest.signal,
              AbortSignal.timeout(15000),
            ]),
          )
        }
        // Clear/remove can supersede restoration, just as they supersede an ordinary quote.
        if (
          controller.signal.aborted ||
          catalogueRequest.current !== controller ||
          !restoreRequired.current ||
          restorationRequest?.signal.aborted ||
          (restorationRequest && cartRequest.current !== restorationRequest)
        )
          return
        const updatedProducts = mergeQuotedProducts(next, quote.items)
        currentProducts.current = updatedProducts
        setProducts(updatedProducts)
        restoreRequired.current = false
        const notice = saved.unavailable
          ? 'Your browser could not load the saved cart. You can start a new cart for this visit.'
          : saved.adjusted || restored.adjusted
            ? cartAdjustmentNotice(saved.items, restored.items) ||
              'Invalid saved selections were removed.'
            : saved.items.length
              ? 'Your saved cart was restored with current prices.'
              : ''
        commit(
          quote.items,
          [notice, cartPriceNotice(currentItems.current, quote.items)].filter(Boolean).join(' '),
        )
      })
      .catch((failure) => {
        if (
          !controller.signal.aborted &&
          catalogueRequest.current === controller &&
          !restorationRequest?.signal.aborted
        )
          setError(serviceError(failure))
      })
      .finally(() => {
        if (!controller.signal.aborted && catalogueRequest.current === controller) {
          if (cartRequest.current === restorationRequest || !cartRequest.current) {
            cartRequest.current = null
            setCartPending(false)
          }
          setLoading(false)
        }
      })
  }, [commit])

  function reloadProducts() {
    setLoading(true)
    setError('')
    return loadProducts()
  }

  useEffect(() => {
    if (initialProducts === undefined) void loadProducts()
    const refresh = () => {
      if (initialProducts === undefined) void loadProducts()
    }
    window.addEventListener('entertainment-guild:catalogue-changed', refresh)
    return () => {
      window.removeEventListener('entertainment-guild:catalogue-changed', refresh)
      catalogueRequest.current?.abort()
      cartRequest.current?.abort()
    }
  }, [initialProducts, loadProducts])

  async function changeCart(update, refresh = false) {
    // The ref locks immediately, before React renders disabled controls.
    if (cartRequest.current || restoreRequired.current) return false
    let next = update(currentItems.current, currentProducts.current)
    if (next === currentItems.current) {
      setCartError('Choose an available quantity for this source.')
      return false
    }
    const controller = new AbortController()
    cartRequest.current = controller
    setCartPending(true)
    setCartError('')
    try {
      const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(15000)])
      let catalogue = currentProducts.current
      let notice = ''
      if (refresh) {
        catalogue = await fetchCatalogue(signal)
        const reconciled = reconcileCart(next, catalogue)
        notice = cartAdjustmentNotice(next, reconciled.items) || 'Prices and availability checked.'
        next = reconciled.items
      }
      const quote = await quoteCart(next, signal)
      // A removal, clear or unmount may supersede this quote while the network is pending.
      if (controller.signal.aborted || cartRequest.current !== controller) return false
      // Refresh offer limits before another action can run; keep the catalogue's cheapest-source summary.
      const updatedProducts = mergeQuotedProducts(
        refresh ? catalogue : currentProducts.current,
        quote.items,
      )
      currentProducts.current = updatedProducts
      setProducts(updatedProducts)
      commit(
        quote.items,
        [notice, cartPriceNotice(currentItems.current, quote.items)].filter(Boolean).join(' '),
      )
      return true
    } catch (failure) {
      if (!controller.signal.aborted && cartRequest.current === controller)
        setCartError(serviceError(failure))
      return false
    } finally {
      if (!controller.signal.aborted && cartRequest.current === controller) {
        cartRequest.current = null
        setCartPending(false)
      }
    }
  }

  function removeOrClear(itemId) {
    // Removal is an explicit customer decision. Cancel restoration/quotes first so a late response
    // cannot put a deliberately removed listing back into the cart.
    cartRequest.current?.abort()
    cartRequest.current = null
    setCartPending(false)
    setCartError('')
    restoreRequired.current = false
    commit(itemId === undefined ? [] : removeCartItem(currentItems.current, itemId))
  }

  const completeCheckout = useCallback(
    (order) => {
      // Repeated confirmation renders must consume purchased units only once per mounted provider.
      // Checkout also persists its applied flag so refreshing does not consume those units again.
      if (restoreRequired.current || completedOrders.current.has(order.orderId)) return false
      completedOrders.current.add(order.orderId)
      cartRequest.current?.abort()
      cartRequest.current = null
      setCartPending(false)
      setCartError('')
      commit(
        consumeCartItems(currentItems.current, order.items),
        'Purchased items removed from your cart.',
      )
      return true
    },
    [commit],
  )

  const { subtotal } = calculateTotals(items)
  const value = {
    products,
    loading,
    error,
    reloadProducts,
    rememberProducts,
    items,
    subtotal,
    itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
    cartPending,
    cartError,
    cartNotice,
    addItem: (itemId, quantity) =>
      changeCart((items, products) => addCartItem(items, itemId, quantity, products)),
    updateQuantity: (itemId, quantity) =>
      changeCart((items, products) => setCartQuantity(items, itemId, quantity, products)),
    removeItem: removeOrClear,
    clearCart: () => removeOrClear(),
    refreshCart: () => changeCart((items) => [...items], true),
    completeCheckout,
  }
  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}
