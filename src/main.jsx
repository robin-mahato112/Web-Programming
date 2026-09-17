import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import CustomerAuthProvider from './auth/CustomerAuthProvider.jsx'
import './styles.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      {/* Zehai's code starts here: provide customer session state to the application. */}
      <CustomerAuthProvider><App /></CustomerAuthProvider>
      {/* Zehai's code stops here. */}
    </BrowserRouter>
  </StrictMode>,
)
