export default function Input({ id, label, error, hint, ...props }) {
  const helpId = `${id}-help`
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <input id={id} aria-invalid={Boolean(error)} aria-describedby={(error || hint) ? helpId : undefined} {...props} />
      {(error || hint) && <small id={helpId} className={error ? 'field__error' : 'field__hint'}>{error || hint}</small>}
    </div>
  )
}
