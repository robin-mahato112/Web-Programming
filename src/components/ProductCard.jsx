import { formatPrice, salePrice } from '../data/productStore.js'

export default function ProductCard({ product }) {
  return (
    <article className="product-card">
      <div className={`product-art product-art--${product.accent}`} aria-hidden="true">
        <span>{product.title.charAt(0)}</span>
      </div>
      <div className="product-card__body">
        <p className="eyebrow">{product.category}</p>
        <h3>{product.title}</h3>
        <p>{product.description}</p>
        <div className="product-price">
          <strong>{formatPrice(salePrice(product))}</strong>
          {product.discount > 0 && <><del aria-label="Original price">{formatPrice(product.price)}</del><span className="pill">{product.discount}% off</span></>}
        </div>
        <p className="product-stock"><span className={product.quantity > 0 ? 'pill' : 'pill pill--muted'}>{product.quantity > 0 ? 'Available' : 'Out of stock'}</span> {product.quantity} units available</p>
        <small>Rating: {product.rating} / 5</small>
      </div>
    </article>
  )
}
