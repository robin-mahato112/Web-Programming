import assert from 'node:assert/strict'
import { test } from 'node:test'
import { validCustomerEmail } from '../src/data/customerEmail.js'
import { customerReturnPath } from '../src/data/accountNavigation.js'

// AI-assisted: boundary cases for customer email and return destinations.
test('customer email rejects malformed addresses while allowing normal aliases', () => {
  for (const value of [
    'a@@example.com',
    'a@b@c.com',
    'a b@example.com',
    '.a@example.com',
    'a..b@example.com',
    'a@-example.com',
    'a@example..com',
    'a@example.com.',
    'a@localhost',
    'x'.repeat(65) + '@example.com',
    null,
  ])
    assert.equal(validCustomerEmail(value), false, String(value))
  for (const value of [
    'c3490965@uon.edu.au',
    'first.last+shopping@example.com',
    ' customer@example.com ',
    'customer@sub-domain.example.com',
  ])
    assert.equal(validCustomerEmail(value), true, value)
})

test('customer navigation rejects normalized auth/staff routes and malformed paths', () => {
  for (const value of [
    '/x/../admin',
    '/products/%2e%2e/admin',
    '/x/../login',
    '/%61dmin',
    '/%2f%2fevil.test',
    '//evil.test',
    '/\\evil.test',
    '/forgot-password',
    '/employee',
    '/admin/users',
    '/test-connection',
    '/not-a-route',
    '/products\n',
    null,
  ])
    assert.equal(customerReturnPath(value), '/account', String(value))
  for (const value of [
    '/',
    '/account?tab=delivery#details',
    '/products/12?item=3',
    '/checkout?q=king&sort=name',
    '/checkout/confirmation/abc-123_456',
  ])
    assert.equal(customerReturnPath(value), value)
  assert.equal(customerReturnPath('/products/../cart?q=book'), '/cart?q=book')
  assert.equal(customerReturnPath('/admin', '/'), '/')
})
