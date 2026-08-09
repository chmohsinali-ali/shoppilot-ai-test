import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ReactNode } from 'react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { ThemeProvider } from '@/lib/theme';
import { ToastProvider } from '@/components/ui/Toast';
import { AppLayout } from '@/components/AppLayout';
import { PageLoader } from '@/components/ui/EmptyState';
import { LoginPage } from '@/pages/LoginPage';
import { SignupPage } from '@/pages/SignupPage';
import { OnboardingPage } from '@/pages/OnboardingPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { CustomersPage } from '@/pages/CustomersPage';
import { CustomerDetailPage } from '@/pages/CustomerDetailPage';
import { ProductsPage } from '@/pages/ProductsPage';
import { SalesPage } from '@/pages/SalesPage';
import { NewSalePage } from '@/pages/NewSalePage';
import { SaleDetailPage } from '@/pages/SaleDetailPage';
import { AssistantPage } from '@/pages/AssistantPage';
import { ExpensesPage } from '@/pages/ExpensesPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { SuppliersPage } from '@/pages/SuppliersPage';
import { SupplierDetailPage } from '@/pages/SupplierDetailPage';
import { PurchasesPage } from '@/pages/PurchasesPage';
import { NewPurchasePage } from '@/pages/NewPurchasePage';
import { PurchaseDetailPage } from '@/pages/PurchaseDetailPage';
import { ReturnsPage } from '@/pages/ReturnsPage';
import { WarrantyPage } from '@/pages/WarrantyPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { UsersPage } from '@/pages/UsersPage';
import { DailyClosingPage } from '@/pages/DailyClosingPage';

function ProtectedRoute({ children }: { children: ReactNode }) {
  const { user, loading, shop, shopLoading } = useAuth();
  if (loading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (shopLoading) return <PageLoader />;
  if (!shop) return <Navigate to="/onboarding" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function PublicRoute({ children }: { children: ReactNode }) {
  const { user, loading, shop } = useAuth();
  if (loading) return <PageLoader />;
  if (user && shop) return <Navigate to="/" replace />;
  if (user && !shop) return <Navigate to="/onboarding" replace />;
  return <>{children}</>;
}

function OnboardingRoute({ children }: { children: ReactNode }) {
  const { user, loading, shop, shopLoading } = useAuth();
  if (loading || shopLoading) return <PageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  if (shop) return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
              <Route path="/signup" element={<PublicRoute><SignupPage /></PublicRoute>} />
              <Route path="/onboarding" element={<OnboardingRoute><OnboardingPage /></OnboardingRoute>} />

              <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/customers" element={<ProtectedRoute><CustomersPage /></ProtectedRoute>} />
              <Route path="/customers/:id" element={<ProtectedRoute><CustomerDetailPage /></ProtectedRoute>} />
              <Route path="/products" element={<ProtectedRoute><ProductsPage /></ProtectedRoute>} />
              <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
              <Route path="/sales/new" element={<ProtectedRoute><NewSalePage /></ProtectedRoute>} />
              <Route path="/sales/:id" element={<ProtectedRoute><SaleDetailPage /></ProtectedRoute>} />
              <Route path="/assistant" element={<ProtectedRoute><AssistantPage /></ProtectedRoute>} />
              <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
              <Route path="/suppliers" element={<ProtectedRoute><SuppliersPage /></ProtectedRoute>} />
              <Route path="/suppliers/:id" element={<ProtectedRoute><SupplierDetailPage /></ProtectedRoute>} />
              <Route path="/purchases" element={<ProtectedRoute><PurchasesPage /></ProtectedRoute>} />
              <Route path="/purchases/new" element={<ProtectedRoute><NewPurchasePage /></ProtectedRoute>} />
              <Route path="/purchases/:id" element={<ProtectedRoute><PurchaseDetailPage /></ProtectedRoute>} />
              <Route path="/returns" element={<ProtectedRoute><ReturnsPage /></ProtectedRoute>} />
              <Route path="/warranty" element={<ProtectedRoute><WarrantyPage /></ProtectedRoute>} />
              <Route path="/reports" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
              <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
              <Route path="/users" element={<ProtectedRoute><UsersPage /></ProtectedRoute>} />
              <Route path="/daily-closing" element={<ProtectedRoute><DailyClosingPage /></ProtectedRoute>} />
              <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  );
}
