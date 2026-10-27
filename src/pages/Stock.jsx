import { catalogue } from '../data/catalogue.js'
import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../store/authContext.js'
import { useCart } from '../store/cartContext.js'
import { courseRequest } from '../services/course-api.js'

/** Show stock controls only after the shared session is restored and identifies an admin.
 * The API independently checks permission on every request; this route guard only controls UI.
 * Editing an existing source listing changes quantity, while zero stock preserves order history. */
export default function Stock() {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <p className="shell section" role="status">
        Checking administrator session...
      </p>
    )
  if (!user) return <Navigate to="/admin/login" replace />
  if (user.role !== 'admin')
    return (
      <section className="shell section">
        <h1>Administrator access required</h1>
        <p>
          Stock can only be edited with an administrator account. Sign out before switching
          accounts.
        </p>
        <Link to="/products">Continue shopping</Link>
      </section>
    )
  return <StockEditor />
}

function StockEditor() {
  const { reloadProducts } = useCart()
  const [listings, setListings] = useState([])
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [failure, setFailure] = useState('')
  const [notice, setNotice] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  // Keep the displayed database row separate from the editable draft. Its original quantity
  // accompanies Save so the server can reject an intervening purchase or another admin's edit.
  const [selected, setSelected] = useState(null)
  const [quantity, setQuantity] = useState('')
  const [busy, setBusy] = useState(false)
  const submitting = useRef(false)
  const quantityInput = useRef(null)
  useEffect(() => {
    if (selected) quantityInput.current?.focus()
  }, [selected])
  useEffect(() => {
    const controller = new AbortController()
    // Cancel an old load when Reload starts another one or the admin leaves this page.
    courseRequest('/api/admin/stock', {
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
    })
      .then(({ listings }) => {
        if (!controller.signal.aborted) setListings(listings)
      })
      .catch((error) => {
        if (!controller.signal.aborted) setFailure(error.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [revision])
  function reload() {
    setSelected(null)
    setFailure('')
    setLoading(true)
    setRevision((value) => value + 1)
  }
  const next = Number(quantity)
  // Validate the text too: Number('') is zero, but an empty field is not an intentional stock edit.
  const valid = /^\d+$/.test(quantity) && Number.isInteger(next) && next <= 2147483647
  async function save(event) {
    event.preventDefault()
    if (!valid || submitting.current || next === selected.quantity) return
    submitting.current = true
    setBusy(true)
    setFailure('')
    setNotice('')
    try {
      const { listing } = await courseRequest('/api/admin/stock/' + selected.itemId, {
        method: 'PATCH',
        headers: { 'X-Stock-Request': '1' },
        body: { quantity: next, expectedQuantity: selected.quantity },
        signal: AbortSignal.timeout(15000),
      })
      setListings((rows) =>
        rows.map((row) =>
          row.itemId === listing.itemId ? { ...row, quantity: listing.quantity } : row,
        ),
      )
      setNotice(
        `${selected.title} — ${selected.sourceName}: stock updated from ${selected.quantity} to ${listing.quantity}.`,
      )
      setSelected(null)
      // Refresh this tab's catalogue after a confirmed write. Other shoppers recheck on their
      // next catalogue/cart request; saving stock does not reserve items or alter their carts.
      catalogue.reset()
      void reloadProducts()
    } catch (error) {
      // A timeout can follow a committed update. Require a fresh read before another write.
      setSelected(null)
      setFailure(error.message + ' Reload stock before making another change.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  const matches = listings.filter((row) =>
    `${row.title} ${row.sourceName} ${row.itemId}`
      .toLowerCase()
      .includes(query.trim().toLowerCase()),
  )
  return (
    <section className="shell section stock-page">
      <p className="eyebrow">Administrator mode</p>
      <h1>Manage stock</h1>
      <p>
        Choose a product and source, review the new quantity, then save. Set stock to zero to make a
        listing unavailable.
      </p>
      {notice && <p role="status">{notice}</p>}
      {failure && (
        <p role="alert" className="field-error">
          {failure}
        </p>
      )}
      <button className="button button--outline" onClick={reload} disabled={busy || loading}>
        Reload stock
      </button>
      {loading ? (
        <p role="status">Loading current stock...</p>
      ) : (
        <>
          <label className="field">
            Find product, source or listing ID
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value)
                setPage(0)
              }}
            />
          </label>
          {selected && (
            <form className="info-panel" onSubmit={save} aria-busy={busy}>
              <h2>{selected.title}</h2>
              <p>
                {selected.sourceName} · Listing {selected.itemId} · Current stock:{' '}
                {selected.quantity}
              </p>
              <label className="field">
                New stock quantity
                <input
                  type="number"
                  ref={quantityInput}
                  min="0"
                  max="2147483647"
                  step="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  required
                  disabled={busy}
                />
              </label>
              <div className="stock-actions">
                <button
                  type="button"
                  className="button button--outline"
                  disabled={busy || !valid || next === 0}
                  onClick={() => setQuantity(String(next - 1))}
                >
                  Remove 1
                </button>
                <button
                  type="button"
                  className="button button--outline"
                  disabled={busy || !valid || next === 2147483647}
                  onClick={() => setQuantity(String(next + 1))}
                >
                  Add 1
                </button>
                <button
                  type="button"
                  className="text-button"
                  disabled={busy}
                  onClick={() => setQuantity('0')}
                >
                  Set out of stock
                </button>
              </div>
              <p>
                {valid
                  ? `After saving: ${next} units${next === 0 ? ' (Out of stock)' : ''}.`
                  : 'Enter a whole number from 0 to 2147483647.'}
              </p>
              <div className="stock-actions">
                <button
                  className="button button--dark"
                  disabled={busy || !valid || next === selected.quantity}
                >
                  {busy ? 'Saving...' : 'Save stock'}
                </button>
                <button
                  className="text-button"
                  type="button"
                  disabled={busy}
                  onClick={() => setSelected(null)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <ul className="stock-list">
            {matches.slice(page * 20, (page + 1) * 20).map((row) => (
              <li key={row.itemId}>
                <div>
                  <strong>{row.title}</strong>
                  <p>
                    {row.sourceName} · Listing {row.itemId} · ${Number(row.price).toFixed(2)}
                  </p>
                  <p>{row.quantity === 0 ? 'Out of stock' : `${row.quantity} in stock`}</p>
                </div>
                <button
                  className="button button--outline"
                  disabled={busy || !!failure}
                  onClick={() => {
                    setSelected(row)
                    setQuantity(String(row.quantity))
                    setNotice('')
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                  aria-label={`Edit stock for ${row.title}, ${row.sourceName}, listing ${row.itemId}`}
                >
                  Edit stock
                </button>
              </li>
            ))}
          </ul>
          {matches.length > 20 && (
            <nav className="stock-actions" aria-label="Stock pages">
              <button
                type="button"
                className="button button--outline"
                disabled={page === 0}
                onClick={() => setPage((value) => value - 1)}
              >
                Previous
              </button>
              <span role="status">
                Page {page + 1} of {Math.ceil(matches.length / 20)}
              </span>
              <button
                type="button"
                className="button button--outline"
                disabled={(page + 1) * 20 >= matches.length}
                onClick={() => setPage((value) => value + 1)}
              >
                Next
              </button>
            </nav>
          )}
          {!matches.length && <p>No matching listings.</p>}
        </>
      )}
    </section>
  )
}
