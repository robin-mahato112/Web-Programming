// One public origin for account, administration and shopping requests.
export const apiBaseUrl =
  import.meta.env?.VITE_API_URL || import.meta.env?.VITE_COURSE_API_URL || 'http://localhost:13001'
export const apiUrl = (path) => apiBaseUrl.replace(/\/$/, '') + '/' + path.replace(/^\//, '')
