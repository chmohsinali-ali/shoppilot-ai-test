import { useState, FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Mail, Lock, User, Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AuthShell } from '@/components/AuthShell';
import { Button } from '@/components/ui/Button';
import { Input, Field } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';

export function SignupPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 6) {
      toast('error', 'Password must be at least 6 characters.');
      return;
    }
    setLoading(true);
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });
    setLoading(false);
    if (error) {
      toast('error', error.message);
      return;
    }
    if (!data.session) {
      toast('success', 'Account created. Please sign in.');
      navigate('/login');
      return;
    }
    toast('success', 'Account created! Let us set up your shop.');
    navigate('/onboarding');
  };

  return (
    <AuthShell title="Create account" subtitle="Start managing your shop with AI in minutes.">
      <form onSubmit={onSubmit} className="space-y-4">
        <Field label="Full name">
          <div className="relative">
            <User className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              required
              placeholder="Mohsin Khan"
              className="pl-9"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
        </Field>
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
        <Field label="Password" hint="At least 6 characters">
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              type={show ? 'text' : 'password'}
              required
              autoComplete="new-password"
              placeholder="Create a password"
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
          Create account
        </Button>
      </form>
      <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        Already have an account?{' '}
        <Link to="/login" className="font-medium text-blue-600 hover:underline dark:text-blue-400">
          Sign in
        </Link>
      </p>
    </AuthShell>
  );
}
