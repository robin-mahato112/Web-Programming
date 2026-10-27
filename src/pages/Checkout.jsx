import { deliveryDetails } from '../data/customerAccount.js'
import { getSessionUser } from '../data/session.js'
import CheckoutSummary from '../components/CheckoutSummary.jsx'
import Recommendations from '../components/Recommendations.jsx'
import DeliveryForm from '../components/DeliveryForm.jsx'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { catalogueQuery } from '../lib/search.js'
import { readDelivery, saveDelivery } from '../lib/delivery-draft.js'
import { useCart } from '../store/cartContext.js'
import {
  checkoutRequest,
  readAttempt,
  saveAttempt as persistAttempt,
} from '../services/checkout.js'

import DemoCardForm from '../components/DemoCardForm.jsx'
import { useAuth } from '../store/authContext.js'

/** Review a server-owned quote, then simulate payment. A lost response is recovered by token,
 * never by blindly submitting another order. Only a signed demo payment reference is retained. */
export default function Checkout() {
  const { items, products, subtotal, loading, error, reloadProducts, completeCheckout } = useCart()
  const { user } = useAuth()
  const { attemptId } = useParams()
  const navigate = useNavigate()
  const saveAttempt = useCallback((value) => persistAttempt(value, user.id), [user.id])
  const search = catalogueQuery(useLocation().search)
  const [attempt, setAttempt] = useState(() => {
    const saved = readAttempt(user.id)
    if (attemptId) return { ...(saved?.token === attemptId ? saved : {}), token: attemptId }
    // A completed receipt belongs to its confirmation URL, not the next purchase.
    // Keep unresolved submissions so returning to checkout cannot accidentally pay twice.
    return saved?.applied === true ? null : saved
  })
  // A new checkout progresses from delivery to a server quote, payment reference and review.
  // A recovered attempt instead reads its saved result; neither branch automatically presses Pay.
  const [quote, setQuote] = useState(null)
  const [result, setResult] = useState(null)
  const [customer, setCustomer] = useState(() => ({
    state: 'NSW',
    name: user.name,
    ...readDelivery(user.id),
    email: user.email,
  }))
  const [deliveryNotice, setDeliveryNotice] = useState(
    'Delivery details are remembered on this browser. You can edit them before paying.',
  )
  function changeCustomer(value) {
    deliveryEdited.current = true
    setCustomer(value)
    setDeliveryNotice(
      saveDelivery(value, user.id)
        ? 'Delivery details saved on this browser.'
        : 'Your browser could not save these details. You can still check out.',
    )
  }
  function forgetDelivery() {
    deliveryEdited.current = true
    if (!saveDelivery(null, user.id)) {
      setDeliveryNotice(
        'Your browser could not remove the saved details. Check its storage settings.',
      )
      return
    }
    setCustomer({ state: 'NSW', name: user.name, email: user.email })
    setDeliveryNotice(
      'Browser delivery draft cleared. Your saved account address will return on refresh.',
    )
  }
  const deliveryEdited = useRef(false)
  useEffect(() => {
    let active = true
    // The account profile is the current saved address; never overwrite typing with a late read.
    deliveryDetails.load().then(() => {
      const details = deliveryDetails.getState().data?.details
      if (
        !active ||
        deliveryEdited.current ||
        Object.keys(readDelivery(user.id)).length ||
        getSessionUser()?.userId !== user.userId ||
        !details
      )
        return
      setCustomer({
        name: user.name,
        email: user.email,
        phone: details.phoneNumber,
        street: details.streetAddress,
        suburb: details.suburb,
        state: details.state,
        postcode: details.postcode,
      })
    })
    return () => {
      active = false
    }
  }, [user.id, user.userId, user.name, user.email])
  const [payment, setPayment] = useState(null)
  const heading = useRef(null)
  const [busy, setBusy] = useState(Boolean(attempt))
  const [message, setMessage] = useState('')
  const lock = useRef(false)
  const applied = useRef(attempt?.applied || false)
  const recoveryToken = attempt?.token

  const checkResult = useCallback(() => {
    // Recovery is a read request, including after refresh. An interrupted response is not proof
    // that payment failed, so this path never creates a new attempt or resubmits automatically.
    if (!recoveryToken || lock.current) return
    lock.current = true
    return checkoutRequest(recoveryToken)
      .then((value) => {
        setResult(value)
        setMessage('')
      })
      .catch((failure) => {
        setMessage(
          failure instanceof TypeError || failure.name === 'TimeoutError'
            ? 'Cannot check the order yet. Reconnect and check the result before starting another checkout.'
            : failure.message,
        )
      })
      .finally(() => {
        lock.current = false
        setBusy(false)
      })
  }, [recoveryToken])

  useEffect(() => {
    if (recoveryToken) void checkResult()
  }, [recoveryToken, checkResult])
  useEffect(() => {
    if (
      result?.status === 'approved' &&
      !loading &&
      !error &&
      !applied.current &&
      saveAttempt({ ...attempt, applied: true }) &&
      completeCheckout(result)
    ) {
      applied.current = true
    }
  }, [result, loading, error, completeCheckout, recoveryToken, saveAttempt, attempt, user.id])

  useEffect(() => {
    if (quote || result) heading.current?.focus()
  }, [quote, payment, result])

  async function prepare(event) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setMessage('')
    try {
      // Send listing IDs and quantities without browser prices. Cart totals are estimates, so the server
      // must rebuild the quote from current SQL records before the customer reviews it.
      setQuote(
        await checkoutRequest('prepare', {
          customer,
          items: items.map(({ itemId, quantity }) => ({ itemId, quantity })),
        }),
      )
    } catch (failure) {
      setMessage(
        failure instanceof TypeError
          ? 'Checkout is unavailable. Please try again.'
          : failure.message,
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  async function confirm() {
    if (lock.current || !quote || !payment) return
    // Persist before sending. Refuse submission if refresh could otherwise lose the recovery token.
    const payload = {
      token: quote.token,
      items: quote.reviewedItems,
      customer,
      paymentToken: payment.paymentToken,
    }
    if (!saveAttempt({ token: quote.token, payload, applied: false })) {
      setMessage('Enable session storage in your browser before placing your order.')
      return
    }
    lock.current = true
    setAttempt({ token: quote.token, payload, applied: false })
    setBusy(true)
    setMessage('')
    try {
      setResult(await checkoutRequest('confirm', payload))
    } catch (failure) {
      if (failure.status === 400) setResult({ status: 'failed', message: failure.message })
      setMessage(
        failure instanceof TypeError || failure.name === 'TimeoutError'
          ? 'The response was interrupted. Check the result before trying another payment.'
          : failure.message,
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }

  function startAgain(destination = '/checkout' + search) {
    // Clear durable recovery state before leaving this attempt. Otherwise returning from the
    // catalogue would reopen the old confirmation instead of starting a fresh checkout.
    if (!saveAttempt(null)) {
      setMessage(
        'Your browser could not clear the previous attempt. Enable session storage and try again.',
      )
      return
    }
    navigate(destination, { replace: true })
    setAttempt(null)
    setQuote(null)
    setPayment(null)
    setResult(null)
    setMessage('')
    applied.current = false
  }

  useEffect(() => {
    if (result?.status === 'approved' && recoveryToken && !attemptId)
      navigate('/checkout/confirmation/' + recoveryToken + search, { replace: true })
  }, [result, recoveryToken, attemptId, navigate, search])

  const approved = result?.status === 'approved'
  const retryAllowed = ['declined', 'timed-out', 'changed', 'ready', 'failed'].includes(
    result?.status,
  )
  return (
    <section className="section shell checkout" aria-busy={busy}>
      <h1 ref={heading} tabIndex={-1}>
        {approved ? 'Order confirmed' : 'Checkout'}
      </h1>
      {!attempt && (
        <ol className="checkout-steps" aria-label="Checkout progress">
          {['Delivery', 'Payment', 'Review and pay'].map((label, index) => {
            const step = !quote ? 0 : !payment ? 1 : 2
            return (
              <li
                key={label}
                aria-current={index === step ? 'step' : undefined}
                className={index < step ? 'is-complete' : ''}
              >
                <span aria-hidden="true">{index < step ? '\u2713' : index + 1}</span>
                {label}
              </li>
            )
          })}
        </ol>
      )}
      <p className="lead">
        {approved
          ? 'Thank you for shopping with Entertainment Guild.'
          : 'Complete your details and review your selections.'}
      </p>
      {message && (
        <p className="field-error" role="alert">
          {message}
        </p>
      )}
      {busy && (
        <p role="status">
          {attempt ? 'Checking your payment…' : 'Checking current prices and stock…'}
        </p>
      )}
      <div className={!attempt && items.length ? 'checkout-layout' : undefined}>
        <div className="checkout-main">
          {approved ? (
            <div className="info-panel confirmation-panel" role="status">
              <span className="confirmation-mark" aria-hidden="true">
                &#10003;
              </span>
              <h2>Order #{result.orderId}</h2>
              <p>Order total: ${result.total.toFixed(2)} AUD.</p>
              <p>
                {result.payment && `${result.payment.brand} ending in ${result.payment.last4}. `}
                Keep this order number for your records.
              </p>
              <button
                className="button button--dark"
                type="button"
                onClick={() => startAgain('/products' + search)}
              >
                Back to the collection
              </button>
            </div>
          ) : attempt ? (
            <div className="info-panel">
              <p role="status">
                {result?.message ||
                  (result?.status === 'ready'
                    ? 'This attempt was not submitted. You can review checkout again.'
                    : 'Your submission is being checked. Keep this page open or return to check its result.')}
              </p>
              <p>
                Payment reference: <span className="attempt-reference">{attempt.token}</span>
              </p>
              <button
                type="button"
                className="button button--dark"
                disabled={busy}
                onClick={() => {
                  setBusy(true)
                  void checkResult()
                }}
              >
                Check result
              </button>
              {(retryAllowed ||
                (result?.status === 'not-found' && !attempt.payload?.paymentToken)) && (
                <button
                  type="button"
                  className="button button--outline"
                  disabled={busy}
                  onClick={() => startAgain()}
                >
                  Review checkout again
                </button>
              )}
              {!busy && result?.status === 'not-found' && attempt.payload?.paymentToken && (
                <>
                  <p>
                    Retry uses the same reference and reviewed details. It cannot create a second
                    order for this attempt.
                  </p>
                  <button
                    type="button"
                    className="button button--dark"
                    onClick={async () => {
                      if (lock.current) return
                      lock.current = true
                      setBusy(true)
                      try {
                        setResult(await checkoutRequest('confirm', attempt.payload))
                        setMessage('')
                      } catch (failure) {
                        if (failure.status === 400)
                          setResult({ status: 'failed', message: failure.message })
                        setMessage(failure.message)
                      } finally {
                        lock.current = false
                        setBusy(false)
                      }
                    }}
                  >
                    Retry same submission
                  </button>
                </>
              )}
            </div>
          ) : loading ? (
            <p role="status">Loading your cart…</p>
          ) : error ? (
            <div>
              <p role="alert">{error}</p>
              <button className="button button--dark" onClick={reloadProducts}>
                Try again
              </button>
            </div>
          ) : !items.length ? (
            <p>Your cart is empty. Add an item before checking out.</p>
          ) : quote && !payment ? (
            <DemoCardForm
              token={quote.token}
              onContinue={setPayment}
              onBack={() => setQuote(null)}
            />
          ) : quote ? (
            <div className="checkout-review info-panel">
              <h2>Review your order</h2>
              <p>Check your delivery address and payment details before placing your order.</p>
              <div className="review-block">
                <h3>Deliver to</h3>
                <p>
                  <strong>{customer.name}</strong>
                  <br />
                  {customer.street}
                  <br />
                  {customer.suburb}, {customer.state} {customer.postcode}
                </p>
                <p>{customer.email}</p>
              </div>
              <div className="review-block">
                <h3>Payment method</h3>
                <p>
                  {payment.brand} ending in {payment.last4}
                  <br />
                  {payment.holder}
                </p>
              </div>
              <div className="checkout-actions">
                <button
                  className="button button--outline"
                  type="button"
                  disabled={busy}
                  onClick={() => setPayment(null)}
                >
                  Change card
                </button>
                <button
                  className="button button--dark"
                  type="button"
                  disabled={busy}
                  onClick={confirm}
                >
                  Pay ${quote.subtotal.toFixed(2)} AUD
                </button>
                <button
                  className="button button--outline"
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setQuote(null)
                    setPayment(null)
                  }}
                >
                  Edit details
                </button>
              </div>
            </div>
          ) : (
            <DeliveryForm
              customer={customer}
              setCustomer={changeCustomer}
              onForget={forgetDelivery}
              notice={deliveryNotice}
              busy={busy}
              onSubmit={prepare}
            />
          )}
        </div>
        {!attempt && items.length > 0 && !loading && !error && (
          <CheckoutSummary
            items={quote?.items || items}
            subtotal={quote?.subtotal ?? subtotal}
            search={search}
          />
        )}
      </div>
      <div className="checkout-links">
        <Link className="button button--outline" to={'/cart' + search}>
          View cart
        </Link>
        <Link className="button button--outline" to={'/products' + search}>
          Continue shopping
        </Link>
      </div>
      {approved && (
        <Recommendations
          selected={products.filter((product) =>
            result.items?.some((line) =>
              product.offers.some((offer) => offer.itemId === String(line.itemId)),
            ),
          )}
          search={search}
        />
      )}
    </section>
  )
}
