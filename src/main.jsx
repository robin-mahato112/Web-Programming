import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import CustomerAuthProvider from './auth/CustomerAuthProvider.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <CustomerAuthProvider><App /></CustomerAuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
