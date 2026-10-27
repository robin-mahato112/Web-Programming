/**
 * Verify decimal parsing and total calculations with known cent values rather
 * than floating-point approximations. Cases cover accepted formats, rejected
 * coercion and overflow in multiplication and sums.
 */
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateTotals, fromCents, toCents } from '../src/lib/money.js'

test('currency parses decimal digits exactly, including zero and leading zeros', () => {
  for (const [value, cents] of [
    [0, 0],
    [1.01, 101],
    [19.95, 1995],
    [' 024.50 ', 2450],
    ['.50', NaN],
    ['1.1', 110],
    ['90071992547409.91', Number.MAX_SAFE_INTEGER],
  ]) {
    assert.equal(toCents(value), cents)
  }
})

test('currency rejects coercion, invalid precision and unsafe amounts', () => {
  for (const value of [
    null,
    undefined,
    true,
    false,
    [],
    {},
    '',
    ' ',
    '-1',
    -1,
    '1e2',
    '1.',
    '1.001',
    0.005,
    NaN,
    Infinity,
    '90071992547409.92',
  ]) {
    assert.ok(Number.isNaN(toCents(value)), String(value))
  }
})

test('dollar conversion preserves cents and rejects invalid or lossy conversions', () => {
  for (const cents of [0, 1, 101, 1995, Number.MAX_SAFE_INTEGER - 1]) {
    assert.equal(toCents(fromCents(cents)), cents)
  }
  for (const cents of [null, '100', true, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => fromCents(cents), RangeError)
  }
  assert.throws(() => fromCents(Number.MAX_SAFE_INTEGER), /losing cents/)
})

test('totals use cents for decimal multiplication and empty carts', () => {
  const items = [
    { product: { price: 0.1 }, quantity: 3 },
    { product: { price: 0.2 }, quantity: 1 },
  ]
  assert.deepEqual(calculateTotals(items), { subtotal: 0.5 })
  assert.deepEqual(calculateTotals([]), { subtotal: 0 })
})

test('totals reject invalid prices, quantities and inputs', () => {
  for (const item of [
    null,
    {},
    { product: { price: -1 }, quantity: 1 },
    { product: { price: '1.001' }, quantity: 1 },
  ]) {
    assert.throws(() => calculateTotals([item]), RangeError)
  }
  for (const quantity of [0, -1, 0.5, '1', null, NaN, Infinity, 1n]) {
    assert.throws(() => calculateTotals([{ product: { price: 1 }, quantity }]), RangeError)
  }
  assert.throws(() => calculateTotals(null), RangeError)
})

test('totals reject overflow in multiplication and sums', () => {
  const item = { product: { price: '90071992547409.91' }, quantity: 1 }
  assert.throws(() => calculateTotals([{ ...item, quantity: 2 }]), RangeError)
  assert.throws(
    () => calculateTotals([item, { product: { price: 0.01 }, quantity: 1 }]),
    RangeError,
  )
})

test('totals reject precision loss in a safe subtotal', () => {
  assert.throws(
    () => calculateTotals([{ product: { price: '90071992547409.91' }, quantity: 1 }]),
    /losing cents/,
  )
  const items = [{ product: { price: '90071992547400.06' }, quantity: 1 }]
  assert.equal(calculateTotals(items).subtotal, 90071992547400.06)
})
