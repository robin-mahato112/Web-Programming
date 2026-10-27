import { Link } from 'react-router-dom'
import ProductVisual from './ProductVisual.jsx'
import { calculateTotals } from '../lib/money.js'

/** Show the current quote beside every checkout step; prices are still rechecked on submission. */
export default function CheckoutSummary({ items, subtotal, search }) {
  return (
    <aside className="summary-card checkout-summary" aria-label="Order summary">
      <div className="summary-heading">
        <h2>Order summary</h2>
        <Link to={'/cart' + search}>Edit cart</Link>
      </div>
      <ul>
        {items.map(({ itemId, product, quantity }) => (
          <li key={itemId}>
            <ProductVisual product={product} />
            <div>
              <strong>{product.title}</strong>
              <p>{product.sourceName}</p>
              <p>
                Qty {quantity} · ${product.price.toFixed(2)} each
              </p>
            </div>
            <strong>${calculateTotals([{ product, quantity }]).subtotal.toFixed(2)}</strong>
          </li>
        ))}
      </ul>
      <p className="summary-total">
        <span>Total (AUD)</span>
        <strong>${subtotal.toFixed(2)}</strong>
      </p>
      <small>Prices and availability are checked again when you place your order.</small>
    </aside>
  )
}
