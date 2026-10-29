import { randomBytes } from 'node:crypto'
import { validCustomerEmail } from '../src/data/customerEmail.js'
import {
  accountError,
  customerIdentityRepository,
  fingerprint,
  profileValues,
  tokenDigest,
  validAccountPassword,
} from './customer-identity.js'

// AI-assisted: account extension only; generic table, staff, catalogue and checkout contracts stay intact.
export function mountCourseCustomerAccounts(
  app,
  {
    database,
    requireAuth,
    origins,
    signToken,
    verifyToken,
    mailer,
    production = false,
    expiresIn = 3600,
    now = Date.now,
    repository = customerIdentityRepository(database),
    limit = 20,
  },
) {
  const tokens = new Map()
  const requests = new Map()
  const ttl = 15 * 60 * 1000
  const generic = {
    ok: true,
    message:
      'If an account matches, check your inbox for a reset code. You can request another code if needed.',
  }
  const prune = () => {
    for (const [key, item] of tokens) if (item.expires <= now()) tokens.delete(key)
    for (const [key, item] of requests) if (item.expires <= now()) requests.delete(key)
  }
  const limited = (req, key = 'ip:' + req.socket.remoteAddress, maximum = limit) => {
    prune()
    const item = requests.get(key) || { count: 0, expires: now() + ttl }
    if (item.count >= maximum || requests.size >= 10000)
      throw accountError('Too many attempts. Please try again in 15 minutes.', 429)
    item.count++
    requests.set(key, item)
  }
  const handle = (action) => async (req, res) => {
    res.set('Cache-Control', 'no-store')
    try {
      if (req.method !== 'GET') {
        if (!origins.includes(req.get('Origin')) || req.get('X-Customer-Request') !== '1')
          throw accountError('Use the customer account form.', 403)
        if (!req.is('application/json')) throw accountError('Send application/json.', 415)
        limited(req)
      }
      await action(req, res)
    } catch (error) {
      if (error.status === 429) res.set('Retry-After', '900')
      res.status(error.status || 503).json({
        error: error.status
          ? error.message
          : 'The account service is unavailable. Please try again later.',
      })
    }
  }
  const setCustomerCookie = (res, row) =>
    res.cookie(
      'token',
      signToken({
        sub: row.UserID,
        email: row.Email,
        username: row.Name,
        role: 'PATRON',
        accountVersion: fingerprint(row),
      }),
      {
        httpOnly: true,
        secure: production,
        sameSite: production ? 'none' : 'lax',
        maxAge: Number(expiresIn) * 1000,
      },
    )

  // Old customer sessions expire after password/email changes, including on checkout routes.
  // Staff cookies and sign-in/logout routes pass through unchanged.
  app.use(async (req, res, next) => {
    if (
      !req.cookies?.token ||
      [
        '/login',
        '/patronLogin',
        '/logout',
        '/requestPasswordReset',
        '/resetPassword',
        '/api/customer/recovery',
      ].includes(req.path)
    )
      return next()
    let identity
    try {
      identity = verifyToken(req.cookies.token)
    } catch {
      return next()
    }
    if (identity.role !== 'PATRON') return next()
    try {
      const id = Number(identity.sub)
      const row =
        Number.isInteger(id) && id > 0 && id <= 2147483647 ? await repository.findById(id) : null
      if (!row || identity.accountVersion !== fingerprint(row)) {
        res.set('Cache-Control', 'no-store')
        // Remove the rejected cookie so subsequent anonymous catalogue requests can succeed.
        res.clearCookie('token', {
          httpOnly: true,
          secure: production,
          sameSite: production ? 'none' : 'lax',
        })
        return res.status(401).json({ error: 'Your account changed. Sign in again.' })
      }
      next()
    } catch {
      res.status(503).json({ error: 'The account service is unavailable. Please try again later.' })
    }
  })

  app.get(
    '/api/customer/recovery',
    handle(async (_req, res) =>
      res.json({
        enabled: Boolean(mailer),
        delivery: mailer?.local ? 'local' : 'email',
      }),
    ),
  )
  app.post(
    '/requestPasswordReset',
    handle(async (req, res) => {
      if (!validCustomerEmail(req.body?.email)) throw accountError('Enter a valid email address.')
      if (!mailer)
        throw accountError(
          'Password recovery email is not configured. Please contact support.',
          503,
        )
      const email = req.body.email.trim().toLowerCase()
      // Apply the same email/IP limit and SMTP availability check to existing and unknown addresses.
      limited(req, 'email:' + tokenDigest(email), 5)
      await mailer.verify()
      const row = await repository.findByEmail(email)
      if (row) {
        if (tokens.size >= 5000)
          throw accountError('Password recovery is busy. Try again later.', 503)
        const token = randomBytes(32).toString('hex')
        const key = tokenDigest(token)
        try {
          await mailer.sendReset(row.Email, token)
          for (const [old, item] of tokens) if (item.id === row.UserID) tokens.delete(old)
          tokens.set(key, { id: row.UserID, version: fingerprint(row), expires: now() + ttl })
        } catch {
          tokens.delete(key)
          // Do not expose account existence through an SMTP rejection or echo codes to the browser.
          console.error('Customer recovery delivery failed. Check the mail service configuration.')
        }
      }
      res.json(generic)
    }),
  )
  app.post(
    '/resetPassword',
    handle(async (req, res) => {
      const { token, password } = req.body || {}
      if (typeof token !== 'string' || !/^[a-f0-9]{64}$/i.test(token.trim()))
        throw accountError('Enter a valid reset code.')
      if (!validAccountPassword(password))
        throw accountError('Use 8–128 characters with a letter and a number.')
      const key = tokenDigest(token.trim().toLowerCase())
      const entry = tokens.get(key)
      if (!entry || entry.expires <= now()) throw accountError('Invalid or expired reset code.')
      const row = await repository.findById(entry.id)
      if (!row || fingerprint(row) !== entry.version)
        throw accountError('Invalid or expired reset code.')
      await repository.resetPassword(row, password)
      for (const [stored, item] of tokens) if (item.id === row.UserID) tokens.delete(stored)
      res.json({ ok: true, message: 'Password changed. Sign in with your new password.' })
    }),
  )
  app.patch(
    '/api/customer/profile',
    requireAuth,
    handle(async (req, res) => {
      if (req.user?.role !== 'PATRON') throw accountError('Sign in as a customer.', 403)
      const id = Number(req.user.sub)
      if (!Number.isInteger(id) || id < 1 || id > 2147483647)
        throw accountError('Invalid customer session.', 401)
      const row = await repository.updateProfile(id, profileValues(req.body))
      setCustomerCookie(res, row)
      res.json({ userId: row.UserID, name: row.Name, email: row.Email, role: 'customer' })
    }),
  )
}
