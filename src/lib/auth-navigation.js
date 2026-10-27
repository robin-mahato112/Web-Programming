/** Only return to known storefront routes after login, never to a supplied external URL. */
export function safeReturnTo(value) {
  if (
    typeof value !== 'string' ||
    /[\\\s]/.test(value) ||
    !value.startsWith('/') ||
    value.startsWith('//')
  )
    return '/products'
  const url = new URL(value, 'https://store.invalid')
  if (
    url.origin !== 'https://store.invalid' ||
    !/^\/(?:products(?:\/[^/%]+)?|cart|checkout(?:\/confirmation\/[a-zA-Z0-9_-]+)?)$/.test(
      url.pathname,
    )
  )
    return '/products'
  return url.pathname + url.search
}

export function loginPath(destination) {
  return '/login?' + new URLSearchParams({ returnTo: safeReturnTo(destination) })
}

export function registerPath(destination) {
  return '/register?' + new URLSearchParams({ returnTo: safeReturnTo(destination) })
}

export function forgotPasswordPath(destination) {
  return '/forgot-password?' + new URLSearchParams({ returnTo: safeReturnTo(destination) })
}
