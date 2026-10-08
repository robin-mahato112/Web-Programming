import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useSession } from '../auth/SessionContext.js'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import { login, registerAccount } from '../services/customerApi.js'

// Zehai's customer accounts section starts here: registration and sign-in forms.
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

function validate(values, register) {
  const errors = {}

  if (register && !values.name.trim()) errors.name = 'Enter your full name.'
  if (!values.email.trim()) errors.email = 'Enter your email address.'
  else if (!emailPattern.test(values.email.trim())) errors.email = 'Enter a valid email address.'

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
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const { state } = useLocation()
  const { acceptSession } = useSession()
  const update = event => {
    const { name, value } = event.target
    setValues({ ...values, [name]: value })
    setErrors(current => ({ ...current, [name]: undefined, credentials: undefined, ...(name === 'password' ? { confirm: undefined } : {}) }))
  }
  const submit = async event => {
    event.preventDefault()
    if (busy) return
    const next = validate(values, register)
    setErrors(next)
    if (Object.keys(next).length) {
      document.getElementById(Object.keys(next)[0])?.focus()
      return
    }
    setBusy(true)
    try {
      const result = register ? await registerAccount(values) : { user: await login(values.email, values.password) }
      acceptSession(result.user)
      navigate('/profile', { replace: true, state: { message: result.warning || '' } })
    } catch (error) {
      setErrors({ credentials: error.status === 401 ? 'Email or password is incorrect.' : error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className={register ? 'auth-card auth-card--wide' : 'auth-card'} noValidate onSubmit={submit}>
      <p className="eyebrow">Customer accounts</p>
      <h1>{register ? 'Create account' : 'Welcome back'}</h1>
      {!register && state?.message && <p className="notice" role="status">{state.message}</p>}

      {errors.credentials && <div className="notice notice--error" role="alert">{errors.credentials}</div>}

      <fieldset disabled={busy} className="account-fields">
      <div className={register ? 'form-grid' : undefined}>
        {register && <Input id="name" name="name" label="Full name" autoComplete="name" value={values.name} onChange={update} error={errors.name} />}
        <Input id="email" name="email" label="Email address" type="email" autoComplete="email" value={values.email} onChange={update} error={errors.email} />
        <PasswordInput id="password" name="password" label="Password" autoComplete={register ? 'new-password' : 'current-password'} value={values.password} onChange={update} error={errors.password} showStrength={register} />
        {register && <PasswordInput id="confirm" name="confirm" label="Confirm password" autoComplete="new-password" value={values.confirm} onChange={update} error={errors.confirm} />}
        {register && <Input id="phoneNumber" name="phoneNumber" label="Phone number" type="tel" autoComplete="tel" value={values.phoneNumber} onChange={update} error={errors.phoneNumber} />}
        {register && <Input id="streetAddress" name="streetAddress" label="Street address" autoComplete="street-address" value={values.streetAddress} onChange={update} error={errors.streetAddress} />}
        {register && <Input id="suburb" name="suburb" label="Suburb" autoComplete="address-level2" value={values.suburb} onChange={update} error={errors.suburb} />}
        {register && <Input id="state" name="state" label="State" autoComplete="address-level1" value={values.state} onChange={update} error={errors.state} />}
        {register && <Input id="postcode" name="postcode" label="Postcode" inputMode="numeric" autoComplete="postal-code" value={values.postcode} onChange={update} error={errors.postcode} />}
      </div>
      </fieldset>

      <Button type="submit" disabled={busy}>{busy ? 'Please wait...' : register ? 'Create account' : 'Sign in'}</Button>
      <p>{register ? 'Already a member?' : 'New to the guild?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
    </form>
  )
}

export function Login() { return <section className="auth-page"><AuthForm /></section> }
export function Registration() { return <section className="auth-page"><AuthForm register /></section> }
// Zehai's customer accounts section stops here.
