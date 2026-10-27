import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import { signInStaff, staffHome, useStaffSession } from '../data/session.js'

const initialValues = {
  username: '',
  password: '',
}

function validate(values) {
  const errors = {}
  if (!values.username.trim()) errors.username = 'Enter your username.'
  if (!values.password) errors.password = 'Enter your password.'
  return errors
}

// Admins and employees both sign in here with their backend User account. The account's role decides the dashboard.
function AuthForm() {
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const update = (event) => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setError('')
  }
  const submit = async (event) => {
    event.preventDefault()
    const next = validate(values)
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    const result = await signInStaff(values.username.trim(), values.password)
    setPending(false)
    if (result.field) setErrors({ [result.field]: result.error })
    else if (result.error) setError(result.error)
    else navigate(staffHome(result.user), { replace: true })
  }

  return (
    <form className="auth-card" noValidate onSubmit={submit} aria-busy={pending}>
      <p className="eyebrow">Staff accounts</p>
      <h1>Staff sign in</h1>
      <p className="notice notice--info" role="status">
        Sign in with your staff username and password. Your account permissions determine the
        dashboard.
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
      </div>

      <Button type="submit" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
      <p>
        Shopping with us? <Link to="/login">Customer sign in</Link>
      </p>
    </form>
  )
}

export function AdminLogin() {
  const user = useStaffSession()
  if (user) return <Navigate to={staffHome(user)} replace />
  return (
    <section className="auth-page">
      <AuthForm />
    </section>
  )
}
