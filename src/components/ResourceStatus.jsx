import Button from './Button.jsx'

// Loading and error states for data read from the backend. Renders children once the data is ready.
export default function ResourceStatus({ state, resource, label, children }) {
  if (state.status === 'error') {
    return (
      <div className="notice notice--error" role="alert">
        <p>Could not load {label}. {state.error}</p>
        <Button type="button" variant="secondary" onClick={() => resource.load()}>Try again</Button>
      </div>
    )
  }
  if (state.status !== 'ready') return <p className="notice notice--info" role="status">Loading {label} from the backend…</p>
  return children
}
