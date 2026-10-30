import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  installCustomerSource,
  restoreCourseCustomerSource,
} from '../scripts/customer-api-install.js'

test('customer restoration removes only the account extension and retains teammate routes', () => {
  const source = `import express from 'express';
// Data API routes
mountCourseManagement(app, options);
const tokenPayload = { sub: patron.UserID, email: patron.Email, username: patron.Name, role };
// Request a password reset - generates a token and returns it
app.post('/requestPasswordReset', courseRequest);
app.post('/resetPassword', courseReset);
app.get('/me', requireAuth, me);
mountCourseCheckout(app, options);`
  const installed = installCustomerSource(source)
  assert.equal(restoreCourseCustomerSource(installed, source), source)
  assert.equal(restoreCourseCustomerSource(source, source), source)
  assert.equal(restoreCourseCustomerSource(installed.replace(/\n/g, '\r\n'), source), source)
  assert.throws(() => restoreCourseCustomerSource(installed, 'unrecognised backup'))
  assert.throws(() =>
    restoreCourseCustomerSource(
      installed.replace('verifyToken: (token)', 'verifyToken: (changed)'),
      source,
    ),
  )
  assert.throws(() => restoreCourseCustomerSource('unrecognised server', source))
})
