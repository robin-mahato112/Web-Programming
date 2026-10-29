import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import {
  installCustomerCompose,
  installCustomerDockerfile,
  installCustomerSource,
} from './customer-api-install.js'

const root = resolve(import.meta.dirname, '..')
if (!process.env.COURSE_BACKEND_DIRECTORY)
  throw new Error('Set COURSE_BACKEND_DIRECTORY explicitly.')
const course = resolve(process.env.COURSE_BACKEND_DIRECTORY)
const changes = []
for (const [file, transform] of [
  ['auth/server.js', installCustomerSource],
  ['auth/Dockerfile', installCustomerDockerfile],
  ['compose.yml', installCustomerCompose],
]) {
  const original = await readFile(resolve(course, file), 'utf8')
  changes.push({ file, original, changed: transform(original) })
}
const extension = resolve(course, 'auth/customer-extension')
for (const file of [
  'server/course-customer-accounts.js',
  'server/customer-identity.js',
  'server/customer-mail.js',
  'src/data/customerEmail.js',
]) {
  const target = resolve(extension, file)
  await mkdir(dirname(target), { recursive: true })
  await copyFile(resolve(root, file), target)
}
for (const file of ['package.json', 'package-lock.json'])
  await copyFile(resolve(root, 'docker/customer-api', file), resolve(extension, file))
for (const { file, original, changed } of changes) {
  if (original === changed) continue
  await writeFile(resolve(course, file + '.before-customer'), original, { flag: 'wx' }).catch(
    (error) => {
      if (error.code !== 'EEXIST') throw error
    },
  )
  await writeFile(resolve(course, file), changed)
}
await writeFile(
  resolve(course, '.customer.env'),
  '# Server-only settings. Empty SMTP configuration disables email recovery honestly.\nCUSTOMER_MAIL_MODE=smtp\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_FROM=\nSMTP_USER=\nSMTP_PASSWORD=\n',
  { flag: 'wx' },
).catch((error) => {
  if (error.code !== 'EEXIST') throw error
})
console.log(
  'Customer extension staged. Configure .customer.env, then rebuild auth only. Existing customer sessions need one new sign-in. Database and teammate endpoints are preserved.',
)
