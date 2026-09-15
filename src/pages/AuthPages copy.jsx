import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import { existingAdmins } from '../data/mockAdmins.js'

const initialValues = {
  email: '',
  password: '',
  adminCode: '',
}

const emailPattern = /^\S+@\S+\.\S+$/

function validate(values) {
  const errors = {}

  if (!values.email.trim()) errors.email = 'Enter your email address.'
  else if (!emailPattern.test(values.email)) errors.email = 'Enter a valid email address.'

  if (!values.password) errors.password = 'Enter your password.'
  if (!values.adminCode.trim()) errors.adminCode = 'Enter your admin code.'

  if (Object.keys(errors).length === 0) {
    const admin = existingAdmins.find(record => record.role === 'admin' && record.email.toLowerCase() === values.email.trim().toLowerCase())
    if (!admin || admin.password !== values.password || admin.adminCode !== values.adminCode.trim()) {
      errors.credentials = 'Email, password, or admin code is incorrect.'
    }
  }

  return errors
}

function AuthForm() {
  const navigate = useNavigate()
  const [values, setValues] = useState(initialValues)
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const update = event => {
    setValues({ ...values, [event.target.name]: event.target.value })
    setSubmitted(false)
  }
  const submit = event => {
    event.preventDefault()
    const next = validate(values)
    setErrors(next)
    setSubmitted(Object.keys(next).length === 0)
  }

  return (
    <form className="auth-card" noValidate onSubmit={submit}>
      <p className="eyebrow">Admin accounts</p>
      <h1>Admin sign in</h1>
      <p className="notice notice--info" role="status">
        Enter your email, password, and admin code to validate your admin
        account..
      </p>
      <Button
        type="button"
        variant="secondary"
        onClick={() => navigate("/login")}
      >
        Employee Account
      </Button>

      {errors.credentials && (
        <div className="notice notice--error" role="alert">
          {errors.credentials}
        </div>
      )}

      <div>
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
        />
      </div>

      {submitted && (
        <div className="notice" role="status">
          Admin account identified. Login validation passed using the mock admin
          record.
        </div>
      )}
      <Button type="submit">Validate admin sign in</Button>
    </form>
  );
}

export function AdminLogin() { return <section className="auth-page"><AuthForm /></section> }
