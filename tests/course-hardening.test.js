import assert from 'node:assert/strict'
import { test } from 'node:test'
import vm from 'node:vm'
import { hardenCourseLogging, hardenCourseStockAccess } from '../scripts/course-api-hardening.js'

test('staff stock hardening denies catalogue writes without changing admin or patron rules', () => {
  const source =
    "  [ROLES.STAFF]: {\n    allow: [{ tables: ['*'], actions: [ACTIONS.READ, ACTIONS.WRITE] }],\n    deny: [\n    ]\n  }"
  const changed = hardenCourseStockAccess(source)
  assert.match(changed, /admin-only catalogue writes/)
  assert.match(changed, /dbo.stocktake/)
  assert.equal(hardenCourseStockAccess(changed), changed)
  assert.throws(() => hardenCourseStockAccess('unfamiliar source'), /Review changed/)
  const policy = vm.runInNewContext('({' + changed + '})', {
    ROLES: { STAFF: 'STAFF' },
    ACTIONS: { READ: 'READ', WRITE: 'WRITE' },
  }).STAFF
  assert.ok(policy.deny[0].tables.includes('stocktake'))
  assert.deepEqual([...policy.deny[0].actions], ['WRITE'])
})

test('university log hardening removes secrets while preserving the authentication response', () => {
  const source = `
    const patron = { Email: 'private@example.test', HashPW: 'private-hash', Salt: 'private-salt' };
    const token = 'private-token';
    console.log('PatronLogin Debug - raw patron record:', JSON.stringify(patron));
    console.log('PatronLogin Debug - tokenPayload:', token);
    console.log('Password reset token:', token);
    console.error('Login error:', { password: 'private-password', token });
    res.cookie('token', token, { httpOnly: true });
    res.json({ email: patron.Email, role: 'PATRON' });
  `
  function run(code) {
    const output = { logs: [], cookies: [], responses: [] }
    vm.runInNewContext(code, {
      console: {
        log: (...args) => output.logs.push(args),
        error: (...args) => output.logs.push(args),
      },
      res: {
        cookie: (...args) => output.cookies.push(args),
        json: (value) => output.responses.push(value),
      },
    })
    return JSON.parse(JSON.stringify(output))
  }
  const before = run(source)
  const after = run(hardenCourseLogging(source))
  assert.deepEqual(after.cookies, before.cookies)
  assert.deepEqual(after.responses, before.responses)
  assert.deepEqual(after.logs, [['University API operation failed.']])
})

test('university log hardening is repeatable and retains safe startup diagnostics', () => {
  const source = [
    'console.log(`Auth server listening on :${PORT}`);',
    "console.error('WARNING: Using default JWT_SECRET in production is insecure!');",
    "console.log('RLS Debug - user:', JSON.stringify(user));",
  ].join('\r\n')
  const changed = hardenCourseLogging(source)
  assert.match(changed, /Auth server listening/)
  assert.match(changed, /WARNING/)
  assert.doesNotMatch(changed, /JSON.stringify|RLS Debug/)
  assert.equal(hardenCourseLogging(changed), changed)
})

test('university log hardening refuses an unknown multiline or alternative logger', () => {
  assert.throws(() => hardenCourseLogging('console.log(\n  patron\n);'), /Review unfamiliar/)
  assert.throws(() => hardenCourseLogging('console.info(token);'), /Review unfamiliar/)
})
