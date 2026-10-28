import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import DeliveryFields from '../components/DeliveryFields.jsx'
import PasswordInput from '../components/PasswordInput.jsx'
import SessionStatus from '../components/SessionStatus.jsx'
import { customerReturnPath, focusFirstError } from '../data/accountNavigation.js'
import { registerCustomer } from '../data/customerAccount.js'
import { validCustomerEmail } from '../data/customerEmail.js'
import {
  isStaff,
  signInCustomer,
  staffHome,
  useSession,
  useSessionStatus,
} from '../data/session.js'

// Where a signed-in visitor goes instead of seeing these forms.
const signedInHome = (user) => (isStaff(user) ? staffHome(user) : '/account')

function LoginForm() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = customerReturnPath(
    new URLSearchParams(location.search).get('returnTo') || location.state?.returnTo,
  )
  const user = useSession()
  const [values, setValues] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  if (user && !pending) return <Navigate to={isStaff(user) ? staffHome(user) : returnTo} replace />

  const update = (event) => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setErrors((current) => ({ ...current, [event.target.name]: undefined }))
    setError('')
  }
  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    const next = {}
    if (!values.email.trim()) next.email = 'Enter your email address.'
    else if (!validCustomerEmail(values.email)) next.email = 'Enter a valid email address.'
    if (!values.password) next.password = 'Enter your password.'
    setErrors(next)
    if (Object.keys(next).length) {
      focusFirstError(next)
      return
    }
    setPending(true)
    const result = await signInCustomer(values.email.trim(), values.password)
    if (result.error) {
      setValues((current) => ({ ...current, password: '' }))
      setPending(false)
      setError(result.error)
    } else navigate(returnTo, { replace: true })
  }

  return (
    <form className="auth-card" noValidate onSubmit={submit} aria-busy={pending}>
      <p className="eyebrow">Customer account</p>
      <h1>Welcome back</h1>
      <p className="notice notice--info" role="status">
        Sign in with the email and password you registered with.
      </p>
      <p className="auth-switch">
        <Link to="/admin/login">Admin sign in</Link> ·{' '}
        <Link to="/employee/login">Employee sign in</Link>
      </p>

      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}

      <fieldset className="account-fields" disabled={pending}>
        <Input
          id="email"
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={update}
          error={errors.email}
        />
        <PasswordInput
          id="password"
          name="password"
          label="Password"
          autoComplete="current-password"
          value={values.password}
          onChange={update}
          error={errors.password}
        />
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p>
        <Link to={'/forgot-password?' + new URLSearchParams({ returnTo })}>Forgot password?</Link>
      </p>
      <p>
        New to the guild?{' '}
        <Link to="/register" state={{ returnTo }}>
          Create an account
        </Link>
      </p>
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
  const location = useLocation()
  const user = useSession()
  const [values, setValues] = useState(emptyRegistration)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  // Registering signs the customer in part way through, so don't redirect until it has finished.
  if (user && !pending) return <Navigate to={signedInHome(user)} replace />

  const update = (event) => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setErrors((current) => ({ ...current, [event.target.name]: undefined }))
    setError('')
  }
  const submit = async (event) => {
    event.preventDefault()
    if (pending) return
    setPending(true)
    const result = await registerCustomer(values)
    if (result.user) {
      navigate(
        result.detailsError
          ? '/account'
          : customerReturnPath(
              new URLSearchParams(location.search).get('returnTo') || location.state?.returnTo,
            ),
        {
          replace: true,
          state: {
            registered: true,
            detailsError: result.detailsError,
            returnTo: customerReturnPath(
              new URLSearchParams(location.search).get('returnTo') || location.state?.returnTo,
              '/',
            ),
          },
        },
      )
      return
    }
    setPending(false)
    setErrors(result.errors || {})
    focusFirstError(result.errors || {})
    setError(result.error || '')
  }

  return (
    <form className="auth-card auth-card--wide" noValidate onSubmit={submit} aria-busy={pending}>
      <p className="eyebrow">Account registration</p>
      <h1>Create account</h1>
      <p className="notice notice--info" role="status">
        Join the guild to shop with us. We use your address for deliveries.
      </p>

      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}

      <fieldset className="account-fields form-grid" disabled={pending}>
        <Input
          id="name"
          name="name"
          label="Full name"
          autoComplete="name"
          maxLength={100}
          value={values.name}
          onChange={update}
          error={errors.name}
        />
        <Input
          id="email"
          name="email"
          label="Email address"
          type="email"
          autoComplete="email"
          maxLength={255}
          value={values.email}
          onChange={update}
          error={errors.email}
        />
        <PasswordInput
          id="password"
          name="password"
          label="Password"
          autoComplete="new-password"
          value={values.password}
          onChange={update}
          error={errors.password}
          showStrength
        />
        <PasswordInput
          id="confirm"
          name="confirm"
          label="Confirm password"
          autoComplete="new-password"
          value={values.confirm}
          onChange={update}
          error={errors.confirm}
        />
        <DeliveryFields values={values} errors={errors} onChange={update} />
      </fieldset>

      <Button type="submit" disabled={pending}>
        {pending ? 'Creating account…' : 'Create account'}
      </Button>
      <p>
        Already a member?{' '}
        <Link
          to={
            '/login?' +
            new URLSearchParams({
              returnTo: customerReturnPath(
                new URLSearchParams(location.search).get('returnTo') || location.state?.returnTo,
              ),
            })
          }
        >
          Sign in
        </Link>
      </p>
    </form>
  )
}

export function Login() {
  const status = useSessionStatus()
  return (
    <section className="auth-page">
      <SessionStatus />
      {status !== 'loading' && <LoginForm />}
    </section>
  )
}
export function Registration() {
  const status = useSessionStatus()
  return (
    <section className="auth-page">
      <SessionStatus />
      {status !== 'loading' && <RegistrationForm />}
    </section>
  )
}
