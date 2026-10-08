import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import Home from './pages/Home.jsx'
import Products from './pages/Products.jsx'
import ProductDetails from './pages/ProductDetails.jsx'
import Cart from './pages/Cart.jsx'
import { Login, Registration } from './pages/AuthPages.jsx'
import CustomerProfile from './pages/CustomerProfile.jsx'
import { AdminDashboard, EmployeeDashboard, ProductManagement, UserManagement } from './pages/Dashboards.jsx'
import NotFound from './pages/NotFound.jsx'
import AccountRoute from './auth/AccountRoute.jsx'

export default function App() {
  return <Routes><Route element={<Layout />}>
    <Route path="/" element={<Home />} />
    <Route path="/products" element={<Products />} />
    <Route path="/products/:productId" element={<ProductDetails />} />
    <Route path="/cart" element={<Cart />} />
    {/* Zehai's customer account routes start here. Other routes are shared project context. */}
    <Route path="/login" element={<AccountRoute guest><Login /></AccountRoute>} />
    <Route path="/register" element={<AccountRoute guest><Registration /></AccountRoute>} />
    <Route path="/profile" element={<AccountRoute><CustomerProfile /></AccountRoute>} />
    {/* Zehai's customer account routes stop here. */}
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/admin/products" element={<ProductManagement />} />
    <Route path="/admin/users" element={<UserManagement />} />
    <Route path="/employee" element={<EmployeeDashboard />} />
    <Route path="*" element={<NotFound />} />
  </Route></Routes>
}
