import { useState } from 'react'
import Input from '../components/Input.jsx'
import ProductCard from '../components/ProductCard.jsx'
import { mockProducts } from '../data/mockProducts.js'

export default function Products() {
  const [query, setQuery] = useState('')
  const results = mockProducts.filter(product => `${product.title} ${product.category}`.toLowerCase().includes(query.toLowerCase()))
  return <section className="section shell"><p className="eyebrow">The collection</p><h1>Browse products</h1><p className="lead compact">Demo catalogue data is stored locally for Sprint 1.</p><div className="search-panel"><Input id="product-search" label="Search the catalogue" type="search" placeholder="Try ‘game’ or ‘music’" value={query} onChange={event => setQuery(event.target.value)} /><span aria-live="polite">{results.length} result{results.length === 1 ? '' : 's'}</span></div>{results.length ? <div className="product-grid">{results.map(product => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><span aria-hidden="true">⌕</span><h2>No matching products</h2><p>Try a shorter search or browse another category.</p><button className="text-button" onClick={() => setQuery('')} type="button">Clear search</button></div>}</section>
}
