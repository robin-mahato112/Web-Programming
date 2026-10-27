const fields = [
  ['name', 'Full name', 'text', 'name', 255],
  ['email', 'Email', 'email', 'email', 255],
  ['phone', 'Phone (optional)', 'tel', 'tel', 50],
  ['street', 'Street address', 'text', 'street-address', 255],
  ['suburb', 'Suburb', 'text', 'address-level2', 50],
  ['postcode', 'Postcode', 'text', 'postal-code', 4],
]

/** Shared delivery fields keep the SQL checkout and course review interface consistent. */
export default function DeliveryForm({
  customer,
  setCustomer,
  onForget,
  notice,
  busy,
  onSubmit,
  submitLabel = 'Continue to payment',
}) {
  return (
    <form className="checkout-form" onSubmit={onSubmit}>
      <h2>Customer and delivery details</h2>
      <p>Tell us where to send your order.</p>
      <fieldset disabled={busy}>
        <legend className="sr-only">Contact and address</legend>
        {fields.map(([key, label, type, autoComplete, maxLength]) => (
          <label className={'field' + (key === 'street' ? ' field--full' : '')} key={key}>
            {label}
            <input
              name={key}
              readOnly={key === 'email'}
              type={type}
              autoComplete={autoComplete}
              maxLength={maxLength}
              required={key !== 'phone'}
              value={customer[key] || ''}
              {...(key === 'postcode'
                ? { pattern: '[0-9]{4}', inputMode: 'numeric', title: 'Enter four digits' }
                : {})}
              onChange={(event) => setCustomer({ ...customer, [key]: event.target.value })}
            />
          </label>
        ))}
        <label className="field">
          State or territory
          <select
            name="state"
            value={customer.state}
            onChange={(event) => setCustomer({ ...customer, state: event.target.value })}
          >
            {['ACT', 'NSW', 'NT', 'QLD', 'SA', 'TAS', 'VIC', 'WA'].map((state) => (
              <option key={state}>{state}</option>
            ))}
          </select>
        </label>
      </fieldset>
      {notice && <p role="status">{notice}</p>}
      {onForget && (
        <button type="button" className="text-button" disabled={busy} onClick={onForget}>
          Forget saved delivery details
        </button>
      )}
      <button className="button button--dark" type="submit" disabled={busy}>
        {submitLabel}
      </button>
    </form>
  )
}
