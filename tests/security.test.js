import assert from 'node:assert/strict'
import { test } from 'node:test'
import { hashPassword, verifyPassword, digest, identifier } from '../server/security.js'
import { requireCsrf, requireRole } from '../server/accounts.js'
import { createManagement } from '../server/management.js'

test('stock edits reject dollar conversion that would lose a cent before accessing SQL', async () => {
  const management = createManagement({
    getPool: () => assert.fail('Invalid edits must not reach SQL'),
  })
  await assert.rejects(
    management.updateListing(
      '1',
      { price: '90071992547409.91', quantity: 1, mode: 'set', version: '0x0000000000000001' },
      { username: 'admin' },
    ),
    { status: 400 },
  )
})

test('new password hashes are salted and legacy SHA256 remains compatible', async () => {
  const password = 'Synthetic-test-password-2026'
  const first = await hashPassword(password),
    second = await hashPassword(password)
  assert.notEqual(first, second)
  assert.equal(await verifyPassword(password, { PasswordHash: first }), true)
  assert.equal(await verifyPassword('wrong', { PasswordHash: first }), false)
  assert.equal(
    await verifyPassword(password, { Salt: 'fixture', HashPW: digest('fixture' + password) }),
    true,
  )
  assert.equal(await verifyPassword(password, { Salt: null, HashPW: null }), false)
  await assert.rejects(hashPassword('short'), { status: 400 })
})
test('roles and CSRF are enforced on the server independently of UI', () => {
  assert.throws(() => requireRole({}, 'customer'), { status: 401 })
  assert.throws(() => requireRole({ session: { user: { role: 'admin' } } }, 'customer'), {
    status: 403,
  })
  assert.throws(
    () =>
      requireCsrf(
        { headers: { origin: 'https://other.test', 'x-csrf-token': 'a' }, session: { csrf: 'a' } },
        ['http://local'],
      ),
    { status: 403 },
  )
  assert.throws(
    () => requireCsrf({ headers: { 'x-csrf-token': 'wrong' }, session: { csrf: 'a' } }, []),
    { status: 403 },
  )
  requireCsrf({ headers: { 'x-csrf-token': 'a' }, session: { csrf: 'a' } }, [])
  for (const value of ['-1', '1 OR 1=1', 2147483648]) assert.throws(() => identifier(value))
})
