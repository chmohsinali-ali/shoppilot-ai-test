import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Sparkles,
  Users,
  Package,
  ShoppingCart,
  Receipt,
  Settings,
  LogOut,
  Store,
  Moon,
  Sun,
  Truck,
  ShoppingBag,
  RotateCcw,
  Shield,
  BarChart3,
  Bell,
  UserCog,
  CalendarClock,
  MoreHorizontal,
  X,
} from 'lucide-react';
import { ReactNode, useState, useMemo, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { useTheme } from '@/lib/theme';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, perm: 'dashboard.view' },
  { to: '/assistant', label: 'AI Assistant', icon: Sparkles, perm: null },
  { to: '/customers', label: 'Customers', icon: Users, perm: 'customers.view' },
  { to: '/suppliers', label: 'Suppliers', icon: Truck, perm: 'suppliers.view' },
  { to: '/products', label: 'Products', icon: Package, perm: 'products.view' },
  { to: '/sales', label: 'Sales', icon: ShoppingCart, perm: 'sales.view' },
  { to: '/purchases', label: 'Purchases', icon: ShoppingBag, perm: 'purchases.view' },
  { to: '/returns', label: 'Returns', icon: RotateCcw, perm: 'sales.view' },
  { to: '/expenses', label: 'Expenses', icon: Receipt, perm: 'expenses.view' },
  { to: '/warranty', label: 'Warranty', icon: Shield, perm: 'warranties.view' },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
  { to: '/notifications', label: 'Notifications', icon: Bell, perm: 'notifications.view' },
  { to: '/users', label: 'Users & Roles', icon: UserCog, perm: 'users.manage' },
  { to: '/settings', label: 'Settings', icon: Settings, perm: 'settings.manage' },
  { to: '/daily-closing', label: 'Daily Closing', icon: CalendarClock, perm: 'daily_closing.view' },
];

// Items always shown as bottom-nav tabs on mobile
const mobilePrimaryNav = [
  { to: '/', label: 'Home', icon: LayoutDashboard, perm: 'dashboard.view' },
  { to: '/sales', label: 'Sale', icon: ShoppingCart, perm: 'sales.view' },
  { to: '/assistant', label: 'AI', icon: Sparkles, perm: null },
  { to: '/reports', label: 'Reports', icon: BarChart3, perm: 'reports.view' },
];

// Routes considered "primary" — anything else on mobile is reached via "More"
const primaryRoutes = new Set(mobilePrimaryNav.map((i) => i.to));

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, shop, signOut, hasPermission } = useAuth();
  const { resolved, toggle } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();
  const [signingOut, setSigningOut] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleNav = useMemo(() => navItems.filter((item) => item.perm === null || hasPermission(item.perm)), [hasPermission]);
  const visiblePrimary = useMemo(() => mobilePrimaryNav.filter((item) => item.perm === null || hasPermission(item.perm)), [hasPermission]);
  const moreItems = useMemo(() => visibleNav.filter((item) => !primaryRoutes.has(item.to)), [visibleNav]);

  const handleSignOut = async () => {
    setSigningOut(true);
    await signOut();
    navigate('/login');
  };

  // Close the More sheet on navigation
  useEffect(() => { setMoreOpen(false); }, [location.pathname]);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 flex-shrink-0 border-r border-slate-200 bg-white md:flex md:flex-col dark:border-slate-800 dark:bg-slate-900">
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-100 px-5 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-sm">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-900 dark:text-slate-100">ShopPilot AI</p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">{shop?.name ?? 'Loading...'}</p>
          </div>
        </div>
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                }`
              }
            >
              <item.icon className="h-5 w-5 flex-shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-100 p-3 dark:border-slate-800">
          <button
            onClick={toggle}
            className="mb-1 flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            {resolved === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button
            onClick={handleSignOut}
            disabled={signingOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
          >
            <LogOut className="h-5 w-5" />
            Sign out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white/90 px-4 backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/90">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-blue-600 to-blue-700 text-white">
              <Store className="h-4 w-4" />
            </div>
            <span className="text-sm font-bold">ShopPilot AI</span>
          </div>
          <button
            onClick={toggle}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </header>

        <main className="flex-1 overflow-y-auto pb-20 md:pb-0">{children}</main>
      </div>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/95">
        {visiblePrimary.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                isActive
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-slate-500 dark:text-slate-400'
              }`
            }
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </NavLink>
        ))}
        {/* More button — opens overflow sheet */}
        <button
          onClick={() => setMoreOpen(true)}
          className={`flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
            moreItems.some((i) => location.pathname === i.to || location.pathname.startsWith(i.to + '/'))
              ? 'text-blue-600 dark:text-blue-400'
              : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          <MoreHorizontal className="h-5 w-5" />
          More
        </button>
      </nav>

      {/* Mobile "More" overflow sheet */}
      {moreOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div
            className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm"
            onClick={() => setMoreOpen(false)}
          />
          <div className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto rounded-t-2xl border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] dark:border-slate-800 dark:bg-slate-900">
            <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white px-5 py-3.5 dark:border-slate-800 dark:bg-slate-900">
              <h3 className="font-semibold text-slate-900 dark:text-slate-100">More</h3>
              <button
                onClick={() => setMoreOpen(false)}
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2 p-4 sm:grid-cols-4">
              {moreItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `flex flex-col items-center gap-2 rounded-xl border px-2 py-3 text-center transition-colors ${
                      isActive
                        ? 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950/40 dark:text-blue-300'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/50'
                    }`
                  }
                >
                  <item.icon className="h-6 w-6" />
                  <span className="text-xs font-medium leading-tight">{item.label}</span>
                </NavLink>
              ))}
            </div>
            <div className="border-t border-slate-100 p-3 dark:border-slate-800">
              <button
                onClick={toggle}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                {resolved === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
                {resolved === 'dark' ? 'Light mode' : 'Dark mode'}
              </button>
              <button
                onClick={handleSignOut}
                disabled={signingOut}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/50"
              >
                <LogOut className="h-5 w-5" />
                Sign out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
