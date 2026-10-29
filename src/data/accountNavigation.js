// Only return to same-site customer routes, never an external URL or a staff screen.
export function customerReturnPath(value, fallback = '/account') {
  if (
    typeof value !== 'string' ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\s]/.test(value)
  )
    return fallback
  // Encoded path separators are unnecessary for these routes and must not alter routing later.
  try {
    const url = new URL(value, 'https://account.invalid')
    if (
      url.origin !== 'https://account.invalid' ||
      url.pathname.includes('%') ||
      !/^\/(?:account|profile|products(?:\/[a-zA-Z0-9_-]+)?|cart|checkout(?:\/confirmation\/[a-zA-Z0-9_-]+)?)?\/?$/.test(
        url.pathname,
      )
    )
      return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}

export function focusFirstError(errors) {
  const first = Object.keys(errors)[0]
  if (first) requestAnimationFrame(() => document.getElementById(first)?.focus())
}
