import { Link } from 'react-router-dom'
import ProductCard from '../components/ProductCard.jsx'
import { mockProducts } from '../data/mockProducts.js'

export default function Home() {
  return <>
    <section className="hero"><div className="shell hero__grid"><div><p className="eyebrow">Welcome to the guild</p><h1>Entertainment worth gathering for.</h1><p className="lead">Discover games, films, books and music selected for every kind of fan.</p><div className="actions"><Link className="button button--primary" to="/products">Browse collection</Link><Link className="button button--secondary" to="/register">Join the guild</Link></div></div><div className="hero-card" aria-hidden="true"><span>PLAY</span><strong>YOUR<br />STORY</strong></div></div></section>
    <section className="section shell"><div className="section-heading"><div><p className="eyebrow">Popular now</p><h2>Guild favourites</h2></div><Link to="/products">View all products →</Link></div><div className="product-grid">{mockProducts.slice(0, 3).map(product => <ProductCard key={product.id} product={product} />)}</div></section>
    <section className="role-strip"><div className="shell"><p className="eyebrow">Sprint 1 role prototypes</p><h2>One guild, three experiences</h2><div className="role-grid"><Link to="/profile"><strong>Customer</strong><span>Profile and account prototype</span></Link><Link to="/employee"><strong>Employee</strong><span>Read-only workspace</span></Link><Link to="/admin"><strong>Administrator</strong><span>Management overview</span></Link></div></div></section>
  </>
}
