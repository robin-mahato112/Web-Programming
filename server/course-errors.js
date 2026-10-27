/** Parser/CORS failures must not let Express print request bodies or return secret-bearing errors. */
export function courseRequestError(error, _req, res, next) {
  console.error('University API request failed.')
  if (res.headersSent) return next(new Error('University API request failed.'))
  const status =
    Number.isInteger(error.status) && error.status >= 400 && error.status < 600 ? error.status : 500
  res.status(status).json({ error: status < 500 ? 'Invalid request.' : 'Server error.' })
}
