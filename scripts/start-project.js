import { spawn } from 'node:child_process'
import { readFile, writeFile, mkdir, access } from 'node:fs/promises'
import { resolve, basename } from 'node:path'
import { createServer } from 'node:net'
import { createInterface } from 'node:readline/promises'
import { parseEnv } from 'node:util'
import { setTimeout as delay } from 'node:timers/promises'
import {
  apiAddress,
  combinedOrigins,
  frontendPort,
  selectProject,
  verifyCatalogue,
} from './start-project-config.js'

const root = resolve(import.meta.dirname, '..')
const runtime = resolve(root, process.env.PROJECT_RUNTIME_DIRECTORY || '.runtime.local')
const settingsPath = resolve(runtime, 'settings.json')
const overridePath = resolve(runtime, 'frontend.compose.json')
const args = new Set(process.argv.slice(2))
const checkOnly = args.has('--check')
const backendOnly = args.has('--backend-only')
const localMailAllowed = args.has('--allow-local-mail')

function command(executable, arguments_, { capture = false, env = process.env } = {}) {
  return new Promise((accept, reject) => {
    const child = spawn(executable, arguments_, {
      cwd: root,
      env,
      stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
    })
    let output = ''
    if (capture) {
      child.stdout.on('data', (chunk) => {
        output += chunk
      })
      // Compose configuration can contain secrets, including in error output.
      child.stderr.resume()
    }
    child.on('error', () =>
      reject(
        new Error(
          `Could not start ${basename(executable)}. Check that Node.js and Docker Desktop are installed and Docker is running.`,
        ),
      ),
    )
    child.on('exit', (code) =>
      code === 0
        ? accept(output)
        : reject(
            new Error(`${basename(executable)} failed (${code}). No database reset was attempted.`),
          ),
    )
  })
}

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if (error.code === 'ENOENT') return ''
    throw error
  }
}

async function requireFreePort(port) {
  for (const host of ['127.0.0.1', '::1']) {
    await new Promise((accept, reject) => {
      const server = createServer()
      server.once('error', (error) => {
        if (host === '::1' && ['EAFNOSUPPORT', 'EADDRNOTAVAIL'].includes(error.code)) accept()
        else
          reject(
            new Error(
              `Frontend port ${port} is occupied or unavailable. Stop the old frontend terminal with Ctrl+C, or set FRONTEND_PORT to another port and run npm start again.`,
            ),
          )
      })
      server.listen(port, host, () => server.close(accept))
    })
  }
}

async function ready(url) {
  const deadline = Date.now() + 60000
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(3000) })
      if (response.ok) return await response.json()
    } catch {
      /* Wait for the API's initial database connection. */
    }
    await delay(1000)
  }
  throw new Error(
    'The API did not become ready. Check the auth container logs and the university StoreDB installation.',
  )
}

async function waitForDatabase(composeArgs) {
  const deadline = Date.now() + 120000
  const probe =
    'export SQLCMDPASSWORD="${MSSQL_SA_PASSWORD:-$SA_PASSWORD}"; if [ -x /opt/mssql-tools18/bin/sqlcmd ]; then tool=/opt/mssql-tools18/bin/sqlcmd; else tool=/opt/mssql-tools/bin/sqlcmd; fi; "$tool" -C -S localhost -U sa -Q "SELECT 1" -b -l 3'
  while (Date.now() < deadline) {
    try {
      await command('docker', [...composeArgs, 'exec', '-T', 'db', '/bin/sh', '-c', probe], {
        capture: true,
      })
      return
    } catch {
      await delay(1500)
    }
  }
  throw new Error(
    'SQL Server did not become ready. Check the db container and its existing database credentials; no data has been reset.',
  )
}

async function main() {
  if ([...args].some((arg) => !['--check', '--backend-only', '--allow-local-mail'].includes(arg)))
    throw new Error('Supported options: --check, --backend-only, --allow-local-mail.')
  const saved = JSON.parse((await readOptional(settingsPath)) || '{}')
  let directory = process.env.COURSE_BACKEND_DIRECTORY || saved.backendDirectory
  if (!directory) {
    try {
      await access(resolve(root, 'course-backend.local/compose.yml'))
      directory = resolve(root, 'course-backend.local')
    } catch {
      /* Ask once when no standard directory is present. */
    }
  }
  if (!directory && process.stdin.isTTY && !checkOnly) {
    const prompt = createInterface({ input: process.stdin, output: process.stdout })
    try {
      directory = (
        await prompt.question(
          'Path to your extracted university v1.1 backend (the folder containing compose.yml): ',
        )
      )
        .trim()
        .replace(/^"(.*)"$/, '$1')
    } finally {
      prompt.close()
    }
  }
  if (!directory)
    throw new Error(
      'Set COURSE_BACKEND_DIRECTORY to the extracted university v1.1 backend, or run npm start in an interactive terminal and enter its path once.',
    )
  const course = resolve(directory)
  const composePath = resolve(course, 'compose.yml')
  await access(composePath)
  const source = await readFile(resolve(course, 'auth/server.js'), 'utf8')
  if (!source.includes("app.post('/patronLogin'") || !source.includes('// Data API routes'))
    throw new Error('This is not the expected university backend. No files were changed.')

  const projects = JSON.parse(
    await command('docker', ['compose', 'ls', '--all', '--format', 'json'], { capture: true }),
  )
  const requested =
    process.env.COURSE_COMPOSE_PROJECT ||
    (saved.backendDirectory === course ? saved.project : undefined)
  const selection = selectProject(projects, composePath, requested)
  const name =
    selection.name ||
    basename(course)
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .replace(/^[-_]+/, '')
  if (!name || projects.some((project) => project.Name === name && !selection.name))
    throw new Error('Cannot select a unique Docker project. Set COURSE_COMPOSE_PROJECT explicitly.')
  // Preserve every existing override, including ports, database selection and volume names.
  let composeArgs = ['compose', '-p', name, ...selection.files.flatMap((file) => ['-f', file])]
  const composeConfig = async () =>
    JSON.parse(
      await command('docker', [...composeArgs, 'config', '--format', 'json'], { capture: true }),
    )
  const config = await composeConfig()
  const api = apiAddress(config)
  const port = frontendPort(process.env.FRONTEND_PORT)
  if (!backendOnly && !checkOnly) await requireFreePort(port)
  let mail = parseEnv(await readOptional(resolve(course, '.customer.env')))
  const needsMailSetup = !mail.SMTP_HOST || !mail.SMTP_FROM
  if (needsMailSetup && (checkOnly || process.platform !== 'win32' || !process.stdin.isTTY))
    throw new Error(
      'Real email is not configured in this backend. Set its .customer.env using docs/customer-gmail-setup.md, then run npm start again. The launcher will not silently replace real email with a local inbox.',
    )
  if (mail.CUSTOMER_MAIL_MODE === 'local' && !localMailAllowed)
    throw new Error(
      'This backend captures email locally. Configure SMTP for real delivery, or explicitly use --allow-local-mail for development only.',
    )
  console.log(
    `Backend: ${course}\nDocker project: ${name}\nAPI: ${api}\nWebsite: http://localhost:${port}`,
  )
  if (checkOnly) {
    console.log(
      'Startup settings checked. No files or containers changed; email delivery and running services have not been tested.',
    )
    return
  }

  console.log('Installing the shared API extensions automatically...')
  const installEnv = { ...process.env, COURSE_BACKEND_DIRECTORY: course }
  for (const file of ['install-course-checkout.js', 'install-course-customer.js'])
    await command(process.execPath, [resolve(root, 'scripts', file)], { env: installEnv })
  if (needsMailSetup) {
    console.log(
      'One-time sender setup: enter a Gmail address and an app password in the terminal prompts. Existing configured backends skip this step.',
    )
    await command('powershell.exe', [
      '-NoProfile',
      '-File',
      resolve(root, 'scripts/Configure-CustomerGmail.ps1'),
      '-BackendDirectory',
      course,
    ])
    mail = parseEnv(await readFile(resolve(course, '.customer.env'), 'utf8'))
  }
  await mkdir(runtime, { recursive: true })
  const updated = await composeConfig()
  await writeFile(
    overridePath,
    JSON.stringify(
      {
        services: {
          auth: {
            environment: {
              CORS_ORIGINS: combinedOrigins(updated.services.auth.environment?.CORS_ORIGINS, port),
            },
          },
        },
      },
      null,
      2,
    ) + '\n',
  )
  if (!selection.files.includes(overridePath)) composeArgs = [...composeArgs, '-f', overridePath]
  await writeFile(
    settingsPath,
    JSON.stringify({ backendDirectory: course, project: name }, null, 2) + '\n',
  )

  console.log('Starting the existing database without recreating it...')
  const dependencies = ['db']
  if (mail.CUSTOMER_MAIL_MODE === 'local' && updated.services.mailpit) dependencies.push('mailpit')
  await command('docker', [
    ...composeArgs,
    'up',
    '-d',
    '--no-recreate',
    '--wait',
    '--wait-timeout',
    '180',
    ...dependencies,
  ])
  console.log('Waiting for SQL Server to accept connections...')
  await waitForDatabase(composeArgs)
  console.log('Building and starting the API; database files and volumes are retained...')
  await command('docker', [...composeArgs, 'up', '-d', '--no-deps', '--build', 'auth'])
  await ready(`${api}/api/products`)
  await verifyCatalogue(api)
  const recovery = await ready(`${api}/api/customer/recovery`)
  if (!recovery.enabled || (recovery.delivery !== 'email' && !localMailAllowed))
    throw new Error('The running API has not enabled the requested email delivery mode.')
  await command('docker', [
    ...composeArgs,
    'exec',
    '-T',
    'auth',
    'node',
    '--input-type=module',
    '-e',
    "import {createCustomerMailer} from './customer-extension/server/customer-mail.js'; try { const m=createCustomerMailer(); if(!m) throw Error(); await m.verify(); console.log('Mail server connection and authentication verified (no email sent).'); } catch { console.error('Mail connection failed. Check the server-only SMTP configuration.'); process.exitCode=1; }",
  ])
  console.log(
    `API and catalogue are ready. Recovery delivery: ${recovery.delivery}. Payments remain simulated.`,
  )
  if (backendOnly) return
  console.log(
    'Starting the website. Ctrl+C stops the frontend; Docker services keep running for the team.',
  )
  await command(
    process.execPath,
    [resolve(root, 'node_modules/vite/bin/vite.js'), '--host', 'localhost', '--port', String(port)],
    { env: { ...process.env, VITE_API_URL: api, VITE_CATALOGUE_SOURCE: 'course-2026' } },
  )
}

main().catch((error) => {
  console.error(`Startup stopped: ${error.message}`)
  process.exitCode = 1
})
