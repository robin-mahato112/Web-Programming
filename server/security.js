import { createHash, randomBytes, scrypt as derive, timingSafeEqual } from 'node:crypto'
import { promisify } from 'node:util'
import { CheckoutError } from './orders.js'

const scrypt = promisify(derive)
export const digest = (value) => createHash('sha256').update(value).digest('hex')
export const secret = () => randomBytes(32).toString('hex')
export const fail = (message, status = 400) => {
  throw new CheckoutError(message, status)
}
export const equal = (a, b) =>
  typeof a === 'string' &&
  typeof b === 'string' &&
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b))

export function inputText(value, label, max = 255) {
  if (
    typeof value !== 'string' ||
    !value.trim() ||
    value.trim().length > max ||
    [...value].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    fail(`Enter a valid ${label} (up to ${max} characters).`)
  return value.trim()
}
export function emailAddress(value) {
  const email = inputText(value, 'email address').toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('Enter a valid email address.')
  return email
}
export function identifier(value) {
  if (!/^[1-9]\d*$/.test(String(value)) || Number(value) > 2147483647) fail('Invalid record ID.')
  return Number(value)
}

/** Use a slow salted password hash for new accounts; never alter the course's legacy hashes. */
export async function hashPassword(password) {
  if (typeof password !== 'string' || password.length < 12 || password.length > 128)
    fail('Use a password between 12 and 128 characters.')
  const salt = randomBytes(16).toString('hex')
  const hash = await scrypt(password, salt, 64)
  return `scrypt$${salt}$${hash.toString('hex')}`
}
export async function verifyPassword(password, account) {
  if (typeof password !== 'string' || password.length > 128) return false
  if (account.PasswordHash) {
    const [algorithm, salt, hash] = account.PasswordHash.split('$')
    if (algorithm !== 'scrypt' || !/^[a-f0-9]{32}$/.test(salt) || !/^[a-f0-9]{128}$/.test(hash))
      return false
    return equal((await scrypt(password, salt, 64)).toString('hex'), hash)
  }
  return (
    Boolean(account.Salt && account.HashPW) &&
    equal(digest(account.Salt + password), account.HashPW.toLowerCase())
  )
}

/** Bound login/registration work per client. No untrusted forwarded IP headers are used. */
export function authenticationLimit({ now = Date.now, maximum = 20 } = {}) {
  const attempts = new Map()
  return (req, res, next) => {
    const time = now()
    for (const [key, value] of attempts) if (value.until < time) attempts.delete(key)
    const key = req.socket.remoteAddress
    const entry = attempts.get(key) || { count: 0, until: time + 15 * 60 * 1000 }
    if (entry.count >= maximum || attempts.size >= 10000)
      return res
        .status(429)
        .set('Retry-After', '900')
        .json({ error: 'Too many sign-in attempts. Please try again later.' })
    entry.count++
    attempts.set(key, entry)
    next()
  }
}
