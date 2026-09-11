import { InputHTMLAttributes, forwardRef, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from 'react';

const baseField =
  'w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-900 placeholder:text-slate-400 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className = '', ...rest }, ref) {
    return <input ref={ref} className={`${baseField} h-10 text-sm ${className}`} {...rest} />;
  }
);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className = '', children, ...rest }, ref) {
    return (
      <select ref={ref} className={`${baseField} h-10 text-sm ${className}`} {...rest}>
        {children}
      </select>
    );
  }
);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className = '', ...rest }, ref) {
    return <textarea ref={ref} className={`${baseField} py-2 text-sm ${className}`} {...rest} />;
  }
);

// Replaces the browser's native (English-only) "Please fill out this
// field" bubble, which also tends to render low enough to overlap the
// next field, AND the generic bottom-right toast for field-specific
// problems (e.g. "this phone number is already registered") — both
// render in Urdu, pinned just above the field itself instead. Pair with
// `noValidate` on the <form> and app-level required/duplicate checks.
export function FieldWarning({ show, message }: { show: boolean; message: string }) {
  if (!show) return null;
  return (
    <div
      dir="rtl"
      lang="ur"
      className="absolute bottom-full left-0 right-0 z-10 mb-1.5 max-w-xs rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium leading-snug text-white shadow-lg"
    >
      {message}
      <div className="absolute left-4 top-full h-2 w-2 -translate-y-1 rotate-45 bg-red-600" />
    </div>
  );
}

export function Field({
  label,
  children,
  hint,
  error,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
  error?: string;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-slate-500 dark:text-slate-400">{hint}</span>}
      {error && <span className="text-xs text-red-600 dark:text-red-400">{error}</span>}
    </label>
  );
}
