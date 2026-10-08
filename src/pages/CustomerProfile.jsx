import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Button from '../components/Button.jsx'
import Input from '../components/Input.jsx'
import { loadProfile, saveContact } from '../services/customerApi.js'

// Zehai's customer accounts section starts here: load and save delivery details.
const contactFields = [
  ['phoneNumber', 'Phone number', 'tel'], ['streetAddress', 'Street address', 'street-address'],
  ['suburb', 'Suburb', 'address-level2'], ['state', 'State', 'address-level1'],
  ['postcode', 'Postcode', 'postal-code'],
]

export default function CustomerProfile() {
  const [profile, setProfile] = useState(null)
  const [values, setValues] = useState(null)
  const [errors, setErrors] = useState({})
  const [message, setMessage] = useState('')
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const { state } = useLocation()

  useEffect(() => {
    let active = true
    loadProfile().then(result => {
      if (active) { setProfile(result); setValues(result.values) }
    }).catch(error => {
      if (active) setFailure(error.status === 401 ? 'Please sign in to view your profile.' : error.message)
    })
    return () => { active = false }
  }, [attempt])

  async function save(event) {
    event.preventDefault()
    if (busy) return
    const next = {}
    for (const [key, label] of contactFields) {
      if (!values[key].trim()) next[key] = `Enter your ${label.toLowerCase()}.`
    }
    if (!/^\d{4}$/.test(values.postcode.trim())) next.postcode = 'Postcode must be 4 digits.'
    setErrors(next)
    setMessage('')
    setFailure('')
    if (Object.keys(next).length) {
      document.getElementById(`profile-${Object.keys(next)[0]}`)?.focus()
      return
    }
    setBusy(true)
    try {
      const contactId = await saveContact(profile.user, profile.contactId, values)
      const savedValues = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, value.trim()]))
      setValues(savedValues)
      setProfile({ ...profile, contactId, values: savedValues })
      setMessage('Delivery details saved.')
    } catch (error) {
      setFailure(error.status === 401 ? 'Your session has expired. Please sign in again.' : error.message)
    } finally { setBusy(false) }
  }

  if (!profile) return <section className="section shell">
    <h1>Customer profile</h1>
    {failure ? <><p role="alert">{failure}</p><Button onClick={() => { setFailure(''); setAttempt(value => value + 1) }}>Try again</Button></> : <p role="status">Loading your profile...</p>}
  </section>

  return <section className="section shell customer-profile-page">
    <h1>Customer profile</h1>
    <div className="account-identity"><h2>{values.name}</h2><p>{values.email}</p></div>
    {state?.message && profile.contactId == null && <p className="notice" role="status">{state.message}</p>}
    <form className="profile-form" onSubmit={save} noValidate>
      <h2>Delivery details</h2>
      <div className="form-grid">
        {contactFields.map(([key, label, autoComplete]) => <Input
          key={key} id={`profile-${key}`} name={key} label={label}
          autoComplete={autoComplete} type={key === 'phoneNumber' ? 'tel' : 'text'}
          inputMode={key === 'postcode' ? 'numeric' : undefined}
          value={values[key]} disabled={busy} error={errors[key]}
          onChange={event => { setValues({ ...values, [key]: event.target.value }); setMessage(''); setErrors(current => ({ ...current, [key]: undefined })) }}
        />)}
      </div>
      {failure && <p className="notice notice--error" role="alert">{failure}</p>}
      {message && <p className="notice" role="status">{message}</p>}
      <div className="actions">
        <Button type="submit" disabled={busy}>{busy ? 'Please wait...' : 'Save details'}</Button>
        <Button variant="secondary" disabled={busy} onClick={() => { setValues({ ...profile.values }); setErrors({}); setMessage(''); setFailure('') }}>Reset</Button>
      </div>
    </form>
  </section>
}
// Zehai's customer accounts section stops here.
