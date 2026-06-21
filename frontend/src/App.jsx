import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import useAuthStore from './store/authStore';

import AdminLayout  from './components/layout/AdminLayout';
import StaffLayout  from './components/layout/StaffLayout';
import SalesLayout  from './components/layout/SalesLayout';

import LoginPage          from './pages/auth/LoginPage';
import VerifyEmailPage    from './pages/auth/VerifyEmailPage';
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage';
import ResetPasswordPage  from './pages/auth/ResetPasswordPage';
import OAuthCallback      from './pages/auth/OAuthCallback';

import Dashboard  from './pages/admin/Dashboard';
import Farmers    from './pages/admin/Farmers';
import MilkAdmin  from './pages/admin/MilkAdmin';
import Billing    from './pages/admin/Billing';
import Sales      from './pages/admin/Sales';
import Vehicles   from './pages/admin/Vehicles';
import Shops      from './pages/admin/Shops';
import HRPayroll  from './pages/admin/HRPayroll';
import Expenses   from './pages/admin/Expenses';
import Reports    from './pages/admin/Reports';
import AuditLogs  from './pages/admin/AuditLogs';
import Settings   from './pages/admin/Settings';
import Customers  from './pages/admin/Customers';
import Products   from './pages/admin/Products';
import Invoices   from './pages/admin/Invoices';
import WalkIn     from './pages/admin/WalkIn';

import StaffDashboard from './pages/staff/StaffDashboard';
import MilkEntry      from './pages/staff/MilkEntry';
import MilkHistory    from './pages/staff/MilkHistory';
import SalesDashboard from './pages/staff/SalesDashboard';
import SalesEntry     from './pages/staff/SalesEntry';
import SalesHistory   from './pages/staff/SalesHistory';

function RequireAuth({ children, adminOnly = false, dept = null }) {
  const { isLoggedIn, isLoading, user } = useAuthStore();
  if (isLoading) return <PageSpinner />;
  // Redirect to portal-specific login if not logged in
  if (!isLoggedIn) {
    const path = window.location.pathname;
    if (path.startsWith('/sales'))    return <Navigate to="/sales/login" replace />;
    if (path.startsWith('/staff') || path.startsWith('/purchase')) return <Navigate to="/purchase/login" replace />;
    return <Navigate to="/admin/login" replace />;
  }
  // Admin-only routes
  if (adminOnly && user?.role !== 'admin') {
    return <Navigate to={user?.department === 'sales' ? '/sales' : '/staff'} replace />;
  }
  // Department-specific routes — block wrong-dept staff
  if (dept && user?.role !== 'admin' && user?.department !== dept) {
    return <Navigate to={user?.department === 'sales' ? '/sales' : '/staff'} replace />;
  }
  return children;
}

function PageSpinner() {
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center">
      <div className="w-10 h-10 border-4 border-brand-500 border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

export default function App() {
  const init = useAuthStore(s => s.init);
  useEffect(() => { init(); }, []);

  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155' },
          success: { iconTheme: { primary: '#10b981', secondary: '#1e293b' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#1e293b' } },
        }}
      />
      <Routes>
        {/* Public */}
        <Route path="/login"           element={<LoginPage portal="admin" />} />
        <Route path="/admin/login"      element={<LoginPage portal="admin" />} />
        <Route path="/sales/login"      element={<LoginPage portal="sales" />} />
        <Route path="/purchase/login"   element={<LoginPage portal="purchase" />} />
        <Route path="/verify-email"    element={<VerifyEmailPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password"  element={<ResetPasswordPage />} />
        <Route path="/oauth-callback"  element={<OAuthCallback />} />

        {/* Admin */}
        <Route path="/admin" element={<RequireAuth adminOnly><AdminLayout /></RequireAuth>}>
          <Route index             element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard"  element={<Dashboard />} />
          <Route path="farmers"    element={<Farmers />} />
          <Route path="milk"       element={<MilkAdmin />} />
          <Route path="billing"    element={<Billing />} />
          <Route path="sales"      element={<Sales />} />
          <Route path="vehicles"   element={<Vehicles />} />
          <Route path="shops"      element={<Shops />} />
          <Route path="hr"         element={<HRPayroll />} />
          <Route path="expenses"   element={<Expenses />} />
          <Route path="reports"    element={<Reports />} />
          <Route path="audit"      element={<AuditLogs />} />
          <Route path="settings"   element={<Settings />} />
          <Route path="customers"  element={<Customers />} />
          <Route path="products"   element={<Products />} />
          <Route path="invoices"   element={<Invoices />} />
          <Route path="walkin"     element={<WalkIn />} />
        </Route>

        {/* Purchase staff — milk collection */}
        <Route path="/staff" element={<RequireAuth dept="purchase"><StaffLayout /></RequireAuth>}>
          <Route index         element={<StaffDashboard />} />
          <Route path="milk"   element={<MilkEntry />} />
          <Route path="history" element={<MilkHistory />} />
        </Route>

        {/* Sales staff — walk-in sales */}
        <Route path="/sales" element={<RequireAuth dept="sales"><SalesLayout /></RequireAuth>}>
          <Route index          element={<SalesDashboard />} />
          <Route path="entry"   element={<SalesEntry />} />
          <Route path="history" element={<SalesHistory />} />
        </Route>

        <Route path="/"  element={<RootRedirect />} />
        <Route path="*"  element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function RootRedirect() {
  const { isLoggedIn, user, isLoading } = useAuthStore();
  if (isLoading) return <PageSpinner />;
  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (user?.role === 'admin') return <Navigate to="/admin/dashboard" replace />;
  if (user?.department === 'sales') return <Navigate to="/sales" replace />;
  return <Navigate to="/staff" replace />;
}
