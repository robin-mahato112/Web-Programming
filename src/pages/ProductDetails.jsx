import { Link, useParams } from 'react-router-dom'
import { mockProducts } from '../data/mockProducts.js'

export default function ProductDetails() {
  const { productId } = useParams()
  const product = mockProducts.find(item => item.id === productId)
  if (!product) return <section className="section shell empty-state"><h1>Product not found</h1><p>This demo product does not exist.</p><Link to="/products">Return to products</Link></section>
  return <section className="section shell detail-grid"><div className={`product-art product-art--${product.accent} product-art--large`} aria-hidden="true"><span>{product.category.charAt(0)}</span></div><div><p className="eyebrow">{product.category}</p><h1>{product.title}</h1><p className="lead">{product.description}</p><p className="detail-price">${product.price.toFixed(2)}</p><p className="status-note">Prototype only — adding products to a persistent cart is planned for a later sprint.</p><Link className="button button--primary" to="/cart">View cart prototype</Link></div></section>
}
