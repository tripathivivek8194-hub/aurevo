import { lazy, Suspense } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Skeleton } from '@aurevo/design-system';
import { RequireAdmin } from './guards/RequireAdmin';
import { RequireAuth } from './guards/RequireAuth';
import { AdminLayout } from './layouts/admin/AdminLayout';
import { StoreLayout } from './layouts/store/StoreLayout';

/* ------------------------------------------------------------------ */
/*  Lazy-loaded pages (code-split by route)                           */
/* ------------------------------------------------------------------ */

/* Customer storefront pages */
const Home = lazy(() => import('./pages/store/Home').then((m) => ({ default: m.Home })));
const StoreProducts = lazy(() => import('./pages/store/Products').then((m) => ({ default: m.Products })));
const ProductDetail = lazy(() => import('./pages/store/ProductDetail').then((m) => ({ default: m.ProductDetail })));
const StoreLogin = lazy(() => import('./pages/store/Login').then((m) => ({ default: m.Login })));
const Register = lazy(() => import('./pages/store/Register').then((m) => ({ default: m.Register })));
const ForgotPassword = lazy(() => import('./pages/store/ForgotPassword').then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import('./pages/store/ResetPassword').then((m) => ({ default: m.ResetPassword })));
const VerifyEmail = lazy(() => import('./pages/store/VerifyEmail').then((m) => ({ default: m.VerifyEmail })));
const Cart = lazy(() => import('./pages/store/Cart').then((m) => ({ default: m.Cart })));
const Checkout = lazy(() => import('./pages/store/Checkout').then((m) => ({ default: m.Checkout })));
const OrderConfirmation = lazy(() => import('./pages/store/OrderConfirmation').then((m) => ({ default: m.OrderConfirmation })));
const Account = lazy(() => import('./pages/store/Account').then((m) => ({ default: m.Account })));
const MyOrders = lazy(() => import('./pages/store/MyOrders').then((m) => ({ default: m.MyOrders })));
const OrderDetail = lazy(() => import('./pages/store/OrderDetail').then((m) => ({ default: m.OrderDetail })));
const Wishlist = lazy(() => import('./pages/store/Wishlist').then((m) => ({ default: m.Wishlist })));
const StoreInfo = lazy(() => import('./pages/store/StoreInfo').then((m) => ({ default: m.StoreInfo })));
const Contact = lazy(() => import('./pages/store/Contact').then((m) => ({ default: m.Contact })));
const About = lazy(() => import('./pages/store/About').then((m) => ({ default: m.About })));

/* Admin pages */
const Dashboard = lazy(() => import('./pages/admin/Dashboard').then((m) => ({ default: m.Dashboard })));
const AdminOrders = lazy(() => import('./pages/admin/Orders').then((m) => ({ default: m.Orders })));
const AdminProducts = lazy(() => import('./pages/admin/Products').then((m) => ({ default: m.Products })));
const Customers = lazy(() => import('./pages/admin/Customers').then((m) => ({ default: m.Customers })));
const Suppliers = lazy(() => import('./pages/admin/Suppliers').then((m) => ({ default: m.Suppliers })));
const Categories = lazy(() => import('./pages/admin/Categories').then((m) => ({ default: m.Categories })));
const Inventory = lazy(() => import('./pages/admin/Inventory').then((m) => ({ default: m.Inventory })));
const Reviews = lazy(() => import('./pages/admin/Reviews').then((m) => ({ default: m.Reviews })));
const Support = lazy(() => import('./pages/admin/Support').then((m) => ({ default: m.Support })));
const Analytics = lazy(() => import('./pages/admin/Analytics').then((m) => ({ default: m.Analytics })));
const Settings = lazy(() => import('./pages/admin/Settings').then((m) => ({ default: m.Settings })));
const NotFound = lazy(() => import('./pages/NotFound').then((m) => ({ default: m.NotFound })));

/** Suspense fallback shown while a lazy page chunk loads. */
function PageFallback() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 py-8 space-y-4">
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}

export function AppRouter() {
  return (
    <BrowserRouter>
      <Suspense fallback={<PageFallback />}>
        <Routes>
          {/* ---- Customer-facing storefront ---- */}
          <Route element={<StoreLayout />}>
            <Route index element={<Home />} />
            <Route path="products" element={<StoreProducts />} />
            <Route path="products/:slug" element={<ProductDetail />} />
            <Route path="login" element={<StoreLogin />} />
            <Route path="register" element={<Register />} />
            <Route path="forgot-password" element={<ForgotPassword />} />
            <Route path="reset-password" element={<ResetPassword />} />
            <Route path="verify-email" element={<VerifyEmail />} />

            {/* Guest or authenticated — cart & checkout use OptionalJwtAuthGuard */}
            <Route path="cart" element={<Cart />} />
            <Route path="checkout" element={<Checkout />} />
            <Route path="order-confirmation" element={<OrderConfirmation />} />
            <Route path="help/:page" element={<StoreInfo />} />
            <Route path="contact" element={<Contact />} />
            <Route path="about" element={<About />} />

            {/* Authenticated-only account routes */}
            <Route element={<RequireAuth />}>
              <Route path="account" element={<Account />} />
              <Route path="account/orders" element={<MyOrders />} />
              <Route path="account/orders/:id" element={<OrderDetail />} />
              <Route path="account/wishlist" element={<Wishlist />} />
            </Route>
          </Route>

          {/* ---- Admin area ---- */}
          <Route element={<RequireAdmin />}>
            <Route element={<AdminLayout />}>
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/orders" element={<AdminOrders />} />
              <Route path="/admin/products" element={<AdminProducts />} />
              <Route path="/admin/customers" element={<Customers />} />
              <Route path="/admin/suppliers" element={<Suppliers />} />
              <Route path="/admin/reviews" element={<Reviews />} />
              <Route path="/admin/support" element={<Support />} />
              <Route path="/admin/categories" element={<Categories />} />
              <Route path="/admin/analytics" element={<Analytics />} />
              <Route path="/admin/inventory" element={<Inventory />} />
              <Route path="/admin/settings" element={<Settings />} />
            </Route>
          </Route>

          {/* ---- Catch-all: custom 404 page ---- */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}
