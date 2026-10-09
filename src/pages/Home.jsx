import { Link } from 'react-router-dom'
import { useStaffSession } from '../data/staffSession.js'
import { useProducts } from '../data/productStore.js'
import ProductCard from '../components/ProductCard.jsx'
import ProductVisual from '../components/ProductVisual.jsx'

export default function Home() {
  const user = useStaffSession()
  const products = useProducts()

  return (
    <>
    <section className="hero">
      <div className="shell hero__grid catalogue-hero">
        <div className="hero__copy hero-copy">
          <p className="eyebrow">Welcome to the guild</p>
          <h1>Your story <span>starts here.</span></h1>
          <p className="lead">Welcome to Entertainment Guild. Sign in to your account or join the guild to get started.</p>
          {user && <p className="notice" role="status">Signed in as {user.name} ({user.role}).</p>}
          <div className="actions">
            <Link className="button button--primary" to="/login">Sign in</Link>
            <Link className="button button--secondary" to="/register">Create an account</Link>
          </div>
          <p><Link to="/admin/login">Admin sign in →</Link></p>
        </div>
        <div className="hero-card hero-feature" aria-hidden="true">
          <div className="feature-label">WELCOME<span>✦</span></div>
          <div className="feature-cover">
            <ProductVisual product={{ title: 'Your Story', category: 'Welcome', accent: 'violet' }} />
          </div>
          <div className="feature-caption"><strong>ENTERTAINMENT GUILD</strong></div>
        </div>
      </div>
    </section>
    <section className="section shell" aria-labelledby="products-heading">
      <div className="collection-heading">
        <div>
          <p className="eyebrow">Explore the collection</p>
          <h2 id="products-heading">Guild favourites</h2>
        </div>
      </div>
      <p>Games, films, books and music. All prices are in AUD.</p>
      <div className="product-grid">
        {products.map(product => <ProductCard key={product.id} product={product} />)}
      </div>
    </section>
    </>
  )
}
