/**
 * Build an illustrated product cover using text and CSS shapes.
 * The product's accent selects a palette in styles/product-art.css; the large
 * modifier increases its detail-page size. The outer element provides one image
 * description, while aria-hidden prevents decorative lettering from being read twice.
 *
 * @param {object} props - Cover content and display options.
 * @param {{title: string, category: string, accent: string}} props.product - Cover data.
 * @param {boolean} [props.large=false] - Use the expanded detail-view presentation.
 */
export default function ProductVisual({ product, large = false }) {
  return (
    <div
      className={`product-visual product-visual--${product.accent}${large ? ' product-visual--large' : ''}`}
      role="img"
      aria-label={`${product.title} illustrated cover`}
    >
      <div className="cover-art" aria-hidden="true">
        <span className="cover-edition">THE GUILD COLLECTION / {product.category}</span>
        <span className="cover-orbit" />
        <strong className="cover-title">{product.title}</strong>
        <span className="cover-footer">
          ANOTHER WORLD AWAITS <span>EG</span>
        </span>
      </div>
    </div>
  )
}
