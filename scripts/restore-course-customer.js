import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { restoreCourseCustomerSource } from './customer-api-install.js'

if (!process.env.COURSE_BACKEND_DIRECTORY)
  throw new Error('Set COURSE_BACKEND_DIRECTORY to the existing backend directory.')
const root = resolve(process.env.COURSE_BACKEND_DIRECTORY)
const path = resolve(root, 'auth/server.js')
const original = await readFile(path, 'utf8')
const backup = original.includes('mountCourseCustomerAccounts(app,')
  ? await readFile(resolve(root, 'auth/server.js.before-customer'), 'utf8')
  : original
const restored = restoreCourseCustomerSource(original, backup)
if (restored === original.replace(/\r\n/g, '\n')) {
  console.log('Original course customer routes are already active. No files changed.')
} else if (!process.argv.includes('--apply')) {
  console.log(
    'Validated restoration of original customer routes. Run with --apply to save it; no files changed.',
  )
} else {
  await writeFile(path + '.before-course-restore.local', original, { flag: 'wx' }).catch(
    (error) => {
      if (error.code !== 'EEXIST') throw error
    },
  )
  await writeFile(path, restored)
  console.log(
    'Original course customer routes restored. Rebuild auth only using the existing Compose project. Database, SMTP settings and teammate route implementations are unchanged.',
  )
}
