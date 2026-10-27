import assert from 'node:assert/strict'
import { test } from 'node:test'
import { courseRequestError } from '../server/course-errors.js'

test('course request errors keep status codes without exposing body, credentials or error details', (t) => {
  const logs = []
  t.mock.method(console, 'error', (...args) => logs.push(args))
  for (const status of [400, 413, 500, undefined]) {
    let actualStatus, body
    const res = {
      status(value) {
        actualStatus = value
        return this
      },
      json(value) {
        body = value
      },
    }
    courseRequestError({ status, message: 'password=private', body: 'secret' }, {}, res)
    assert.equal(actualStatus, status || 500)
    assert.doesNotMatch(JSON.stringify(body), /private|secret|password/)
  }
  let forwarded
  courseRequestError(new Error('private'), {}, { headersSent: true }, (error) => {
    forwarded = error
  })
  assert.equal(forwarded.message, 'University API request failed.')
  assert.ok(
    logs.every((entry) => entry.length === 1 && entry[0] === 'University API request failed.'),
  )
})
