import { useRef, useState } from 'react'
import { checkoutRequest } from '../services/checkout.js'

/** Card fields live only in this form. Continuing replaces them with a masked payment reference. */
export default function DemoCardForm({ token, onContinue, onBack }) {
  const [card, setCard] = useState({ holder: '', number: '', expiry: '', cvc: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const lock = useRef(false)
  async function submit(event) {
    event.preventDefault()
    if (lock.current) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      const method = await checkoutRequest('payment-method', { token, card })
      setCard({ holder: '', number: '', expiry: '', cvc: '' })
      onContinue(method)
    } catch (failure) {
      setError(
        failure instanceof TypeError
          ? 'Cannot validate your card. Please try again.'
          : failure.message,
      )
    } finally {
      lock.current = false
      setBusy(false)
    }
  }
  return (
    <form className="checkout-form" onSubmit={submit} aria-busy={busy}>
      <h2>Credit card</h2>
      <p>Enter your card details, then review your order before paying.</p>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <fieldset disabled={busy}>
        <legend className="sr-only">Card details</legend>
        {[
          ['holder', 'Cardholder name', 'text', 100],
          ['number', 'Card number', 'text', 19],
          ['expiry', 'Expiry (MM/YY)', 'text', 7],
          ['cvc', 'Security code (CVC)', 'password', 3],
        ].map(([key, label, type, maxLength]) => (
          <label
            className={'field' + (['holder', 'number'].includes(key) ? ' field--full' : '')}
            key={key}
          >
            {label}
            <input
              name={'payment-' + key}
              type={type}
              autoComplete="off"
              inputMode={key === 'number' || key === 'cvc' ? 'numeric' : 'text'}
              maxLength={maxLength}
              required
              value={card[key]}
              onChange={(event) => {
                setCard({ ...card, [key]: event.target.value })
                setError('')
              }}
            />
          </label>
        ))}
      </fieldset>
      {busy && <p role="status">Checking card details…</p>}
      <div className="checkout-actions">
        <button className="button button--dark" disabled={busy} type="submit">
          Review order
        </button>
        <button className="button button--outline" disabled={busy} type="button" onClick={onBack}>
          Edit delivery details
        </button>
      </div>
    </form>
  )
}
