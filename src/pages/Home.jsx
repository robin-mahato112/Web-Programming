import { Link } from 'react-router-dom'
import ProductCard from '../components/ProductCard.jsx'
import { mockProducts } from '../data/mockProducts.js'

export default function Home() {
  return <>
    <section className="hero">
      <div className="hero-orb hero-orb--one" aria-hidden="true"></div><div className="hero-orb hero-orb--two" aria-hidden="true"></div><div className="shell hero__grid"><div className="hero__copy"><p className="eyebrow">Welcome to the guild</p><h1>Find your next <em>obsession.</em></h1><p className="lead">Games, films, books and music selected for curious fans and unforgettable weekends.</p><div className="actions"><Link className="button button--primary" to="/products">Browse collection <span aria-hidden="true">→</span></Link><Link className="button button--secondary" to="/register">Join the guild</Link></div><div className="hero-points" aria-label="Store highlights"><span>Curated picks</span><span>All genres</span><span>Made for fans</span></div></div><div className="hero-card" aria-hidden="true"><span>PLAY</span><strong>YOUR<br />STORY</strong><i>01 / 06</i></div></div></section>
    <section className="section shell"><div className="section-heading"><div><p className="eyebrow">Popular now</p><h2>Guild favourites</h2></div><Link to="/products">View all products →</Link></div><div className="product-grid">{mockProducts.slice(0, 3).map(product => <ProductCard key={product.id} product={product} />)}</div></section>
    <section className="role-strip"><div className="shell"><p className="eyebrow">Sprint 1 role prototypes</p><h2>One guild, three experiences</h2><div className="role-grid"><Link to="/profile"><strong>Customer</strong><span>Profile and account prototype</span></Link><Link to="/employee"><strong>Employee</strong><span>Read-only workspace</span></Link><Link to="/admin"><strong>Administrator</strong><span>Management overview</span></Link></div></div></section>
  </>
}
