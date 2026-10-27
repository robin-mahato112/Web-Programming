import { useId } from 'react'
import ProductCard from './ShopProductCard.jsx'
import { recommendProducts } from '../lib/recommendations.js'
import { useCart } from '../store/cartContext.js'

export default function Recommendations({ selected, search = '' }) {
  const { products, items } = useCart()
  const headingId = useId()
  const picks = recommendProducts(
    products,
    selected,
    items.map((item) => item.productId),
  )
  if (!picks.length) return null
  return (
    <section className="recommendations" aria-labelledby={headingId}>
      <p className="eyebrow">Keep exploring</p>
      <h2 id={headingId}>Recommended for you</h2>
      <p>More from the genres and categories in your selection.</p>
      <div className="recommendation-grid">
        {picks.map((product) => (
          <ProductCard key={product.id} product={product} returnQuery={search} />
        ))}
      </div>
    </section>
  )
}
