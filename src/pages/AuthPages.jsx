import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import useCustomerAuth from '../auth/useCustomerAuth.js'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'

const initialValues = {
  name: '',
  email: '',
  password: '',
  confirm: '',
  phoneNumber: '',
  streetAddress: '',
  suburb: '',
  state: '',
  postcode: '',
}

const emailPattern = /^\S+@\S+\.\S+$/
const postcodePattern = /^\d{4}$/
const strongPasswordPattern = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/

function validate(values, register, emailExists) {
  const errors = {}

  if (register && !values.name.trim()) errors.name = 'Enter your full name.'
  if (!values.email.trim()) errors.email = 'Enter your email address.'
  else if (!emailPattern.test(values.email)) errors.email = 'Enter a valid email address.'
  else if (register && emailExists(values.email)) errors.email = 'This email is already registered.'

  if (!values.password) errors.password = 'Enter your password.'
  else if (register && !strongPasswordPattern.test(values.password)) errors.password = 'Use 8+ characters with letters and numbers.'
  if (register && values.confirm !== values.password) errors.confirm = 'Passwords must match.'

  if (register && !values.phoneNumber.trim()) errors.phoneNumber = 'Enter your phone number.'
  if (register && !values.streetAddress.trim()) errors.streetAddress = 'Enter your street address.'
  if (register && !values.suburb.trim()) errors.suburb = 'Enter your suburb.'
  if (register && !values.state.trim()) errors.state = 'Enter your state.'
  if (register && !postcodePattern.test(values.postcode.trim())) errors.postcode = 'Postcode must be 4 digits.'

  return errors
}

function AuthForm({ register = false }) {
  // Zehai's Assignment 1.2 code starts here: connect validated forms to account and session actions.
  const { customer, emailExists, signIn, signUp } = useCustomerAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [authenticatedAtEntry] = useState(() => Boolean(customer))
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const update = event => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setErrors(previous => ({ ...previous, [event.target.name]: undefined, credentials: undefined }))
  }
  const submit = event => {
    event.preventDefault()
    const next = validate(values, register, emailExists)
    setErrors(next)
    if (Object.keys(next).length > 0) return

    if (register) {
      const { confirm: _confirm, ...customerDetails } = values
      if (!signUp(customerDetails)) {
        setErrors({ email: 'This email is already registered.' })
        return
      }
      navigate('/profile', { replace: true, state: { accountCreated: true } })
      return
    }

    if (!signIn(values.email, values.password)) {
      setErrors({ credentials: 'Email or password is incorrect.' })
      return
    }
    navigate(location.state?.from || '/profile', { replace: true })
  }

  if (authenticatedAtEntry) return <Navigate to="/profile" replace />
  // Zehai's Assignment 1.2 code stops here.

  return (
    <form className={register ? 'auth-card auth-card--wide' : 'auth-card'} noValidate onSubmit={submit}>
      <p className="eyebrow">Member 2 customer accounts</p>
      <h1>{register ? 'Create account' : 'Welcome back'}</h1>
      <p>{register ? 'Create your customer account and delivery profile.' : 'Sign in to manage your customer profile.'}</p>
      <div className="prototype-banner">Progress SCRUM 1 · Local browser prototype · Backend integration in progress</div>

      {errors.credentials && <div className="notice notice--error" role="alert">{errors.credentials}</div>}

      <div className={register ? 'form-grid' : undefined}>
        {register && <Input id="name" name="name" label="Full name" autoComplete="name" value={values.name} onChange={update} error={errors.name} />}
        <Input id="email" name="email" label="Email address" type="email" autoComplete="email" value={values.email} onChange={update} error={errors.email} />
        <Input id="password" name="password" label="Password" type="password" autoComplete={register ? 'new-password' : 'current-password'} value={values.password} onChange={update} error={errors.password} hint={register ? 'Use 8+ characters with letters and numbers.' : undefined} />
        {register && <Input id="confirm" name="confirm" label="Confirm password" type="password" autoComplete="new-password" value={values.confirm} onChange={update} error={errors.confirm} />}
        {register && <Input id="phoneNumber" name="phoneNumber" label="Phone number" type="tel" autoComplete="tel" value={values.phoneNumber} onChange={update} error={errors.phoneNumber} />}
        {register && <Input id="streetAddress" name="streetAddress" label="Street address" autoComplete="street-address" value={values.streetAddress} onChange={update} error={errors.streetAddress} />}
        {register && <Input id="suburb" name="suburb" label="Suburb" autoComplete="address-level2" value={values.suburb} onChange={update} error={errors.suburb} />}
        {register && <Input id="state" name="state" label="State" autoComplete="address-level1" value={values.state} onChange={update} error={errors.state} />}
        {register && <Input id="postcode" name="postcode" label="Postcode" inputMode="numeric" autoComplete="postal-code" value={values.postcode} onChange={update} error={errors.postcode} />}
      </div>

      <Button type="submit">{register ? 'Create account' : 'Sign in'}</Button>
      <p>{register ? 'Already a member?' : 'New to the guild?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
    </form>
  )
}

export function Login() { return <section className="auth-page"><AuthForm /></section> }
export function Registration() { return <section className="auth-page"><AuthForm register /></section> }
