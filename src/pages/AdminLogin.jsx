import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import { signInStaff, useStaffSession } from '../data/staffSession.js'

const initialValues = {
  username: '',
  password: '',
  adminCode: '',
}

function validate(values) {
  const errors = {}
  if (!values.username.trim())
    errors.username = 'Enter your username.'
  if (!values.password)
    errors.password = 'Enter your password.'
  return errors
}

// Admins and employees both sign in here with their backend User account. The account's role decides the dashboard.
function AuthForm() {
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const update = event => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setError('')
  }
  const submit = async event => {
    event.preventDefault()
    const next = validate(values)
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    const result = await signInStaff(values.username.trim(), values.password, values.adminCode)
    setPending(false)
    if (result.field) setErrors({ [result.field]: result.error })
    else if (result.error) setError(result.error)
    else navigate(result.user.role === 'admin' ? '/admin' : '/employee', { replace: true })
  }

  return (
    <form className="auth-card" noValidate onSubmit={submit} aria-busy={pending}>
      <p className="eyebrow">Staff accounts</p>
      <h1>Staff sign in</h1>
      <p className="notice notice--info" role="status">
        Sign in with your staff username and password. Admins also enter
        their admin code; employees leave it blank.
      </p>

      {error && (
        <div className="notice notice--error" role="alert">
          {error}
        </div>
      )}

      <div>
        <Input
          id="username"
          name="username"
          label="Username"
          autoComplete="username"
          value={values.username}
          onChange={update}
          error={errors.username}
        />
        <Input
          id="password"
          name="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={values.password}
          onChange={update}
          error={errors.password}
        />
        <Input
          id="adminCode"
          name="adminCode"
          label="Admin code"
          type="password"
          autoComplete="off"
          value={values.adminCode}
          onChange={update}
          error={errors.adminCode}
          hint="Admins only. Employees leave this blank."
        />
      </div>

      <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
      <p>Shopping with us? <Link to="/login">Customer sign in</Link></p>
    </form>
  );
}

export function AdminLogin() {
  const user = useStaffSession()
  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/employee'} replace />
  return <section className="auth-page"><AuthForm /></section>
}
