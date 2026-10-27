import axios from 'axios'

// Set VITE_API_URL in .env to point at a different backend (see .env.example).
import { apiBaseUrl } from './api-config.js'
export { apiBaseUrl } from './api-config.js'

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 15000,
  headers: {
    Accept: 'application/json',
  },
  withCredentials: true, // Send the login cookie set by POST /login
})

export default api
