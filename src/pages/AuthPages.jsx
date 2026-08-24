import { useState } from 'react'
import { Link } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'

function validate(values, register) {
  const errors = {}
  if (!values.email.trim()) errors.email = 'Enter your email address.'
  else if (!/^\S+@\S+\.\S+$/.test(values.email)) errors.email = 'Enter a valid email address.'
  if (!values.password) errors.password = 'Enter your password.'
  else if (values.password.length < 8) errors.password = 'Use at least 8 characters.'
  if (register && !values.name.trim()) errors.name = 'Enter your name.'
  if (register && values.confirm !== values.password) errors.confirm = 'Passwords must match.'
  return errors
}

function AuthForm({ register = false }) {
  const [values, setValues] = useState({ name: '', email: '', password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [submitted, setSubmitted] = useState(false)
  const update = event => setValues({ ...values, [event.target.name]: event.target.value })
  const submit = event => { event.preventDefault(); const next = validate(values, register); setErrors(next); setSubmitted(Object.keys(next).length === 0) }
  return <form className="auth-card" noValidate onSubmit={submit}>
    <p className="eyebrow">Customer account</p><h1>{register ? 'Join the guild' : 'Welcome back'}</h1><p>This form demonstrates browser-side validation only.</p>
    {register && <Input id="name" name="name" label="Full name" autoComplete="name" value={values.name} onChange={update} error={errors.name} />}
    <Input id="email" name="email" label="Email address" type="email" autoComplete="email" value={values.email} onChange={update} error={errors.email} />
    <Input id="password" name="password" label="Password" type="password" autoComplete={register ? 'new-password' : 'current-password'} value={values.password} onChange={update} error={errors.password} hint={register ? 'Use 8 or more characters.' : undefined} />
    {register && <Input id="confirm" name="confirm" label="Confirm password" type="password" autoComplete="new-password" value={values.confirm} onChange={update} error={errors.confirm} />}
    {submitted && <div className="notice" role="status">Validation passed. No account was created because authentication is not connected.</div>}
    <Button type="submit">{register ? 'Validate registration' : 'Validate sign in'}</Button>
    <p>{register ? 'Already a member?' : 'New to the guild?'} <Link to={register ? '/login' : '/register'}>{register ? 'Sign in' : 'Create an account'}</Link></p>
  </form>
}

export function Login() { return <section className="auth-page"><AuthForm /></section> }
export function Registration() { return <section className="auth-page"><AuthForm register /></section> }
