import Input from './Input.jsx'
import { australianStates } from '../data/customerAccount.js'

function SelectField({ id, label, error, options, placeholder, ...props }) {
  const helpId = `${id}-help`
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? helpId : undefined}
        {...props}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {error && (
        <small id={helpId} className="field__error">
          {error}
        </small>
      )}
    </div>
  )
}

// Phone and address fields shared by registration and the customer account page (stored in the TO table).
export default function DeliveryFields({ values, errors, onChange }) {
  return (
    <>
      <Input
        id="phoneNumber"
        name="phoneNumber"
        label="Phone number"
        type="tel"
        autoComplete="tel"
        value={values.phoneNumber}
        onChange={onChange}
        error={errors.phoneNumber}
      />
      <Input
        id="streetAddress"
        name="streetAddress"
        label="Street address"
        autoComplete="street-address"
        value={values.streetAddress}
        onChange={onChange}
        error={errors.streetAddress}
      />
      <Input
        id="suburb"
        name="suburb"
        label="Suburb"
        autoComplete="address-level2"
        value={values.suburb}
        onChange={onChange}
        error={errors.suburb}
      />
      <SelectField
        id="state"
        name="state"
        label="State or territory"
        autoComplete="address-level1"
        placeholder="Choose…"
        options={australianStates}
        value={values.state}
        onChange={onChange}
        error={errors.state}
      />
      <Input
        id="postcode"
        name="postcode"
        label="Postcode"
        inputMode="numeric"
        autoComplete="postal-code"
        maxLength={4}
        value={values.postcode}
        onChange={onChange}
        error={errors.postcode}
      />
    </>
  )
}
