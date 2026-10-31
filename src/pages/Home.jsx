import { useDeferredValue, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import ProductCard from '../components/ProductCard.jsx'
import ProductVisual from '../components/ProductVisual.jsx'
import ResourceStatus from '../components/ResourceStatus.jsx'
import { useResource } from '../data/backend.js'
import { catalogue } from '../data/catalogue.js'
import { formatPrice, genreAccent, lowestPrice } from '../data/productStore.js'
import { isStaff, roleLabel, staffHome, useSession } from '../data/session.js'

const pageSize = 24
const number = new Intl.NumberFormat('en-AU')
const time = value => Date.parse(value) || 0

const sorts = {
  recommended: { label: 'Recommended', compare: (a, b) => (b.quantity > 0) - (a.quantity > 0) || time(b.updatedAt) - time(a.updatedAt) },
  title: { label: 'Title A–Z', compare: (a, b) => a.title.localeCompare(b.title) },
  'price-asc': { label: 'Price: low to high', compare: (a, b) => (lowestPrice(a) ?? Infinity) - (lowestPrice(b) ?? Infinity) },
  'price-desc': { label: 'Price: high to low', compare: (a, b) => (lowestPrice(b) ?? -Infinity) - (lowestPrice(a) ?? -Infinity) },
  newest: { label: 'Newest release', compare: (a, b) => time(b.published) - time(a.published) },
}

function HeroCopy({ user }) {
  if (isStaff(user)) {
    return <>
      <p className="eyebrow">Welcome back</p>
      <h1>Hello, <span>{user.name}.</span></h1>
      <p className="lead">You're signed in as {roleLabel(user.role).toLowerCase()}. This is the shop as customers see it.</p>
      <Link className="button button--primary" to={staffHome(user)}>Open dashboard</Link>
    </>
  }
  if (user) {
    return <>
      <p className="eyebrow">Welcome back, {user.name}</p>
      <h1>Your next story <span>is waiting.</span></h1>
      <p className="lead">Books, films and games from the guild's shelves, with prices in AUD.</p>
      <div className="actions"><a className="button button--primary" href="#collection">Browse the collection</a><Link className="button button--secondary" to="/account">My account</Link></div>
    </>
  }
  return <>
    <p className="eyebrow">Welcome to the guild</p>
    <h1>Your story <span>starts here.</span></h1>
    <p className="lead">Books, films and games from the guild's shelves. Join the guild to save your delivery details.</p>
    <div className="actions"><a className="button button--primary" href="#collection">Browse the collection</a><Link className="button button--secondary" to="/register">Create an account</Link></div>
  </>
}

// The most recently updated product that is in stock.
function FeaturedProduct({ products }) {
  const featured = products.filter(product => product.quantity > 0).sort(sorts.recommended.compare)[0]
  if (!featured) return <div className="feature-cover"><ProductVisual product={{ title: 'Your Story', category: 'Welcome', accent: 'violet' }} /></div>
  const price = lowestPrice(featured)
  return <>
    <div className="feature-cover">
      <ProductVisual product={{ title: featured.title, category: featured.genre, accent: genreAccent(featured.genre) }} />
    </div>
    <div className="feature-caption">
      <div><span>{featured.author || featured.genre}</span><strong>{featured.title}</strong></div>
      {price !== null && <span className="feature-price">{formatPrice(price)}</span>}
    </div>
  </>
}

function Collection({ data }) {
  const { products, genres, subGenres } = data
  const [query, setQuery] = useState('')
  const [genreId, setGenreId] = useState(null)
  const [subGenre, setSubGenre] = useState('')
  const [inStockOnly, setInStockOnly] = useState(false)
  const [sort, setSort] = useState('recommended')
  const [visible, setVisible] = useState(pageSize)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const search = useDeferredValue(query.trim().toLowerCase())

  // Any change to what is shown starts the list from the top again.
  const change = setter => value => {
    setter(value)
    setVisible(pageSize)
  }
  const chooseGenre = id => {
    change(setGenreId)(id)
    setSubGenre('')
  }
  const clear = () => {
    setQuery('')
    chooseGenre(null)
    setInStockOnly(false)
  }

  const genreCounts = useMemo(() => Object.fromEntries(genres.map(genre => [genre.id, products.filter(product => product.genreId === genre.id).length])), [genres, products])
  const results = useMemo(() => products
    .filter(product => genreId === null || product.genreId === genreId)
    .filter(product => !subGenre || product.subGenre === subGenre)
    .filter(product => !inStockOnly || product.quantity > 0)
    .filter(product => !search || product.title.toLowerCase().includes(search) || product.author?.toLowerCase().includes(search))
    .sort(sorts[sort].compare), [products, genreId, subGenre, inStockOnly, search, sort])
  const filtered = Boolean(query.trim() || genreId !== null || inStockOnly)
  const subGenreOptions = genreId === null ? [] : (subGenres[genreId] ?? []).filter(option => products.some(product => product.genreId === genreId && product.subGenre === option.name))

  return <>
    <div className="search-panel">
      <label className="search-field catalogue-search">
        <span aria-hidden="true">⌕</span>
        <span className="sr-only">Search the collection</span>
        <input type="search" placeholder="Search by title or author" value={query} onChange={event => change(setQuery)(event.target.value)} />
      </label>
      <button className="button button--secondary filter-toggle" type="button" aria-expanded={filtersOpen} aria-controls="collection-filters" onClick={() => setFiltersOpen(!filtersOpen)}>Filters</button>
      <label className="sort-field">
        <span>Sort by</span>
        <select value={sort} onChange={event => change(setSort)(event.target.value)}>
          {Object.entries(sorts).map(([key, option]) => <option key={key} value={key}>{option.label}</option>)}
        </select>
      </label>
    </div>

    <div className="catalogue-layout">
      <aside id="collection-filters" className={filtersOpen ? 'filter-panel filter-panel--open' : 'filter-panel'} aria-label="Filters">
        <h3>Categories</h3>
        <div className="category-list">
          {[{ id: null, name: 'All products', count: products.length }, ...genres.map(genre => ({ ...genre, count: genreCounts[genre.id] }))].map(option =>
            <button key={option.id ?? 'all'} type="button" className={genreId === option.id ? 'category-button active' : 'category-button'} aria-pressed={genreId === option.id} onClick={() => chooseGenre(option.id)}>
              <span>{option.name}</span><span>{number.format(option.count)}</span>
            </button>)}
        </div>
        {subGenreOptions.length > 0 && <div className="filter-group field">
          <label htmlFor="sub-genre">Sub-genre</label>
          <select id="sub-genre" value={subGenre} onChange={event => change(setSubGenre)(event.target.value)}>
            <option value="">All</option>
            {subGenreOptions.map(option => <option key={option.id} value={option.name}>{option.name}</option>)}
          </select>
        </div>}
        <div className="filter-group">
          <label className="check-row"><input type="checkbox" checked={inStockOnly} onChange={event => change(setInStockOnly)(event.target.checked)} /> In stock only</label>
        </div>
      </aside>

      <div className="catalogue-results">
        <div className="results-toolbar">
          <p role="status">Showing <strong>{number.format(Math.min(visible, results.length))}</strong> of <strong>{number.format(results.length)}</strong> products</p>
          {filtered && <button type="button" className="text-button" onClick={clear}>Clear filters</button>}
        </div>
        {results.length === 0
          ? <div className="empty-state"><h3>No products match</h3><p>Try a different search or category.</p><Button type="button" variant="secondary" onClick={clear}>Clear filters</Button></div>
          : <div className="product-grid">{results.slice(0, visible).map(product => <ProductCard key={product.id} product={product} />)}</div>}
        {visible < results.length && <div className="show-more"><Button type="button" variant="secondary" onClick={() => setVisible(visible + pageSize)}>Show more</Button></div>}
      </div>
    </div>
  </>
}

export default function Home() {
  const user = useSession()
  const state = useResource(catalogue)

  return (
    <>
      <section className="hero">
        <div className="shell hero__grid catalogue-hero">
          <div className="hero__copy hero-copy"><HeroCopy user={user} /></div>
          <div className="hero-card hero-feature" role="group" aria-label="Featured product">
            <div className="feature-label">NEW IN<span aria-hidden="true">✦</span></div>
            {state.data
              ? <FeaturedProduct products={state.data.products} />
              : <div className="feature-cover"><ProductVisual product={{ title: 'Your Story', category: 'Welcome', accent: 'violet' }} /></div>}
          </div>
        </div>
      </section>
      <section id="collection" className="section shell" aria-labelledby="products-heading">
        <div className="collection-heading">
          <div>
            <p className="eyebrow">Explore the collection</p>
            <h2 id="products-heading">Guild shelves</h2>
          </div>
          <p className="collection-count">All prices in AUD</p>
        </div>
        <ResourceStatus state={state} resource={catalogue} label="the catalogue">
          {state.data && <Collection data={state.data} />}
        </ResourceStatus>
      </section>
    </>
  )
}
