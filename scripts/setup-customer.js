import { pathToFileURL } from 'node:url'

/** Use the supplied API's hashing and login contract; never reset an existing customer's password. */
export async function setupCustomer({ api, name, email, password }, request = fetch) {
  if (!['http://localhost:13001', 'http://localhost:13002'].includes(api))
    throw new Error('Set COURSE_API_URL to the intended local API on port 13001 or 13002.')
  name = name?.trim()
  email = email?.trim()
  if (
    !name ||
    name.length > 255 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email || '') ||
    email.length > 255
  )
    throw new Error('Set CUSTOMER_NAME and a valid CUSTOMER_EMAIL in your private .env.local.')
  if (typeof password !== 'string' || password.length < 8 || password.length > 128)
    throw new Error('Set CUSTOMER_PASSWORD to 8–128 characters in your private .env.local.')
  const call = (path, body) =>
    request(api + path, {
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
      ...(body
        ? {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }
        : {}),
    })
  const lookup = await call('/patronLookup?email=' + encodeURIComponent(email))
  if (lookup.status !== 200 && lookup.status !== 404)
    throw new Error('Customer lookup failed. No account was created; check the API and retry.')
  const created = lookup.status === 404
  if (created) {
    // HashPW is the university API's input field; it hashes the submitted password with a salt.
    const response = await call('/api/inft3050/Patrons', {
      Name: name,
      Email: email,
      HashPW: password,
    })
    if (response.status !== 201)
      throw new Error(
        'Account creation was not confirmed. Check the account before retrying; no existing account was changed.',
      )
  }
  const response = await call('/patronLogin', { username: email, password })
  if (!response.ok)
    throw new Error(
      'The account exists but sign-in failed. Check its password; this command does not reset passwords.',
    )
  const identity = await response.json()
  if (identity.role !== 'PATRON' || identity.email?.toLowerCase() !== email.toLowerCase())
    throw new Error('The API did not return the expected customer identity.')
  return { created }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const { created } = await setupCustomer({
      api: process.env.COURSE_API_URL,
      name: process.env.CUSTOMER_NAME,
      email: process.env.CUSTOMER_EMAIL,
      password: process.env.CUSTOMER_PASSWORD,
    })
    console.log(
      created
        ? 'Customer created and sign-in verified.'
        : 'Existing customer sign-in verified. No record changed.',
    )
  } catch (error) {
    // Never print response bodies: university registration responses can contain password hashes.
    console.error(
      error instanceof TypeError || error.name === 'TimeoutError'
        ? 'The local API could not be reached. Check Docker and retry.'
        : error.message,
    )
    process.exitCode = 1
  }
}
