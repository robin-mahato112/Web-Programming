import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import { signInStaff, staffHome, useStaffSession } from '../data/session.js'

const initialValues = {
  username: '',
  password: '',
  adminCode: '',
}

const forms = {
  admin: {
    title: 'Admin sign in',
    notice: 'Admins sign in with their username, password, and admin code.',
    switchTo: ['/employee/login', 'Employee login'],
  },
  employee: {
    title: 'Employee sign in',
    notice: 'Employees sign in with their username and password.',
    switchTo: ['/admin/login', 'Admin login'],
  },
}

function validate(values, role) {
  const errors = {}
  if (!values.username.trim())
    errors.username = 'Enter your username.'
  if (!values.password)
    errors.password = 'Enter your password.'
  if (role === 'admin' && !values.adminCode.trim())
    errors.adminCode = 'Enter your admin code.'
  return errors
}

// Admins and employees sign in on separate pages. Each form only accepts accounts of its own role.
function StaffSignInForm({ role }) {
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const { title, notice, switchTo: [switchPath, switchLabel] } = forms[role]
  const update = event => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setError('')
  }
  const submit = async event => {
    event.preventDefault()
    const next = validate(values, role)
    setErrors(next)
    if (Object.keys(next).length) return
    setPending(true)
    const result = await signInStaff(values.username.trim(), values.password, values.adminCode, role)
    setPending(false)
    if (result.field) setErrors({ [result.field]: result.error })
    else if (result.error) setError(result.error)
    else navigate(staffHome(result.user), { replace: true })
  }

  return (
    <form className="auth-card" noValidate onSubmit={submit} aria-busy={pending}>
      <p className="eyebrow">Staff accounts</p>
      <h1>{title}</h1>
      <p className="notice notice--info">{notice}</p>
      <p className="auth-switch"><Link to={switchPath}>{switchLabel}</Link></p>

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
        {role === 'admin' && (
          <Input
            id="adminCode"
            name="adminCode"
            label="Admin code"
            type="password"
            autoComplete="off"
            value={values.adminCode}
            onChange={update}
            error={errors.adminCode}
          />
        )}
      </div>

      <Button type="submit" disabled={pending}>{pending ? 'Signing in…' : `Sign in as ${role}`}</Button>
      <p>Shopping with us? <Link to="/login">Customer sign in</Link></p>
    </form>
  );
}

function StaffSignInPage({ role }) {
  const user = useStaffSession()
  if (user) return <Navigate to={staffHome(user)} replace />
  // key resets the form when switching between the two pages.
  return <section className="auth-page"><StaffSignInForm key={role} role={role} /></section>
}

export const AdminLogin = () => <StaffSignInPage role="admin" />
export const EmployeeLogin = () => <StaffSignInPage role="employee" />
