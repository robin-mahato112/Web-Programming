// Shared cover markup for the supplied catalogue and product-art styles.
export default function ProductVisual({ product }) {
  return (
    <div className={`product-visual product-visual--${product.accent}`} aria-hidden="true">
      <div className="cover-art">
        <span className="cover-edition">{product.category}</span>
        <strong className="cover-title">{product.title}</strong>
        <div className="cover-orbit" />
        <div className="cover-footer"><span>EG</span>Entertainment Guild</div>
      </div>
    </div>
  )
}
