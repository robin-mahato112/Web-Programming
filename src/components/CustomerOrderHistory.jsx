import { useEffect, useRef, useState } from 'react'
import Button from './Button.jsx'
import {
  loadCustomerOrders,
  loadCustomerOrderItems,
  orderHistoryError,
} from '../data/customerOrders.js'

// AI-assisted: account-only read UI; unmounting cancels requests and clears personal history.
function OrderCard({ order, userId }) {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  async function load() {
    if (request.current && !request.current.signal.aborted && busy) return
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    try {
      const result = await loadCustomerOrderItems(order, userId, controller.signal)
      if (!controller.signal.aborted) setItems(result)
    } catch (failure) {
      if (!controller.signal.aborted) setError(orderHistoryError(failure))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  function toggle() {
    setOpen(!open)
    if (!open && !items && !busy) load()
  }
  return (
    <article className="customer-order-card" aria-labelledby={`order-${order.orderId}`}>
      <h3 id={`order-${order.orderId}`}>Order #{order.orderId}</h3>
      <p>
        <strong>Delivery address for this order</strong>
        <br />
        {order.address || 'Address not available'}
      </p>
      <Button
        variant="secondary"
        aria-expanded={open}
        aria-controls={`order-items-${order.orderId}`}
        onClick={toggle}
      >
        {open ? 'Hide' : 'View'} items for order #{order.orderId}
      </Button>
      <div id={`order-items-${order.orderId}`} hidden={!open} aria-busy={busy}>
        {busy && <p role="status">Loading order items…</p>}
        {error && (
          <div role="alert">
            <p>{error}</p>
            <Button variant="secondary" onClick={load}>
              Retry order items
            </Button>
          </div>
        )}
        {!busy &&
          !error &&
          items &&
          (items.length ? (
            <ul className="customer-order-items">
              {items.map((item, index) => (
                <li key={`${item.itemId}-${index}`}>
                  <strong>{item.name}</strong>
                  <span>
                    Item #{item.itemId} · Quantity: {item.quantity}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p>No item records are available for this order.</p>
          ))}
      </div>
    </article>
  )
}

export default function CustomerOrderHistory({ userId }) {
  const [orders, setOrders] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [generation, setGeneration] = useState(0)
  const [visibleCount, setVisibleCount] = useState(10)
  const request = useRef(null)
  useEffect(() => () => request.current?.abort(), [])
  async function load() {
    request.current?.abort()
    const controller = new AbortController()
    request.current = controller
    setBusy(true)
    setError('')
    setOrders(null)
    setVisibleCount(10)
    try {
      const result = await loadCustomerOrders(userId, controller.signal)
      if (!controller.signal.aborted) {
        setOrders(result)
        setGeneration((current) => current + 1)
      }
    } catch (failure) {
      if (!controller.signal.aborted) setError(orderHistoryError(failure))
    } finally {
      if (!controller.signal.aborted) setBusy(false)
    }
  }
  return (
    <section
      className="customer-order-history"
      aria-labelledby="order-history-heading"
      aria-busy={busy}
    >
      <h2 id="order-history-heading">Order history</h2>
      <p>View your previous orders and the delivery address recorded when each order was placed.</p>
      <Button variant="secondary" onClick={load} disabled={busy}>
        {busy
          ? 'Loading orders…'
          : error
            ? 'Retry order history'
            : orders
              ? 'Refresh order history'
              : 'View order history'}
      </Button>
      {error && (
        <p className="notice notice--error" role="alert">
          {error}
        </p>
      )}
      {orders && !orders.length && <p role="status">You have no orders yet.</p>}
      {orders && orders.length > 0 && (
        <>
          <p role="status">
            {orders.length} {orders.length === 1 ? 'order' : 'orders'} found.
          </p>
          <p className="customer-order-note">
            Order dates, payment status and original prices are not available in this history.
            Product names reflect the current catalogue.
          </p>
          <div className="customer-order-list">
            {orders.slice(0, visibleCount).map((order) => (
              <OrderCard key={`${generation}-${order.orderId}`} order={order} userId={userId} />
            ))}
          </div>
          {visibleCount < orders.length && (
            <Button variant="secondary" onClick={() => setVisibleCount((count) => count + 10)}>
              Show more orders
            </Button>
          )}
        </>
      )}
    </section>
  )
}
