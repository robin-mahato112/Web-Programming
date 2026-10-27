import { Buffer } from 'node:buffer'

export function sendJson(res, status, body) {
  if (res.headersSent) return
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(body))
}

/**
 * Read at most 16 KiB of UTF-8 JSON. Invalid input receives its HTTP error here
 * and resolves undefined; successful reads return the parsed, still-untrusted value.
 * Counting bytes prevents multibyte text from bypassing the body limit.
 */
export function readJson(req, res) {
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    sendJson(res, 415, { error: 'Send the request as application/json.' })
    return Promise.resolve(undefined)
  }
  return new Promise((resolve) => {
    let body = ''
    let size = 0
    const fail = (status, error) => {
      sendJson(res, status, { error })
      resolve(undefined)
    }
    req.setEncoding('utf8')
    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk)
      if (size > 16 * 1024) {
        body = ''
        fail(413, 'The request is too large.')
      } else body += chunk
    })
    req.on('error', () => fail(400, 'Could not read the request.'))
    req.on('end', () => {
      if (size > 16 * 1024 || res.headersSent) return
      try {
        resolve(JSON.parse(body))
      } catch {
        fail(400, 'Send valid JSON.')
      }
    })
  })
}
