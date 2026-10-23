import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import { Login, Registration } from './pages/AuthPages.jsx'
import { AdminLogin, EmployeeLogin } from './pages/AdminLogin.jsx'
import AccountPage from './pages/AccountPage.jsx'
import StaffLayout from './pages/staff/StaffLayout.jsx'
import DashboardPage from './pages/staff/DashboardPage.jsx'
import ProductManagementPage from './pages/staff/ProductManagementPage.jsx'
import UserManagementPage from './pages/staff/UserManagementPage.jsx'
import TestConnection from "./TestConnection";

export default function App() {
  return <Routes><Route element={<Layout />}>
    <Route path="/" element={<Home />} />
    <Route path="/login" element={<Login />} />
    <Route path="/admin/login" element={<AdminLogin />} />
    <Route path="/employee/login" element={<EmployeeLogin />} />
    <Route path="/register" element={<Registration />} />
    <Route path="/account" element={<AccountPage />} />
    <Route path="/admin" element={<StaffLayout requiredRole="admin" />}>
      <Route index element={<DashboardPage />} />
      <Route path="products" element={<ProductManagementPage />} />
      <Route path="users" element={<UserManagementPage />} />
    </Route>
    <Route path="/employee" element={<StaffLayout requiredRole="employee" />}>
      <Route index element={<DashboardPage />} />
      <Route path="products" element={<ProductManagementPage />} />
    </Route>
    <Route path="/test-connection" element={<TestConnection />} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Route></Routes> 
}
