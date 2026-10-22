import axios from "axios";

// Set VITE_API_URL in .env to point at a different backend (see .env.example).
export const apiBaseUrl = import.meta.env.VITE_API_URL || "http://localhost:3001";

const api = axios.create({
  baseURL: apiBaseUrl,
  headers: {
    Accept: "application/json",
  },
  withCredentials: true, // Send the login cookie set by POST /login
});

export default api;
