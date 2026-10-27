import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  forgotPasswordPath,
  registerPath,
  loginPath,
  safeReturnTo,
} from '../src/lib/auth-navigation.js'

test('sign-in preserves catalogue controls, selected listings and confirmation destinations', () => {
  for (const path of [
    '/products?q=book&sort=name',
    '/products/2?item=3&q=book',
    '/cart?stock=1',
    '/checkout?q=book',
    '/checkout/confirmation/abc-123_456?q=book',
  ]) {
    assert.equal(safeReturnTo(path), path)
    assert.equal(new URLSearchParams(loginPath(path).split('?')[1]).get('returnTo'), path)
    assert.equal(new URLSearchParams(registerPath(path).split('?')[1]).get('returnTo'), path)
    assert.equal(new URLSearchParams(forgotPasswordPath(path).split('?')[1]).get('returnTo'), path)
  }
})

test('sign-in rejects external, malformed, recursive and unknown destinations', () => {
  for (const path of [
    null,
    '',
    'https://evil.test',
    '//evil.test',
    '//[invalid',
    '/\\evil.test',
    '/%2f%2fevil.test',
    '/products/%2e%2e/login',
    '/checkout\n',
    '/login',
    '/login?returnTo=/login',
    '/admin',
    'javascript:alert(1)',
  ])
    assert.equal(safeReturnTo(path), '/products', String(path))
  assert.equal(safeReturnTo('/products#ignored'), '/products')
})
