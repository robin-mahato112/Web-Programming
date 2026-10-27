import { Link } from 'react-router-dom'
import ProductVisual from './ProductVisual.jsx'
import { stockLabel } from '../lib/products.js'

/**
 * Present one catalogue record with its cover, category, price and stock label.
 * All links use the product ID to open the same details route; cart changes are
 * handled on that page. Availability affects the badge and text without hiding
 * sold-out products, so the catalogue can still describe the full collection.
 *
 * @param {{product: object}} props - Product record from the shared catalogue.
 */
export default function ProductCard({ product, returnQuery = '' }) {
  const href = `/products/${product.id}${returnQuery}`
  return (
    <article className="product-card">
      <Link className="product-card__visual" to={href} aria-label={`View ${product.title}`}>
        <ProductVisual product={product} />
        {product.stock === 0 && <span className="stock-badge">Out of stock</span>}
      </Link>
      <div className="product-card__body">
        <p className="eyebrow">{product.category}</p>
        <h3>
          <Link to={href}>{product.title}</Link>
        </h3>
        <p className={`stock-line${product.stock === 0 ? ' stock-line--out' : ''}`}>
          <span aria-hidden="true">●</span> {stockLabel(product.stock)}
        </p>
        <div className="product-meta">
          <strong>${product.price.toFixed(2)}</strong>
          <Link className="card-link" to={href} aria-label={`View details for ${product.title}`}>
            View <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </div>
    </article>
  )
}
