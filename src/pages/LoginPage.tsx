import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

export function LoginPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) {
      toast('error', error.message || 'Invalid email or password.');
      return;
    }
    toast('success', 'Welcome back!');
    navigate('/');
  };

  return (
    <AuthShell title="Sign in" subtitle="Enter your details to access your shop dashboard.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Email">
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type="email"
              required
              autoComplete="email"
              placeholder="you@shop.com"
              className="pl-9"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </Field>
        <Field label="Password">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type={show ? 'text' : 'password'}
              required
              autoComplete="current-password"
              placeholder="Your password"
              className="pl-9 pr-9"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" loading={loading} className="w-full" size="lg">
          Sign in
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        New to ShopPilot?{' '}
        <Link to="/signup" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          Create an account
        </Link>
      </p>
    </AuthShell>
  );
}
