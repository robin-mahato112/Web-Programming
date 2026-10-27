import { Link, useLocation } from 'react-router-dom'
import { catalogueQuery } from '../lib/search.js'

export default function NotFound() {
  const { search } = useLocation()
  return (
    <section className="section shell">
      <p className="eyebrow">404</p>
      <h1>Page not found</h1>
      <p>This link does not lead to a page in our store.</p>
      <Link className="button button--dark" to={'/products' + catalogueQuery(search)}>
        Browse the collection
      </Link>
    </section>
  )
}
