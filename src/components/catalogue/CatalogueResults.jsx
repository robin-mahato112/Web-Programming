import { useEffect, useState } from 'react'
import ProductCard from '../ShopProductCard.jsx'
import { filterProducts } from '../../lib/products.js'
import { fetchCatalogue } from '../../services/catalogue.js'
import { useCart } from '../../store/cartContext.js'

/** Load keyword matches through the selected catalogue service, then apply the remaining filters.
 * Keyword searching runs in SQL; category, price, availability and sorting refine those results. */
export default function CatalogueResults({ filters, total, returnQuery, onReset }) {
  const { rememberProducts } = useCart()
  const [result, setResult] = useState({ products: [], loading: true, error: '' })
  const [attempt, setAttempt] = useState(0)
  const { query } = filters
  useEffect(() => {
    // Abort the previous search when its component is replaced or retried. A slower old response
    // must not replace newer results or overwrite their loading/error state.
    const controller = new AbortController()
    fetchCatalogue(AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]), query)
      .then((products) => {
        if (controller.signal.aborted) return
        rememberProducts(products, !query)
        setResult({ products, loading: false, error: '' })
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          setResult({
            products: [],
            loading: false,
            error:
              error.name === 'TimeoutError'
                ? 'The search timed out. Please try again.'
                : error instanceof TypeError || error instanceof SyntaxError
                  ? 'The search service is unavailable. Please try again.'
                  : error.message,
          })
      })
    return () => controller.abort()
  }, [query, attempt, rememberProducts])

  // Keep positions per result URL, including reloads. Storage failures only lose scroll restoration.
  useEffect(() => {
    if (result.loading || result.error) return
    const key = 'entertainment-guild.scroll:' + returnQuery
    let frame
    try {
      const saved = sessionStorage.getItem(key)
      if (saved !== null && Number.isFinite(Number(saved)))
        frame = requestAnimationFrame(() =>
          window.scrollTo({ top: Number(saved), behavior: 'instant' }),
        )
    } catch {
      /* Browser storage can be disabled; the catalogue still works. */
    }
    const save = () => {
      try {
        sessionStorage.setItem(key, String(window.scrollY))
      } catch {
        /* Optional position only. */
      }
    }
    window.addEventListener('scroll', save, { passive: true })
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', save)
    }
  }, [returnQuery, result.loading, result.error])

  const results = filterProducts(result.products, { ...filters, query: '' })
  return (
    <div className="catalogue-results" aria-busy={result.loading}>
      <div className="results-toolbar">
        <p role="status">
          {result.loading ? (
            'Searching products…'
          ) : result.error ? (
            'Search unavailable'
          ) : (
            <>
              Showing <strong>{results.length}</strong> of {total} finds
            </>
          )}
        </p>
        <span>All prices in AUD</span>
      </div>
      {result.error ? (
        <div className="empty-state">
          <p role="alert">{result.error}</p>
          <button
            className="button button--dark"
            type="button"
            onClick={() => {
              setResult({ products: [], loading: true, error: '' })
              setAttempt((value) => value + 1)
            }}
          >
            Try search again
          </button>
        </div>
      ) : (
        !result.loading &&
        (results.length ? (
          <div className="product-grid">
            {results.map((product) => (
              <ProductCard key={product.id} product={product} returnQuery={returnQuery} />
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <h2>No finds just yet.</h2>
            <p>Try a different search or give your filters a little room.</p>
            <button className="button button--dark" onClick={onReset} type="button">
              Reset filters
            </button>
          </div>
        ))
      )}
    </div>
  )
}
