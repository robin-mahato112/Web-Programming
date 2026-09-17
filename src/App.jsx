import { Route, Routes } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import ProtectedRoute from './components/ProtectedRoute.jsx'
import Home from './pages/Home.jsx'
import Products from './pages/Products.jsx'
import ProductDetails from './pages/ProductDetails.jsx'
import Cart from './pages/Cart.jsx'
import { Login, Registration } from './pages/AuthPages.jsx'
import CustomerProfile from './pages/CustomerProfile.jsx'
import { AdminDashboard, EmployeeDashboard, ProductManagement, UserManagement } from './pages/Dashboards.jsx'
import NotFound from './pages/NotFound.jsx'

export default function App() {
  return <Routes><Route element={<Layout />}>
    <Route path="/" element={<Home />} />
    <Route path="/products" element={<Products />} />
    <Route path="/products/:productId" element={<ProductDetails />} />
    <Route path="/cart" element={<Cart />} />
    {/* Zehai's code starts here: customer account routes and profile protection. */}
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Registration />} />
    <Route path="/profile" element={<ProtectedRoute><CustomerProfile /></ProtectedRoute>} />
    {/* Zehai's code stops here. */}
    <Route path="/admin" element={<AdminDashboard />} />
    <Route path="/admin/products" element={<ProductManagement />} />
    <Route path="/admin/users" element={<UserManagement />} />
    <Route path="/employee" element={<EmployeeDashboard />} />
    <Route path="*" element={<NotFound />} />
  </Route></Routes>
}
