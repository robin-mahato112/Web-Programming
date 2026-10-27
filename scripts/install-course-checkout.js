import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { resolve, dirname } from 'node:path'
import {
  hardenCourseLogging,
  hardenCourseOrderAccess,
  hardenCourseStockAccess,
} from './course-api-hardening.js'

// Stage checkout and reviewed API hardening into the course image; never touch its db folder.
const root = resolve(import.meta.dirname, '..')
const course = resolve(
  process.env.COURSE_BACKEND_DIRECTORY || resolve(root, 'course-backend.local'),
)
const auth = resolve(course, 'auth')
const extension = resolve(auth, 'checkout-extension')
const files = [
  'server/course-checkout.js',
  'server/course-stock.js',
  'server/course-management.js',
  'server/course-errors.js',
  'server/checkout-journal.js',
  'server/checkout.js',
  'server/orders.js',
  'server/catalogue.js',
  'server/security.js',
  'server/demo-payment.js',
  'src/lib/catalogue-records.js',
  'src/lib/money.js',
]
for (const file of files) {
  const target = resolve(extension, file)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(resolve(root, file), target)
}
await writeFile(resolve(extension, 'package.json'), '{"type":"module"}\n')
async function update(file, transform) {
  const path = resolve(course, file)
  const original = await readFile(path, 'utf8')
  const changed = transform(original)
  if (changed !== original) {
    await writeFile(path + '.before-checkout', original, { flag: 'wx' }).catch((error) => {
      if (error.code !== 'EEXIST') throw error
    })
    await writeFile(path, changed)
  }
}
await update('auth/server.js', (source) => {
  source = hardenCourseLogging(hardenCourseStockAccess(hardenCourseOrderAccess(source)))
  if (!source.includes('mountCourseManagement(app,')) {
    if (!source.includes('// Data API routes'))
      throw new Error('Review university routing before installing management')
    source =
      "import { mountCourseManagement } from './checkout-extension/server/course-management.js';\n" +
      source.replace(
        '// Data API routes',
        'mountCourseManagement(app, { database: { getPool: () => poolPromise }, requireAuth, origins });\n\n// Data API routes',
      )
  }
  if (!source.includes('app.use(courseRequestError);'))
    source =
      "import { courseRequestError } from './checkout-extension/server/course-errors.js';\n" +
      source.replace('app.listen(PORT,', 'app.use(courseRequestError);\n\napp.listen(PORT,')
  const mount =
    "mountCourseCheckout(app, { database: { getPool: () => poolPromise }, requireAuth, origins, paymentKey: process.env.CHECKOUT_PAYMENT_SECRET, journalDirectory: '/app/checkout-state' });"
  if (source.includes('mountCourseCheckout(app,'))
    return source.replace(/mountCourseCheckout\(app, .*?\);/, mount)
  if (!source.includes('app.listen(PORT,'))
    throw new Error('Unexpected university server entry point')
  return (
    "import { mountCourseCheckout } from './checkout-extension/server/course-checkout.js';\n" +
    source.replace('app.listen(PORT,', mount + '\n\napp.listen(PORT,')
  )
})
// Ship the reviewed, locked versions so a fresh university ZIP receives the same fixes.
for (const file of ['package.json', 'package-lock.json']) {
  const reviewed = await readFile(resolve(root, 'docker/course-api', file), 'utf8')
  await update('auth/' + file, () => reviewed)
}
await update('auth/Dockerfile', (source) => {
  if (source.includes('COPY checkout-extension')) return source
  if (!source.includes('COPY server.js ./')) throw new Error('Unexpected university Dockerfile')
  return source.replace(
    'COPY server.js ./',
    'COPY server.js ./\nCOPY checkout-extension ./checkout-extension',
  )
})
await writeFile(
  resolve(course, '.checkout.env'),
  'CHECKOUT_PAYMENT_SECRET=' + randomBytes(48).toString('hex') + '\n',
  { flag: 'wx' },
).catch((error) => {
  if (error.code !== 'EEXIST') throw error
})
await update('compose.yml', (source) => {
  if (!source.includes('  auth:')) throw new Error('No auth service in course Compose')
  if (!source.includes('.checkout.env'))
    source = source.replace('  auth:', '  auth:\n    env_file:\n      - .checkout.env')
  if (!source.includes('/app/checkout-state'))
    source = source.replace(
      '  auth:',
      '  auth:\n    volumes:\n      - ./checkout-state.local:/app/checkout-state',
    )
  return source
})
await mkdir(resolve(course, 'checkout-state.local'), { recursive: true })
console.log(
  'Checkout staged with a persistent private receipt directory. Rebuild only the existing auth service. No SQL migration or schema change is needed.',
)
