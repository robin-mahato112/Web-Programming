// Zehai's customer accounts section starts here: course API integration.
// Vite forwards /backend to the course API; the HTTP-only cookie holds the session.
async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`/backend${path}`, {
      credentials: 'include',
      signal: AbortSignal.timeout(15000),
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
    })
  } catch {
    throw new Error('Cannot reach the account service. Please try again later.')
  }
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const error = new Error(response.status >= 500
      ? 'The account service is unavailable. Please try again later.'
      : data?.error || 'The request could not be completed.')
    error.status = response.status
    if (response.status === 401 && path !== '/patronLogin' && path !== '/me' && typeof window !== 'undefined') {
      window.dispatchEvent(new Event('customer-session-expired'))
    }
    throw error
  }
  return data
}

export const login = (email, password) => request('/patronLogin', {
  method: 'POST', body: JSON.stringify({ username: email.trim(), password }),
})
export const logout = () => request('/logout', { method: 'POST' })
export const getSession = () => request('/me')

export async function registerAccount(values) {
  const email = values.email.trim()
  const existing = await request(`/patronLookup?email=${encodeURIComponent(email)}`)
    .catch(error => { if (error.status === 404) return null; throw error })
  if (existing) throw new Error('This email is already registered. Please sign in.')
  // The course API expects plaintext in HashPW and hashes it on the server.
  // Do not retain the returned password hash or salt in application state.
  await request('/api/inft3050/Patrons', {
    method: 'POST',
    body: JSON.stringify({ Email: email, Name: values.name.trim(), HashPW: values.password }),
  })
  try {
    const user = await login(email, values.password)
    try {
      await saveContact(user, null, values)
      return { user }
    } catch {
      return { user, warning: 'Your account is ready. Please complete and save your delivery details.' }
    }
  } catch {
    // Account creation and contact creation are separate backend operations.
    throw new Error('Your account was created, but setup could not finish. Sign in to complete your delivery details.')
  }
}

export async function loadProfile() {
  const user = await request('/me').catch(error => {
    if (error.status === 401 && typeof window !== 'undefined') window.dispatchEvent(new Event('customer-session-expired'))
    throw error
  })
  if (user.role !== 'PATRON') throw new Error('Please sign in with a customer account.')
  const patron = await request(`/api/inft3050/Patrons/${encodeURIComponent(user.id)}?fields=UserID,Email,Name`)
  const contacts = await request('/api/inft3050/TO?fields=CustomerID,Email,PhoneNumber,StreetAddress,PostCode,Suburb,State')
  // The backend restricts the result to the authenticated customer's records.
  const contact = contacts.list?.[0]
  return {
    user,
    contactId: contact?.CustomerID ?? null,
    values: {
      name: patron.Name || '', email: patron.Email || '',
      phoneNumber: contact?.PhoneNumber || '', streetAddress: contact?.StreetAddress || '',
      suburb: contact?.Suburb || '', state: contact?.State || '', postcode: String(contact?.PostCode ?? ''),
    },
  }
}

export async function saveContact(user, contactId, values) {
  const data = {
    Email: user.email, PhoneNumber: values.phoneNumber.trim(),
    StreetAddress: values.streetAddress.trim(), Suburb: values.suburb.trim(),
    State: values.state.trim(), PostCode: values.postcode.trim(),
  }
  if (contactId == null) data.PatronId = user.id
  const saved = await request(`/api/inft3050/TO${contactId == null ? '' : `/${encodeURIComponent(contactId)}`}`, {
    method: contactId == null ? 'POST' : 'PATCH', body: JSON.stringify(data),
  })
  return saved.CustomerID
}
// Zehai's customer accounts section stops here.
