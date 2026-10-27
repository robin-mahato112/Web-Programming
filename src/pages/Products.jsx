import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import CatalogueSearch from '../components/catalogue/CatalogueSearch.jsx'
import CatalogueResults from '../components/catalogue/CatalogueResults.jsx'
import CatalogueHero from '../components/catalogue/CatalogueHero.jsx'
import CatalogueFilters from '../components/catalogue/CatalogueFilters.jsx'
import { defaultFilters, readSearch, searchQuery } from '../lib/search.js'
import { useCart } from '../store/cartContext.js'

/**
 * The URL owns submitted search and filter state, so details, Back and refresh retain the results.
 * The catalogue service finds keyword matches through a parameterised backend database query.
 * Shared desktop/mobile controls then refine those matches by price, category and availability.
 */
export default function Products() {
  const { products, loading, error, reloadProducts } = useCart()
  const [params, setParams] = useSearchParams()
  const filters = readSearch(params.toString())
  const returnQuery = searchQuery(filters)
  const [searchAttempt, setSearchAttempt] = useState(0)
  const { query, category, inStockOnly, sort } = filters
  const priceLimit = Math.max(100, ...products.map((product) => Math.ceil(product.price)))
  const maxPrice = Math.min(filters.maxPrice ?? priceLimit, priceLimit)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const filtered = query.trim() || category !== 'All' || inStockOnly || maxPrice < priceLimit

  // Each control changes one URL value and retains the remaining search constraints.
  function updateFilter(name, value) {
    setParams((current) => searchQuery({ ...readSearch(current.toString()), [name]: value }))
  }

  function clearFilters() {
    // Reset result constraints while preserving the customer's preferred ordering.
    setParams(searchQuery({ ...defaultFilters, sort }))
  }

  if (loading)
    return (
      <section className="section shell empty-state">
        <h1>The collection</h1>
        <p role="status">Loading products…</p>
      </section>
    )
  if (error)
    return (
      <section className="section shell empty-state">
        <h1>Unable to load products</h1>
        <p role="alert">{error}</p>
        <button className="button button--dark" onClick={reloadProducts} type="button">
          Try again
        </button>
      </section>
    )
  if (!products.length)
    return (
      <section className="section shell empty-state">
        <h1>No products available</h1>
        <p>No listings are available in the current catalogue.</p>
        <button className="button button--outline" onClick={reloadProducts} type="button">
          Refresh collection
        </button>
      </section>
    )

  return (
    <section className="section shell catalogue-page">
      <CatalogueHero product={products[0]} returnQuery={returnQuery} />
      <div className="collection-heading" id="collection">
        <div>
          <p className="eyebrow">CURATED FOR YOUR DOWNTIME</p>
          <h2>Find your kind of fun.</h2>
        </div>
        <span className="collection-count">
          The collection / {String(products.length).padStart(2, '0')}
        </span>
      </div>
      <div className="search-panel">
        <CatalogueSearch
          query={query}
          onSearch={(value) => {
            updateFilter('query', value)
            setSearchAttempt((attempt) => attempt + 1)
          }}
        />
        <button
          className="button filter-toggle"
          type="button"
          aria-expanded={filtersOpen}
          aria-controls="catalogue-filters"
          onClick={() => setFiltersOpen(!filtersOpen)}
        >
          Filters {filtered ? '•' : '+'}
        </button>
        <label className="sort-field">
          <span>Sort by</span>
          <select value={sort} onChange={(event) => updateFilter('sort', event.target.value)}>
            <option value="featured">Featured</option>
            <option value="price-low">Price: low to high</option>
            <option value="price-high">Price: high to low</option>
            <option value="name">Name: A to Z</option>
          </select>
        </label>
      </div>
      <div className="catalogue-layout">
        <CatalogueFilters
          products={products}
          filters={{ ...filters, maxPrice }}
          priceLimit={priceLimit}
          open={filtersOpen}
          hasFilters={Boolean(filtered)}
          onChange={updateFilter}
          onReset={clearFilters}
        />
        <CatalogueResults
          key={`${query}:${searchAttempt}`}
          filters={{ ...filters, maxPrice }}
          total={products.length}
          returnQuery={returnQuery}
          onReset={clearFilters}
        />
      </div>
    </section>
  )
}
