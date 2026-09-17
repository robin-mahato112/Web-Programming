import { useState } from 'react'

const passwordRequirements = [
  { label: 'At least 8 characters', test: value => value.length >= 8 },
  { label: 'Contains a letter', test: value => /[A-Za-z]/.test(value) },
  { label: 'Contains a number', test: value => /\d/.test(value) },
]

function strengthLabel(score, hasValue) {
  if (!hasValue) return 'Not rated'
  if (score === 1) return 'Weak'
  if (score === 2) return 'Almost there'
  return 'Strong'
}

export default function PasswordInput({ id, label, error, hint, showStrength = false, value = '', ...props }) {
  const [visible, setVisible] = useState(false)
  const helpId = `${id}-help`
  const strengthId = `${id}-strength`
  const requirements = passwordRequirements.map(requirement => ({
    ...requirement,
    met: requirement.test(value),
  }))
  const score = requirements.filter(requirement => requirement.met).length
  const describedBy = [
    (error || hint) ? helpId : null,
    showStrength ? strengthId : null,
  ].filter(Boolean).join(' ') || undefined

  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="password-control">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          value={value}
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...props}
        />
        <button
          className="password-toggle"
          type="button"
          aria-label={`${visible ? 'Hide' : 'Show'} ${label.toLowerCase()}`}
          aria-pressed={visible}
          onClick={() => setVisible(current => !current)}
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
            <span>Password strength</span>
            <strong>{strengthLabel(score, Boolean(value))}</strong>
          </div>
          <div className="password-strength__meter" aria-hidden="true">
            {passwordRequirements.map((requirement, index) => (
              <span key={requirement.label} className={index < score ? 'is-active' : ''} />
            ))}
          </div>
          <ul className="password-requirements">
            {requirements.map(requirement => (
              <li key={requirement.label} className={requirement.met ? 'is-met' : ''}>
                <span>{requirement.label}</span>
                <span>{requirement.met ? 'Met' : 'Required'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
