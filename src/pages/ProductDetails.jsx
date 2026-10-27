import { useEffect, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { catalogueQuery } from '../lib/search.js'
import { stockLabel } from '../lib/products.js'
import ProductVisual from '../components/ProductVisual.jsx'
import QuantityControl from '../components/QuantityControl.jsx'
import Recommendations from '../components/Recommendations.jsx'
import { useCart } from '../store/cartContext.js'

/** Keep the chosen listing in the URL; reset only unsubmitted quantity when the product changes. */
export default function ProductDetails() {
  const { productId } = useParams()
  return <ProductDetailsContent key={productId} productId={productId} />
}

/**
 * Product IDs identify catalogue titles; itemIds identify the source offer being bought.
 * Remaining stock and price follow the chosen offer. Successful additions keep the customer here.
 */
function ProductDetailsContent({ productId }) {
  const [params, setParams] = useSearchParams()
  const search = catalogueQuery(params.toString())
  const {
    products,
    loading,
    error: catalogueError,
    reloadProducts,
    items,
    addItem,
    cartPending,
    cartError,
    refreshCart,
  } = useCart()
  const selectedItem = params.get('item') || ''
  const [quantity, setQuantity] = useState(1)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])
  const product = products.find((item) => item.id === productId)

  if (loading)
    return (
      <section className="section shell empty-state">
        <h1>Product details</h1>
        <p role="status">Loading product…</p>
      </section>
    )
  if (catalogueError)
    return (
      <section className="section shell empty-state">
        <h1>Unable to load product</h1>
        <p role="alert">{catalogueError}</p>
        <button className="button button--dark" onClick={reloadProducts} type="button">
          Try again
        </button>
      </section>
    )
  if (!product)
    return (
      <section className="section shell empty-state">
        <h1>Product not found</h1>
        <p>This product is no longer in our catalogue.</p>
        <Link className="button button--dark" to={'/products' + search}>
          Return to products
        </Link>
      </section>
    )

  // Default to an available low-price offer only when choosing an initial listing. If a bookmarked
  // listing disappeared, sourceUnavailable still blocks buying until the shopper chooses again.
  const offer =
    product.offers.find((offer) => offer.itemId === selectedItem) ||
    [...product.offers].sort(
      (first, second) =>
        Number(second.stock > 0) - Number(first.stock > 0) || first.price - second.price,
    )[0]
  const sourceUnavailable = Boolean(
    selectedItem && !product.offers.some((entry) => entry.itemId === selectedItem),
  )
  // Already selected units count against this listing's limit, not another source's stock.
  // This is a UI limit; final availability is rechecked by the checkout backend.
  const inCart = items.find((item) => item.itemId === offer.itemId)?.quantity || 0
  const remaining = sourceUnavailable ? 0 : Math.max(0, offer.stock - inCart)
  const selectedQuantity = Math.min(quantity, Math.max(1, remaining))

  async function addToCart() {
    setError('')
    setSuccess('')
    const accepted = await addItem(offer.itemId, selectedQuantity)
    // The global cart may finish updating after the shopper leaves this particular product page.
    if (!active.current) return
    if (!accepted) {
      setError('Unable to add this item. Please check availability and try again.')
      return
    }
    setSuccess(`${selectedQuantity} × ${product.title} (${offer.sourceName}) added to your cart.`)
    setQuantity(1)
  }

  return (
    <section className="section shell">
      <p className="breadcrumbs">
        <Link to={'/products' + search}>All products</Link> / {product.category} / {product.title}
      </p>
      <div className="detail-grid">
        <ProductVisual product={product} large />
        <div>
          <p className="eyebrow">{product.category}</p>
          <h1>{product.title}</h1>
          <p className="detail-price">
            {sourceUnavailable ? 'Choose a source' : '$' + offer.price.toFixed(2)}
          </p>
          <p
            className={
              'stock-strong' + (sourceUnavailable || offer.stock === 0 ? ' stock-line--out' : '')
            }
          >
            {sourceUnavailable
              ? 'The selected source is no longer available.'
              : stockLabel(offer.stock)}
            {!sourceUnavailable && inCart > 0 && ' · ' + inCart + ' in your cart'}
          </p>
          {product.author && <p className="lead">By {product.author}</p>}
          <a className="text-button" href="#product-description">
            Read product description
          </a>
          <label className="field">
            Source
            <select
              value={sourceUnavailable ? '' : offer.itemId}
              disabled={cartPending}
              onChange={(event) => {
                setParams(
                  (current) => {
                    const next = new URLSearchParams(current)
                    next.set('item', event.target.value)
                    return next
                  },
                  { replace: true },
                )
                setQuantity(1)
                setError('')
                setSuccess('')
              }}
            >
              {sourceUnavailable && (
                <option value="" disabled>
                  Choose an available source
                </option>
              )}
              {product.offers.map((option) => (
                <option key={option.itemId} value={option.itemId}>
                  {option.sourceName} · {'$' + option.price.toFixed(2)} ·{' '}
                  {option.stock > 0 ? option.stock + ' available' : 'Out of stock'}
                </option>
              ))}
            </select>
          </label>
          {remaining > 0 && (
            <>
              <h3>Quantity</h3>
              <QuantityControl
                value={selectedQuantity}
                min={cartPending ? selectedQuantity : 1}
                max={cartPending ? selectedQuantity : remaining}
                onChange={setQuantity}
              />
            </>
          )}
          <button
            className="button button--dark button--wide"
            type="button"
            onClick={addToCart}
            disabled={remaining === 0 || cartPending}
          >
            {cartPending
              ? 'Checking availability…'
              : sourceUnavailable
                ? 'Choose a source'
                : offer.stock === 0
                  ? 'Out of stock'
                  : remaining === 0
                    ? 'All available stock is in your cart'
                    : 'Add to cart'}
          </button>
          {error && (
            <div>
              <p className="field-error" role="alert">
                {cartError || error}
              </p>
              <button
                className="text-button"
                type="button"
                disabled={cartPending}
                onClick={async () => {
                  if (await refreshCart()) setError('')
                }}
              >
                Refresh availability
              </button>
            </div>
          )}
          <p role="status" aria-live="polite">
            {success}
          </p>
          <div className="two-actions">
            <Link className="button button--outline" to={'/products' + search}>
              Continue shopping
            </Link>
            <Link className="button button--outline" to={'/cart' + search}>
              View cart
            </Link>
          </div>
        </div>
      </div>
      <section
        className="product-description"
        id="product-description"
        aria-labelledby="description-heading"
      >
        <div>
          <p className="eyebrow">About this title</p>
          <h2 id="description-heading">Description</h2>
          <p className="description-copy">{product.description}</p>
        </div>
        <dl className="product-facts">
          <div>
            <dt>Category</dt>
            <dd>{product.category}</dd>
          </div>
          {product.author && (
            <div>
              <dt>Creator</dt>
              <dd>{product.author}</dd>
            </div>
          )}
          <div>
            <dt>Selected source</dt>
            <dd>{sourceUnavailable ? 'Choose a source' : offer.sourceName}</dd>
          </div>
          <div>
            <dt>Availability</dt>
            <dd>{sourceUnavailable ? 'Unavailable' : stockLabel(offer.stock)}</dd>
          </div>
        </dl>
      </section>
      <Recommendations selected={[product]} search={search} />
    </section>
  )
}
