import { Link } from 'react-router-dom'
import { lowStockLimit } from '../data/catalogue.js'
import { formatPrice, genreAccent, lowestPrice, salePrice } from '../data/productStore.js'
import ProductVisual from './ProductVisual.jsx'

// A live catalogue product. Each format (Stocktake row) has its own price and stock; the card shows the cheapest.
export default function ProductCard({ product, discount = 0 }) {
  const price = lowestPrice(product)
  const from = new Set(product.stock.map((item) => item.price)).size > 1 ? 'From ' : ''
  const available = product.quantity > 0
  return (
    <article className="product-card">
      <Link
        to={`/products/${product.id}`}
        className="product-card__visual"
        aria-label={`View ${product.title}`}
      >
        <ProductVisual
          product={{
            title: product.title,
            category: product.genre,
            accent: genreAccent(product.genre),
          }}
        />
        {available && product.quantity < lowStockLimit && (
          <span className="stock-badge">Only {product.quantity} left</span>
        )}
      </Link>
      <div className="product-card__body">
        <p className="eyebrow">
          {product.subGenre ? `${product.genre} · ${product.subGenre}` : product.genre}
        </p>
        <h3>
          <Link to={`/products/${product.id}`}>{product.title}</Link>
        </h3>
        {product.author && <p className="product-author">by {product.author}</p>}
        {product.description && <p className="product-description">{product.description}</p>}
        {product.stock.length > 0 && (
          <p className="product-formats">{product.stock.map((item) => item.source).join(' · ')}</p>
        )}
        <p className={available ? 'stock-line' : 'stock-line stock-line--out'}>
          <span aria-hidden="true">●</span>
          {available ? 'In stock' : 'Out of stock'}
        </p>
        <div className="product-price">
          {price === null ? (
            <strong>Not available</strong>
          ) : (
            <>
              <strong>
                {from}
                {formatPrice(salePrice({ price, discount }))}
              </strong>
              {discount > 0 && (
                <>
                  <del aria-label="Original price">{formatPrice(price)}</del>
                  <span className="pill">{discount}% off</span>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  )
}
