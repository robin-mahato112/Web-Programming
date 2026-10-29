import test from 'node:test'
import assert from 'node:assert/strict'
import { resolve } from 'node:path'
import {
  selectProject,
  apiAddress,
  combinedOrigins,
  frontendPort,
  verifyCatalogue,
} from '../scripts/start-project-config.js'

test('startup detects an incomplete database instead of opening a broken homepage', async () => {
  const visited = []
  await assert.rejects(
    verifyCatalogue('http://localhost:13002', async (url) => {
      visited.push(url)
      return new Response('', { status: url.includes('/BookGenre?') ? 500 : 200 })
    }),
    /BookGenre/,
  )
  assert.equal(visited.length, 4)
  await verifyCatalogue('http://localhost:13001', async () => new Response('[]'))
})

test('startup preserves the existing project and every Compose override', () => {
  const file = resolve('course-backend.local/compose.yml')
  const override = resolve('ports.local.yml')
  assert.deepEqual(
    selectProject([{ Name: 'team-existing', ConfigFiles: `${file},${override}` }], file),
    { name: 'team-existing', files: [file, override] },
  )
  assert.throws(
    () => selectProject([{ Name: 'team-existing', ConfigFiles: file }], file, 'new-project'),
    /existing database/,
  )
  assert.throws(
    () =>
      selectProject(
        [{ Name: 'other', ConfigFiles: resolve('another/compose.yml') }],
        file,
        'other',
      ),
    /another backend/,
  )
})

test('ambiguous database projects stop rather than guessing', () => {
  const file = resolve('course-backend.local/compose.yml')
  assert.throws(
    () =>
      selectProject(
        [
          { Name: 'one', ConfigFiles: file },
          { Name: 'two', ConfigFiles: file },
        ],
        file,
      ),
    /Several/,
  )
})

test('startup uses the actual API mapping and rejects dynamic or ambiguous ports', () => {
  const config = {
    services: {
      db: {},
      auth: { ports: [{ target: 3001, published: '13002', host_ip: '127.0.0.1' }] },
    },
  }
  assert.equal(apiAddress(config), 'http://localhost:13002')
  config.services.auth.ports.push({ target: 3001, published: '3001' })
  assert.equal(apiAddress(config), 'http://localhost:13002')
  config.services.auth.ports[0].published = '13001-13005'
  assert.throws(() => apiAddress(config), /fixed host port/)
  assert.throws(() => apiAddress({ services: { auth: {} } }), /auth and db/)
})

test('startup adds frontend origins without removing teammate origins', () => {
  assert.equal(
    combinedOrigins('https://team.example,http://localhost:3000', 3002),
    'https://team.example,http://localhost:3000,http://localhost:3002,http://127.0.0.1:3002',
  )
  assert.equal(frontendPort(), 3000)
  assert.throws(() => frontendPort('3000; echo anything'), /FRONTEND_PORT/)
  assert.throws(() => frontendPort(70000), /FRONTEND_PORT/)
})
