import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import { existingCustomers } from '../data/mockCustomers.js'
import { existingEmployees } from '../data/mockEmployees.js'
import { existingAdmins } from '../data/mockAdmins.js'
import { signInStaff } from '../data/staffSession.js'

const initialValues = {
  role: '',
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
const registrationRoles = ['admin', 'employee', 'staff']

function validate(values, register) {
  const errors = {}

  if (register && !registrationRoles.includes(values.role))
    errors.role = 'Choose an account role.'

  if (register && !values.name.trim()) 
    errors.name = 'Enter your full name.'
  if (!values.email.trim()) 
    errors.email = 'Enter your email address.'
  else if (!emailPattern.test(values.email)) 
    errors.email = 'Enter a valid email address.'
  else if (register && [...existingCustomers, ...existingEmployees, ...existingAdmins].some(customer => customer.email.toLowerCase() === values.email.trim().toLowerCase()))
    errors.email = 'This email is already registered.'

  if (!values.password) 
    errors.password = 'Enter your password.'
  else if (register && !strongPasswordPattern.test(values.password)) 
    errors.password = 'Use 8+ characters with letters and numbers.'
  if (register && values.confirm !== values.password) 
    errors.confirm = 'Passwords must match.'

  if (register && !values.phoneNumber.trim()) 
    errors.phoneNumber = 'Enter your phone number.'
  if (register && !values.streetAddress.trim()) 
    errors.streetAddress = 'Enter your street address.'
  if (register && !values.suburb.trim()) 
    errors.suburb = 'Enter your suburb.'
  if (register && !values.state.trim()) 
    errors.state = 'Enter your state.'
  if (register && !postcodePattern.test(values.postcode.trim())) 
    errors.postcode = 'Postcode must be 4 digits.'

  if (!register && Object.keys(errors).length === 0) {
    const customer = [...existingCustomers, ...existingEmployees].find(record => record.email.toLowerCase() === values.email.trim().toLowerCase())
    if (!customer || customer.password !== values.password) errors.credentials = 'Email or password is incorrect.'
  }

  return errors
}

function AuthForm({ register = false }) {
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
    const next = validate(values, register)
    setErrors(next)
    setSubmitted(Object.keys(next).length === 0)
    if (!register && Object.keys(next).length === 0) {
      const employee = existingEmployees.find(record => record.email.toLowerCase() === values.email.trim().toLowerCase())
      if (employee) {
        signInStaff(employee)
        navigate('/employee', { replace: true })
      }
    }
  }

  return (
    <form
      className={register ? "auth-card auth-card--wide" : "auth-card"}
      noValidate
      onSubmit={submit}
    >
      <p className="eyebrow">{register ? 'Account registration' : 'Member 2 customer accounts'}</p>
      <h1>{register ? "Create account" : "Welcome back"}</h1>
      <p className="notice notice--info" role="status">
        {register ? 'Choose your role and enter your details to validate a new account.' : 'Enter your email and password to sign in as a customer or employee.'}
      </p>
      {!register && <Button
        type="button"
        variant="secondary"
        onClick={() => navigate("/admin/login")}
      >
        Admin Account
      </Button>}

      {register && (
        <fieldset className="registration-roles" aria-describedby={errors.role ? 'role-error' : undefined}>
          <legend>Choose role</legend>
          <div className="registration-roles__options">
            {registrationRoles.map(role => (
              <label key={role} className={values.role === role ? 'registration-role registration-role--selected' : 'registration-role'}>
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={values.role === role}
                  onChange={update}
                  required
                  aria-invalid={Boolean(errors.role)}
                />
                {role.charAt(0).toUpperCase() + role.slice(1)}
              </label>
            ))}
          </div>
          {errors.role && <p id="role-error" className="field__error" role="alert">{errors.role}</p>}
        </fieldset>
      )}

      {errors.credentials && (
        <div className="notice notice--error" role="alert">
          {errors.credentials}
        </div>
      )}

      <div className={register ? "form-grid" : undefined}>
        {register && (
          <Input
            id="name"
            name="name"
            label="Full name"
            autoComplete="name"
            value={values.name}
            onChange={update}
            error={errors.name}
          />
        )}
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
          autoComplete={register ? "new-password" : "current-password"}
          value={values.password}
          onChange={update}
          error={errors.password}
          hint={
            register ? "Use 8+ characters with letters and numbers." : undefined
          }
        />
        {register && (
          <Input
            id="confirm"
            name="confirm"
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={values.confirm}
            onChange={update}
            error={errors.confirm}
          />
        )}
        {register && (
          <Input
            id="phoneNumber"
            name="phoneNumber"
            label="Phone number"
            type="tel"
            autoComplete="tel"
            value={values.phoneNumber}
            onChange={update}
            error={errors.phoneNumber}
          />
        )}
        {register && (
          <Input
            id="streetAddress"
            name="streetAddress"
            label="Street address"
            autoComplete="street-address"
            value={values.streetAddress}
            onChange={update}
            error={errors.streetAddress}
          />
        )}
        {register && (
          <Input
            id="suburb"
            name="suburb"
            label="Suburb"
            autoComplete="address-level2"
            value={values.suburb}
            onChange={update}
            error={errors.suburb}
          />
        )}
        {register && (
          <Input
            id="state"
            name="state"
            label="State"
            autoComplete="address-level1"
            value={values.state}
            onChange={update}
            error={errors.state}
          />
        )}
        {register && (
          <Input
            id="postcode"
            name="postcode"
            label="Postcode"
            inputMode="numeric"
            autoComplete="postal-code"
            value={values.postcode}
            onChange={update}
            error={errors.postcode}
          />
        )}
      </div>

      {submitted && (
        <div className="notice" role="status">
          {register
            ? `${values.role.charAt(0).toUpperCase() + values.role.slice(1)} registration validation passed. Backend account creation is planned for a later sprint.`
            : "Login validation passed using the Sprint 1 mock customer record."}
        </div>
      )}
      <Button type="submit">
        {register ? "Validate registration" : "Validate sign in"}
      </Button>
      <p>
        {register ? "Already a member?" : "New to the guild?"}{" "}
        <Link to={register ? (values.role === 'admin' ? '/admin/login' : '/login') : '/register'}>
          {register ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}

export function Login() { return <section className="auth-page"><AuthForm /></section> }
export function Registration() { return <section className="auth-page"><AuthForm register /></section> }
