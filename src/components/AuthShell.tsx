import { ReactNode } from 'react';
import { Store } from 'lucide-react';

export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/40 to-slate-50 p-4 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-600/30">
            <Store className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">ShopPilot AI</h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Bas boliye, hisaab sambhal lega.</p>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <p className="mt-1 mb-6 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>
          {children}
        </div>
      </div>
    </div>
  );
}
