import { Navigate, Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import NotFound from './pages/NotFound.jsx'
import Home from './pages/Home.jsx'
import { Login, Registration } from './pages/AuthPages.jsx'
import { AdminLogin } from './pages/AdminLogin.jsx'
import AccountPage from './pages/AccountPage.jsx'
import StaffLayout from './pages/staff/StaffLayout.jsx'
import DashboardPage from './pages/staff/DashboardPage.jsx'
import ProductManagementPage from './pages/staff/ProductManagementPage.jsx'
import UserManagementPage from './pages/staff/UserManagementPage.jsx'
import Products from './pages/Products.jsx'
import ProductDetails from './pages/ProductDetails.jsx'
import Cart from './pages/Cart.jsx'
import CheckoutRoute from './components/CheckoutRoute.jsx'
import ForgotPassword from './pages/ForgotPassword.jsx'
import Stock from './pages/Stock.jsx'
import TestConnection from './TestConnection'

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route path="/products" element={<Products />} />
        <Route path="/products/:productId" element={<ProductDetails />} />
        <Route path="/cart" element={<Cart />} />
        <Route path="/checkout" element={<CheckoutRoute />} />
        <Route path="/checkout/confirmation/:attemptId" element={<CheckoutRoute />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/admin/stock" element={<Stock />} />
        <Route path="/login" element={<Login />} />
        <Route path="/admin/login" element={<AdminLogin />} />
        <Route path="/register" element={<Registration />} />
        <Route path="/profile" element={<Navigate to="/account" replace />} />
        <Route path="/employee/login" element={<AdminLogin />} />
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
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
