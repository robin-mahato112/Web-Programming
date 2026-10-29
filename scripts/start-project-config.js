import { resolve, normalize } from 'node:path'

export function samePath(left, right) {
  const key = (value) => {
    const path = normalize(resolve(value))
    return process.platform === 'win32' ? path.toLowerCase() : path
  }
  return key(left) === key(right)
}

export function selectProject(projects, composePath, requested) {
  const matching = projects.filter((project) =>
    project.ConfigFiles.split(',').some((file) => samePath(file.trim(), composePath)),
  )
  if (matching.length > 1 && !requested)
    throw new Error(
      'Several Docker projects use this backend. Select one explicitly with COURSE_COMPOSE_PROJECT.',
    )
  const existing = matching.find((project) => project.Name === requested) || matching[0]
  if (existing && requested && existing.Name !== requested)
    throw new Error(
      'The selected project differs from the existing database project. Nothing was started.',
    )
  const name = existing?.Name || requested
  if (name && projects.some((project) => project.Name === name && project !== existing))
    throw new Error(
      'That Docker project belongs to another backend. Choose a different project name.',
    )
  return {
    name,
    files: existing ? existing.ConfigFiles.split(',').map((file) => file.trim()) : [composePath],
  }
}

export function apiAddress(config) {
  if (!config.services?.auth || !config.services?.db)
    throw new Error('The university Compose file must contain auth and db services.')
  const mappedPorts =
    config.services.auth.ports?.filter(
      (port) => Number(port.target) === 3001 && (!port.protocol || port.protocol === 'tcp'),
    ) || []
  const loopbackPorts = mappedPorts.filter((port) => ['127.0.0.1', '::1'].includes(port.host_ip))
  const ports = loopbackPorts.length ? loopbackPorts : mappedPorts
  if (ports.length !== 1 || !/^\d+$/.test(String(ports[0].published)))
    throw new Error('The auth service needs one fixed host port mapped to container port 3001.')
  if (ports[0].host_ip && !['0.0.0.0', '127.0.0.1', '::', '::1'].includes(ports[0].host_ip))
    throw new Error('This launcher expects the course API to be available on localhost.')
  return `http://localhost:${ports[0].published}`
}

export function frontendPort(value = 3000) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw new Error('FRONTEND_PORT must be a port between 1024 and 65535.')
  return port
}

export function combinedOrigins(existing, port) {
  return [
    ...new Set([
      ...String(existing || '')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`,
    ]),
  ].join(',')
}

export async function verifyCatalogue(api, fetcher = fetch) {
  for (const table of ['Product', 'Stocktake', 'Genre', 'BookGenre', 'MovieGenre', 'GameGenre']) {
    const response = await fetcher(`${api}/api/inft3050/${table}?limit=1`, {
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok)
      throw new Error(
        `The course database cannot serve ${table}. Use the complete university StoreDB before starting the website.`,
      )
    await response.arrayBuffer()
  }
}
