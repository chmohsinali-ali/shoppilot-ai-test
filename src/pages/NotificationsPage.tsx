import { useEffect, useState } from 'react';
import { Bell, Check, Archive, Trash2, BellOff, Info, AlertTriangle, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { timeAgo } from '@/lib/format';
import type { Notification } from '@/types/db';

export function NotificationsPage() {
  const { shop } = useAuth();
  const toast = useToast();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'unread' | 'archived'>('all');

  const load = async () => {
    if (!shop) return;
    setLoading(true);
    const { data } = await supabase.from('notifications').select('*').eq('shop_id', shop.id).order('created_at', { ascending: false }).limit(50);
    setNotifications((data ?? []) as Notification[]);
    setLoading(false);
  };

  useEffect(() => { load(); }, [shop]);

  const markRead = async (id: string) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, is_read: true } : x)));
  };

  const markAllRead = async () => {
    if (!shop) return;
    await supabase.from('notifications').update({ is_read: true }).eq('shop_id', shop.id).eq('is_read', false);
    setNotifications((n) => n.map((x) => ({ ...x, is_read: true })));
  };

  const archive = async (id: string) => {
    await supabase.from('notifications').update({ is_archived: true, is_read: true }).eq('id', id);
    setNotifications((n) => n.map((x) => (x.id === id ? { ...x, is_archived: true, is_read: true } : x)));
  };

  const remove = async (id: string) => {
    await supabase.from('notifications').delete().eq('id', id);
    setNotifications((n) => n.filter((x) => x.id !== id));
  };

  const [checking, setChecking] = useState(false);

  const checkReminders = async () => {
    setChecking(true);
    try {
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/reminders`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
      });
      if (!res.ok) throw new Error(`Request failed (${res.status})`);
      const json = await res.json();
      if (json.success) {
        toast('success', `Checked reminders. ${json.notificationsCreated} new notification(s).`);
        load();
      }
    } catch {
      toast('error', 'Could not check reminders. Please try again.');
    } finally {
      setChecking(false);
    }
  };

  const filtered = notifications.filter((n) => {
    if (filter === 'unread') return !n.is_read && !n.is_archived;
    if (filter === 'archived') return n.is_archived;
    return !n.is_archived;
  });

  const unreadCount = notifications.filter((n) => !n.is_read && !n.is_archived).length;

  const icons: Record<string, typeof Info> = {
    success: CheckCircle2, warning: AlertTriangle, error: AlertCircle, info: Info, reminder: Bell,
  };

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader title="Notifications" subtitle={`${unreadCount} unread`} action={
        <div className="flex gap-2">
          <Button variant="outline" onClick={checkReminders} loading={checking}><RefreshCw className="h-4 w-4" /> Check Reminders</Button>
          {unreadCount > 0 && <Button variant="outline" onClick={markAllRead}><Check className="h-4 w-4" /> Mark all read</Button>}
        </div>
      } />

      <div className="mb-4 flex gap-2">
        <button onClick={() => setFilter('all')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>All</button>
        <button onClick={() => setFilter('unread')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === 'unread' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>Unread ({unreadCount})</button>
        <button onClick={() => setFilter('archived')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === 'archived' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>Archived</button>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>
      ) : filtered.length === 0 ? (
        <Card><EmptyState icon={<BellOff className="h-8 w-8" />} title="No notifications" description="You are all caught up." /></Card>
      ) : (
        <div className="space-y-2">
          {filtered.map((n) => {
            const Icon = icons[n.type] ?? Info;
            const colors: Record<string, string> = {
              success: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40',
              warning: 'text-amber-600 bg-amber-50 dark:bg-amber-950/40',
              error: 'text-rose-600 bg-rose-50 dark:bg-rose-950/40',
              info: 'text-blue-600 bg-blue-50 dark:bg-blue-950/40',
              reminder: 'text-violet-600 bg-violet-50 dark:bg-violet-950/40',
            };
            return (
              <Card key={n.id} className={`flex items-start gap-3 p-4 ${!n.is_read ? 'border-blue-200 dark:border-blue-800' : ''}`}>
                <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full ${colors[n.type] ?? colors.info}`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className={`text-sm ${!n.is_read ? 'font-semibold text-slate-900 dark:text-slate-100' : 'font-medium text-slate-700 dark:text-slate-300'}`}>{n.title}</p>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{timeAgo(n.created_at)}</span>
                  </div>
                  {n.message && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{n.message}</p>}
                  <div className="mt-2 flex gap-2">
                    {!n.is_read && <button onClick={() => markRead(n.id)} className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400">Mark read</button>}
                    {!n.is_archived && <button onClick={() => archive(n.id)} className="text-xs font-medium text-slate-500 hover:underline dark:text-slate-400"><Archive className="inline h-3 w-3" /> Archive</button>}
                    <button onClick={() => remove(n.id)} className="text-xs font-medium text-rose-500 hover:underline"><Trash2 className="inline h-3 w-3" /> Delete</button>
                  </div>
                </div>
                {!n.is_read && <div className="h-2 w-2 flex-shrink-0 rounded-full bg-blue-600 mt-1" />}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
