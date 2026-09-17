import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import useCustomerAuth from '../auth/useCustomerAuth.js'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'

// Zehai's Assignment 1.2 code starts here: editable customer profile and validation.
const postcodePattern = /^\d{4}$/
const emailPattern = /^\S+@\S+\.\S+$/

function profileValues(customer) {
  return {
    name: customer.name,
    email: customer.email,
    phoneNumber: customer.phoneNumber,
    streetAddress: customer.streetAddress,
    suburb: customer.suburb,
    state: customer.state,
    postcode: customer.postcode,
  }
}

function initials(name) {
  return name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
}

export default function CustomerProfile() {
  const { customer, emailExists, saveProfile } = useCustomerAuth()
  const location = useLocation()
  const [values, setValues] = useState(() => profileValues(customer))
  const [errors, setErrors] = useState({})
  const [saved, setSaved] = useState(false)

  const update = event => {
    setValues(previous => ({ ...previous, [event.target.name]: event.target.value }))
    setErrors(previous => ({ ...previous, [event.target.name]: undefined }))
    setSaved(false)
  }

  const submit = event => {
    event.preventDefault()
    const nextErrors = {}
    if (!values.name.trim()) nextErrors.name = 'Enter your full name.'
    if (!values.email.trim()) nextErrors.email = 'Enter your email address.'
    else if (!emailPattern.test(values.email)) nextErrors.email = 'Enter a valid email address.'
    else if (emailExists(values.email, customer.userId)) nextErrors.email = 'This email is already registered.'
    if (!values.phoneNumber.trim()) nextErrors.phoneNumber = 'Enter your phone number.'
    if (!values.streetAddress.trim()) nextErrors.streetAddress = 'Enter your street address.'
    if (!values.suburb.trim()) nextErrors.suburb = 'Enter your suburb.'
    if (!values.state.trim()) nextErrors.state = 'Enter your state.'
    if (!postcodePattern.test(values.postcode.trim())) nextErrors.postcode = 'Postcode must be 4 digits.'
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSaved(saveProfile(values))
  }

  const reset = () => {
    setValues(profileValues(customer))
    setErrors({})
    setSaved(false)
  }

  return (
    <section className="section shell customer-profile-page">
      <p className="eyebrow">Member 2 customer accounts</p>
      <h1>Customer profile</h1>
      <p className="lead compact">Review and update the contact details connected to your customer account.</p>

      {location.state?.accountCreated && <div className="notice" role="status">Your local prototype account has been created and signed in.</div>}

      <div className="profile-layout">
        <aside className="profile-summary panel">
          <div className="avatar" aria-hidden="true">{initials(customer.name)}</div>
          <h2>{customer.name}</h2>
          <p>{customer.email}</p>
          <dl>
            <dt>Patrons.UserID</dt>
            <dd>{customer.userId}</dd>
            <dt>Profile source</dt>
            <dd>Local browser storage</dd>
            <dt>Development status</dt>
            <dd>Backend integration in progress</dd>
          </dl>
        </aside>

        <form className="panel profile-form" noValidate onSubmit={submit}>
          <h2>Editable customer details</h2>
          <p className="status-note">Changes are saved in this browser for prototype testing.</p>
          {saved && <div className="notice" role="status">Profile changes saved.</div>}
          <div className="form-grid">
            <Input id="profile-name" name="name" label="Full name" autoComplete="name" value={values.name} onChange={update} error={errors.name} />
            <Input id="profile-email" name="email" type="email" label="Email address" autoComplete="email" value={values.email} onChange={update} error={errors.email} />
            <Input id="profile-phone" name="phoneNumber" type="tel" label="Phone number" autoComplete="tel" value={values.phoneNumber} onChange={update} error={errors.phoneNumber} />
            <Input id="profile-street" name="streetAddress" label="Street address" autoComplete="street-address" value={values.streetAddress} onChange={update} error={errors.streetAddress} />
            <Input id="profile-suburb" name="suburb" label="Suburb" autoComplete="address-level2" value={values.suburb} onChange={update} error={errors.suburb} />
            <Input id="profile-state" name="state" label="State" autoComplete="address-level1" value={values.state} onChange={update} error={errors.state} />
            <Input id="profile-postcode" name="postcode" inputMode="numeric" label="Postcode" autoComplete="postal-code" value={values.postcode} onChange={update} error={errors.postcode} />
          </div>
          <div className="actions">
            <Button type="submit">Save profile</Button>
            <Button variant="secondary" onClick={reset}>Reset changes</Button>
            <Button variant="secondary" disabled>View order history</Button>
          </div>
        </form>
      </div>
    </section>
  )
}
// Zehai's Assignment 1.2 code stops here.
