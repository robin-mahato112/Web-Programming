// AI-assisted: refuse unknown upstream layouts and keep installation repeatable.
const imports = `import { mountCourseCustomerAccounts } from './customer-extension/server/course-customer-accounts.js';
import { fingerprint } from './customer-extension/server/customer-identity.js';
import { createCustomerMailer } from './customer-extension/server/customer-mail.js';
`
const mount = `mountCourseCustomerAccounts(app, {
  database: { getPool: () => poolPromise }, requireAuth, origins, signToken,
  verifyToken: (token) => jwt.verify(token, JWT_SECRET),
  mailer: createCustomerMailer(), production: NODE_ENV === 'production', expiresIn: JWT_EXPIRES
});

`
export function installCustomerSource(source) {
  if (source.includes('mountCourseCustomerAccounts(app,')) return source
  const login =
    'const tokenPayload = { sub: patron.UserID, email: patron.Email, username: patron.Name, role };'
  const start = source.indexOf('// Request a password reset - generates a token and returns it')
  const end = source.indexOf("app.get('/me', requireAuth", start)
  if (
    !source.includes('// Data API routes') ||
    !source.includes(login) ||
    start < 0 ||
    end <= start
  )
    throw new Error(
      'Unrecognised course backend. Review its routing before installing customer accounts.',
    )
  source =
    source.slice(0, start) +
    '// Customer recovery is handled by the customer extension above.\n' +
    source.slice(end)
  source = source.replace(
    login,
    login.replace('role };', 'role, accountVersion: fingerprint(patron) };'),
  )
  return imports + source.replace('// Data API routes', mount + '// Data API routes')
}
export function installCustomerDockerfile(source) {
  if (source.includes('COPY customer-extension')) return source
  if (!source.includes('COPY server.js ./')) throw new Error('Unrecognised course Dockerfile')
  return source.replace(
    'COPY server.js ./',
    'COPY server.js ./\nCOPY customer-extension ./customer-extension\nRUN npm ci --prefix customer-extension --omit=dev',
  )
}
export function installCustomerCompose(source) {
  if (!source.includes('  auth:')) throw new Error('No auth service in course Compose')
  if (!source.includes('.checkout.env'))
    throw new Error('Install the team checkout extension first')
  return source.includes('.customer.env')
    ? source
    : source.replace('- .checkout.env', '- .checkout.env\n      - .customer.env')
}
