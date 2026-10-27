import assert from 'node:assert/strict'
import { test } from 'node:test'
import { readDelivery, saveDelivery } from '../src/lib/delivery-draft.js'

function useStorage(t, storage) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  t.after(() => {
    if (previous) Object.defineProperty(globalThis, 'localStorage', previous)
    else delete globalThis.localStorage
  })
}

test('delivery drafts restore per customer without storing cards, credentials or session email', (t) => {
  const values = new Map()
  useStorage(t, {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  })
  const delivery = {
    name: 'Customer',
    street: '12 Example Street',
    suburb: 'Newcastle',
    state: 'NSW',
    postcode: '2300',
    phone: '',
  }
  assert.equal(
    saveDelivery(
      {
        ...delivery,
        email: 'not-trusted@example.test',
        card: '4242424242424242',
        cvc: '123',
        password: 'secret',
      },
      '1',
    ),
    true,
  )
  assert.deepEqual(readDelivery('1'), delivery)
  assert.deepEqual(readDelivery('2'), {})
  assert.doesNotMatch([...values.values()][0], /4242424242424242|secret|cvc|email/)
  saveDelivery(null, '1')
  assert.deepEqual(readDelivery('1'), {})
})
test('invalid drafts and blocked storage never prevent manual checkout entry', (t) => {
  useStorage(t, {
    getItem: () => '{',
    setItem: () => {
      throw new Error('Blocked')
    },
  })
  assert.deepEqual(readDelivery('1'), {})
  assert.equal(saveDelivery({ street: 'Example' }, '1'), false)
})
