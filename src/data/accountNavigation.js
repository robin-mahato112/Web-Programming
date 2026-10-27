// Only return to same-site customer routes, never an external URL or a staff screen.
export function customerReturnPath(value, fallback = '/account') {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s]/.test(value)
  )
    return fallback
  const path = value.split(/[?#]/)[0]
  if (/^\/(login|register|admin|employee)(\/|$)/i.test(path)) return fallback
  return value
}

export function focusFirstError(errors) {
  const first = Object.keys(errors)[0]
  if (first) requestAnimationFrame(() => document.getElementById(first)?.focus())
}
