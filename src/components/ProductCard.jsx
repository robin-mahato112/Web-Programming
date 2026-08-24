import { Link } from 'react-router-dom'

export default function ProductCard({ product }) {
  return (
    <article className="product-card">
      <div className={`product-art product-art--${product.accent}`} aria-hidden="true"><span>{product.category.charAt(0)}</span></div>
      <div className="product-card__body">
        <p className="eyebrow">{product.category}</p>
        <h3><Link to={`/products/${product.id}`}>{product.title}</Link></h3>
        <div className="product-meta"><strong>${product.price.toFixed(2)}</strong><span aria-label={`${product.rating} out of 5 stars`}>★ {product.rating}</span></div>
      </div>
    </article>
  )
}
