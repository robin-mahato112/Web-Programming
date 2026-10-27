import { Link } from 'react-router-dom'
import ProductVisual from '../ProductVisual.jsx'

/**
 * Introduce the collection and feature the product selected by the catalogue page.
 * The title, price, cover and destination all use that record so the promotion
 * cannot drift from its product link. The other call to action scrolls to the
 * collection heading on the same page without changing catalogue state.
 *
 * @param {{product: object}} props - Catalogue record chosen for the featured panel.
 */
export default function CatalogueHero({ product, returnQuery = '' }) {
  return (
    <div className="catalogue-hero">
      <div className="hero-copy">
        <p className="eyebrow">
          <span className="little-star" aria-hidden="true">
            ✳
          </span>{' '}
          A little escape. A great discovery.
        </p>
        <h1>
          Good times.
          <br />
          <span>Great finds.</span>
        </h1>
        <p>
          For players, readers, and movie lovers.
          <br className="desktop-break" /> Find your next favourite.
        </p>
        <a className="button button--dark" href="#collection">
          Explore the collection <span aria-hidden="true">↗</span>
        </a>
        <p className="hero-caption">Games. Books. Movies. Find your next escape.</p>
      </div>
      <Link
        className="hero-feature"
        to={`/products/${product.id}${returnQuery}`}
        aria-label={`Discover ${product.title}, our featured pick`}
      >
        <span className="feature-label">
          THE GUILD PICK <span aria-hidden="true">↗</span>
        </span>
        <div className="feature-cover">
          <ProductVisual product={product} />
        </div>
        <div className="feature-caption">
          <div>
            <span>Make a night of it</span>
            <strong>{product.title}</strong>
          </div>
          <span className="feature-price">${product.price.toFixed(2)}</span>
        </div>
      </Link>
    </div>
  )
}
