import { apiBaseUrl, apiUrl } from '../api-config.js'
export const COURSE_MODE =
  Boolean(import.meta.env) && import.meta.env.VITE_CATALOGUE_SOURCE !== 'legacy'
export const COURSE_API_ORIGIN = apiBaseUrl
export const COURSE_SESSION_EXPIRED = 'entertainment-guild:course-session-expired'

/** Include cookies on cross-origin course requests, including the login response that sets one.
 * JavaScript never reads the HttpOnly token; the browser handles it and the API verifies it. */
export function courseFetch(path, options = {}) {
  return fetch(
    path instanceof URL
      ? path
      : new URL(apiUrl(path), globalThis.location?.origin || 'http://localhost'),
    {
      ...options,
      credentials: 'include',
      headers: { Accept: 'application/json', ...options.headers },
    },
  )
}

/** Default to GET without a body and JSON POST with a body, unless the caller specifies a method.
 * Preserve HTTP status for recovery decisions while keeping server internals out of UI errors. */
export async function courseRequest(path, { body, signal, ...options } = {}) {
  const response = await courseFetch(path, {
    ...options,
    signal,
    ...(body === undefined
      ? {}
      : {
          method: options.method || 'POST',
          headers: { ...options.headers, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  const value = await response.json().catch(() => {
    throw new TypeError('The service response was interrupted. Please retry the same request.')
  })
  signal?.throwIfAborted()
  // Return to sign-in on expired checkout authentication. Cart and attempt
  // storage remain intact, including an uncertain submission that must be reconciled after login.
  if (
    response.status === 401 &&
    /^\/api\/(checkout|admin)\//.test(new URL(path, 'http://localhost').pathname)
  )
    globalThis.dispatchEvent?.(new Event(COURSE_SESSION_EXPIRED))
  if (!response.ok)
    throw Object.assign(
      new Error(
        response.status >= 500
          ? 'The service is unavailable. Please try again.'
          : value.error || 'The request could not be completed.',
      ),
      { status: response.status },
    )
  return value
}

/** Do not expose the supplied development token generator as proof of email ownership.
 * This form only redeems a reset code; email delivery needs a separate trusted service. */
export async function courseResetPassword({ token, password, confirmPassword }) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token.trim()))
    throw new Error('Enter a valid reset code.')
  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    throw new Error('Use a password between 8 and 128 characters.')
  if (password !== confirmPassword) throw new Error('Passwords do not match.')
  return courseRequest('/resetPassword', {
    body: { token: token.trim(), password },
    signal: AbortSignal.timeout(15000),
  })
}

async function session(signal) {
  let identity
  try {
    identity = await courseRequest('/me', { signal })
  } catch (error) {
    if (error.status === 401) return { user: null }
    throw error
  }
  const role = { PATRON: 'customer', ADMIN: 'admin', STAFF: 'employee' }[identity.role]
  if (!role || !/^[1-9]\d*$/.test(String(identity.id))) throw new Error('Invalid account response.')
  const profile =
    role === 'customer'
      ? await courseRequest(`/api/inft3050/Patrons/${identity.id}?fields=UserID,Name,Email`, {
          signal,
        })
      : null
  return {
    user: {
      id: String(identity.id),
      patronId: role === 'customer' ? String(identity.id) : null,
      name: profile?.Name || '',
      email: identity.email,
      role,
    },
  }
}

/** Reuse the existing authentication interface; never fall back to another database's identity. */
export async function courseAccountRequest(path, body, method, signal) {
  signal ||= AbortSignal.timeout(15000)
  if (path === '/auth/session') return session(signal)
  if (path === '/auth/register') {
    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    const email = typeof body?.email === 'string' ? body.email.trim() : ''
    if (
      !name ||
      name.length > 255 ||
      email.length > 255 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    )
      throw new Error('Enter your name and a valid email address.')
    if (typeof body.password !== 'string' || body.password.length < 8 || body.password.length > 128)
      throw new Error('Use a password between 8 and 128 characters.')
    if (body.password !== body.confirmPassword) throw new Error('Passwords do not match.')
    let exists = true
    try {
      await courseRequest('/patronLookup?email=' + encodeURIComponent(email), { signal })
    } catch (error) {
      if (error.status !== 404) throw error
      exists = false
    }
    if (exists) throw new Error('An account already uses this email. Sign in instead.')
    try {
      // The supplied endpoint salts/hashes HashPW; never persist its raw response or hash.
      await courseRequest('/api/inft3050/Patrons', {
        body: { Name: name, Email: email, HashPW: body.password },
        signal,
      })
    } catch (error) {
      if (error.status === 409)
        throw new Error('An account already uses this email. Sign in instead.', { cause: error })
      throw new Error(
        'Account creation could not be confirmed. Try signing in before creating it again.',
        { cause: error },
      )
    }
    try {
      const result = await courseAccountRequest(
        '/auth/login',
        { login: email, password: body.password },
        method,
        signal,
      )
      if (!result.user) throw new Error('No session')
      return result
    } catch {
      throw new Error(
        'Your account was created, but sign-in could not be completed. Please sign in.',
      )
    }
  }
  if (path === '/auth/login' || path === '/auth/admin-login') {
    await courseRequest(path === '/auth/admin-login' ? '/login' : '/patronLogin', {
      body: { username: body.login, password: body.password },
      signal,
    })
    return session(signal)
  }
  if (path === '/auth/logout') {
    await courseRequest('/logout', { body: {}, signal })
    return { user: null }
  }
  // Profile editing and administration are separate from storefront account access.
  throw new Error('This account action is currently unavailable.')
}
