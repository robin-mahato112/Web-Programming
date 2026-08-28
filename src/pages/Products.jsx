import { useState } from 'react'
import Input from '../components/Input.jsx'
import ProductCard from '../components/ProductCard.jsx'
import { mockProducts } from '../data/mockProducts.js'

export default function Products() {
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('All')
  const categories = ['All', ...new Set(mockProducts.map(product => product.category))]
  const results = mockProducts.filter(product => {
    const matchesQuery = `${product.title} ${product.category}`.toLowerCase().includes(query.toLowerCase())
    return matchesQuery && (category === 'All' || product.category === category)
  })

  return <section className="section shell catalogue-page">
    <div className="page-intro"><div><p className="eyebrow">The collection</p><h1>Find your next favourite.</h1></div><p className="lead compact">Games, stories, soundtracks and films—all together in one simple collection.</p></div>
    <div className="search-panel"><Input id="product-search" label="Search the catalogue" type="search" placeholder="Try ‘game’ or ‘music’" value={query} onChange={event => setQuery(event.target.value)} /><span aria-live="polite">{results.length} result{results.length === 1 ? '' : 's'}</span></div>
    <div className="filter-row" aria-label="Filter products by category">{categories.map(item => <button className={category === item ? 'filter-chip filter-chip--active' : 'filter-chip'} type="button" aria-pressed={category === item} onClick={() => setCategory(item)} key={item}>{item}</button>)}</div>
    {results.length ? <div className="product-grid">{results.map(product => <ProductCard key={product.id} product={product} />)}</div> : <div className="empty-state"><span aria-hidden="true">⌕</span><h2>No matching products</h2><p>Try a shorter search or choose another category.</p><button className="text-button" onClick={() => { setQuery(''); setCategory('All') }} type="button">Clear all filters</button></div>}
  </section>
}
