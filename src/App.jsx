import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import { Login, Registration } from './pages/AuthPages.jsx'
import { AdminLogin } from './pages/AdminLogin.jsx'
import { AdminDashboard, EmployeeDashboard } from './pages/Dashboards.jsx'

export default function App() {
  return <Routes><Route element={<Layout />}>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/register" element={<Registration />} />
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/employee" element={<EmployeeDashboard />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes>
}
