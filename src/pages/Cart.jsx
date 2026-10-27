import { Link, useLocation } from 'react-router-dom'
import { catalogueQuery } from '../lib/search.js'
import ProductVisual from '../components/ProductVisual.jsx'
import QuantityControl from '../components/QuantityControl.jsx'
import CartSummary from '../components/CartSummary.jsx'
import Recommendations from '../components/Recommendations.jsx'
import { stockLabel } from '../lib/products.js'
import { calculateTotals } from '../lib/money.js'
import { useCart } from '../store/cartContext.js'

/**
 * Render the last server-accepted cart quote, keeping different source offers on separate lines.
 * Quantity changes are checked remotely; removal remains available to cancel pending changes.
 * Saved selections are restored before rendering; notices explain any stock adjustments.
 */
export default function Cart() {
  const search = catalogueQuery(useLocation().search)
  const {
    items,
    itemCount,
    subtotal,
    updateQuantity,
    removeItem,
    clearCart,
    refreshCart,
    loading,
    error,
    reloadProducts,
    cartPending,
    cartError,
    cartNotice,
  } = useCart()
  if (loading)
    return (
      <section className="section shell empty-state">
        <h1>Your cart</h1>
        <p role="status">Loading your saved selections…</p>
      </section>
    )
  if (error)
    return (
      <section className="section shell empty-state">
        <h1>Unable to load your cart</h1>
        <p role="alert">{error}</p>
        <button className="button button--dark" onClick={reloadProducts} type="button">
          Try again
        </button>
      </section>
    )
  if (!items.length)
    return (
      <section className="section shell empty-state">
        <h1>Your cart is empty</h1>
        <p role={cartPending ? 'status' : undefined}>
          {cartPending ? 'Checking your selected items…' : 'Browse products to get started.'}
        </p>
        {cartNotice && <p role="status">{cartNotice}</p>}
        {cartError && (
          <p className="field-error" role="alert">
            {cartError}
          </p>
        )}
        <Link className="button button--dark" to={'/products' + search}>
          Browse products
        </Link>
      </section>
    )

  return (
    <section className="section shell" aria-busy={cartPending}>
      <h1>
        Your cart ({itemCount} {itemCount === 1 ? 'item' : 'items'})
      </h1>
      <p className="lead">Review your selections, sources and quantities.</p>
      {cartPending && <p role="status">Checking current prices and availability…</p>}
      {cartNotice && <p role="status">{cartNotice}</p>}
      {cartError && (
        <p className="field-error" role="alert">
          {cartError}
        </p>
      )}
      <div className="cart-layout">
        <div>
          <div className="cart-head">
            <span>Product</span>
            <span>Quantity</span>
            <span>Total</span>
          </div>
          {items.map(({ itemId, productId, product, quantity }) => (
            <article className="cart-item" key={itemId}>
              <ProductVisual product={product} />
              <div>
                <h2>
                  <Link
                    to={'/products/' + productId + search + (search ? '&' : '?') + 'item=' + itemId}
                  >
                    {product.title}
                  </Link>
                </h2>
                <p>
                  {product.category} · {stockLabel(product.stock)}
                </p>
                <p>Source: {product.sourceName}</p>
                <p>{'$' + product.price.toFixed(2)} each</p>
                <button className="text-button" type="button" onClick={() => removeItem(itemId)}>
                  Remove
                </button>
              </div>
              <QuantityControl
                value={quantity}
                min={cartPending ? quantity : 1}
                max={cartPending ? quantity : product.stock}
                onChange={(value) => updateQuantity(itemId, value)}
              />
              <strong>{'$' + calculateTotals([{ product, quantity }]).subtotal.toFixed(2)}</strong>
            </article>
          ))}
          <div className="info-panel">
            <strong>Keep your selections up to date.</strong>
            <p>Prices and availability reflect the latest successful check.</p>
          </div>
          <Link className="button button--outline" to={'/products' + search}>
            Continue shopping
          </Link>
        </div>
        <div>
          <CartSummary subtotal={subtotal} itemCount={itemCount}>
            {!cartPending && (
              <Link className="button button--dark button--wide" to={'/checkout' + search}>
                Proceed to checkout
              </Link>
            )}
            <button
              className="button button--outline button--wide"
              type="button"
              onClick={refreshCart}
              disabled={cartPending}
            >
              {cartPending ? 'Checking availability…' : 'Check availability'}
            </button>
            <button
              className="button button--outline button--wide"
              type="button"
              onClick={clearCart}
            >
              Clear cart
            </button>
          </CartSummary>
        </div>
      </div>
      <Recommendations selected={items.map((item) => item.product)} search={search} />
    </section>
  )
}
