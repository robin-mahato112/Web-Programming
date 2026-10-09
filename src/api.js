import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:3001",
  headers: {
    Accept: "application/json",
  },
  withCredentials: true, // Equivalent to credentials: "include"
});

export default api;