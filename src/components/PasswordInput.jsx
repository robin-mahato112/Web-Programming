import { useState } from 'react'
import { passwordRequirements } from '../data/passwordRules.js'

// Zehai: reusable account password control, adapted to the team's shared field styles.
export default function PasswordInput({
  id,
  label,
  error,
  hint,
  showStrength = false,
  value = '',
  ...props
}) {
  const [visible, setVisible] = useState(false)
  const helpId = `${id}-help`
  const strengthId = `${id}-strength`
  const requirements = passwordRequirements.map((rule) => ({ ...rule, met: rule.test(value) }))
  const score = requirements.filter((rule) => rule.met).length
  const feedback = !value
    ? 'Not rated'
    : score <= 1
      ? 'Weak'
      : score === 2
        ? 'Almost there'
        : 'Requirements met'
  const describedBy =
    [(error || hint) && helpId, showStrength && strengthId].filter(Boolean).join(' ') || undefined

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          {...props}
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
        />
        <button
          className="password-toggle"
          type="button"
          disabled={props.disabled}
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? 'Hide' : 'Show'}
        </button>
      </div>
      {(error || hint) && (
        <small id={helpId} className={error ? 'field__error' : 'field__hint'}>
          {error || hint}
        </small>
      )}
      {showStrength && (
        <div id={strengthId} className="password-strength" aria-live="polite">
          <div className="password-strength__heading">
            <span>Password requirements</span>
            <strong>{feedback}</strong>
          </div>
          <div className="password-strength__meter" aria-hidden="true">
            {requirements.map((rule, index) => (
              <span key={rule.label} className={index < score ? 'is-active' : ''} />
            ))}
          </div>
          <ul className="password-requirements">
            {requirements.map((rule) => (
              <li key={rule.label} className={rule.met ? 'is-met' : ''}>
                <span>{rule.label}</span>
                <span>{rule.met ? 'Met' : 'Required'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
