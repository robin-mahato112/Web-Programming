import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import DeliveryFields from '../components/DeliveryFields.jsx'
import { registerCustomer } from '../data/customerAccount.js'
import { isStaff, signInCustomer, staffHome, useSession } from '../data/session.js'

const emailPattern = /^\S+@\S+\.\S+$/

// Where a signed-in visitor goes instead of seeing these forms.
const signedInHome = user => isStaff(user) ? staffHome(user) : '/account'

function LoginForm() {
  const navigate = useNavigate()
  const user = useSession()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  if (user && !pending) return <Navigate to={signedInHome(user)} replace />

  const update = event => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setError('')
  }
  const submit = async event => {
    event.preventDefault()
    const next = {}
    if (!values.email.trim()) next.email = 'Enter your email address.'
    else if (!emailPattern.test(values.email.trim())) next.email = 'Enter a valid email address.'
    if (!values.password) next.password = 'Enter your password.'
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    const result = await signInCustomer(values.email.trim(), values.password)
    if (result.error) {
      setPending(false)
      setError(result.error)
    } else navigate('/', { replace: true })
  }

  return (
    <form className="auth-card" noValidate onSubmit={submit} aria-busy={pending}>
      <p className="eyebrow">Customer account</p>
      <h1>Welcome back</h1>
      <p className="notice notice--info" role="status">Sign in with the email and password you registered with.</p>
      <p className="auth-switch"><Link to="/admin/login">Staff sign in</Link></p>

      {error && <div className="notice notice--error" role="alert">{error}</div>}

      <div>
        <Input id="email" name="email" label="Email address" type="email" autoComplete="email" value={values.email} onChange={update} error={errors.email} />
        <Input id="password" name="password" label="Password" type="password" autoComplete="current-password" value={values.password} onChange={update} error={errors.password} />
      </div>

      <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
      <p>New to the guild? <Link to="/register">Create an account</Link></p>
    </form>
  )
}

const emptyRegistration = {
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

function RegistrationForm() {
  const navigate = useNavigate()
  const user = useSession()
  const [values, setValues] = useState(emptyRegistration)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  // Registering signs the customer in part way through, so don't redirect until it has finished.
  if (user && !pending) return <Navigate to={signedInHome(user)} replace />

  const update = event => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setError('')
  }
  const submit = async event => {
    event.preventDefault()
    setPending(true)
    const result = await registerCustomer(values)
    if (result.user) {
      navigate('/account', { replace: true, state: { registered: true, detailsError: result.detailsError } })
      return
    }
    setPending(false)
    setErrors(result.errors || {})
    setError(result.error || '')
  }

  return (
    <form className="auth-card auth-card--wide" noValidate onSubmit={submit} aria-busy={pending}>
      <p className="eyebrow">Account registration</p>
      <h1>Create account</h1>
      <p className="notice notice--info" role="status">Join the guild to shop with us. We use your address for deliveries.</p>

      {error && <div className="notice notice--error" role="alert">{error}</div>}

      <div className="form-grid">
        <Input id="name" name="name" label="Full name" autoComplete="name" maxLength={100} value={values.name} onChange={update} error={errors.name} />
        <Input id="email" name="email" label="Email address" type="email" autoComplete="email" value={values.email} onChange={update} error={errors.email} />
        <Input id="password" name="password" label="Password" type="password" autoComplete="new-password" value={values.password} onChange={update} error={errors.password} hint="Use 8+ characters with letters and numbers." />
        <Input id="confirm" name="confirm" label="Confirm password" type="password" autoComplete="new-password" value={values.confirm} onChange={update} error={errors.confirm} />
        <DeliveryFields values={values} errors={errors} onChange={update} />
      </div>

      <Button type="submit" disabled={pending}>{pending ? 'Creating account…' : 'Create account'}</Button>
      <p>Already a member? <Link to="/login">Sign in</Link></p>
    </form>
  )
}

export function Login() { return <section className="auth-page"><LoginForm /></section> }
export function Registration() { return <section className="auth-page"><RegistrationForm /></section> }
