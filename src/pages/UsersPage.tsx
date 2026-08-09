import { useEffect, useState, FormEvent, Fragment } from 'react';
import { UserCog, Shield, Check, X, Plus, Mail, MoreVertical, UserCheck, UserX, Clock } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardHeader, CardBody } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input, Field, Select } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { EmptyState, Spinner } from '@/components/ui/EmptyState';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/format';
import type { ShopUser } from '@/types/db';

const roleDescriptions: Record<string, string> = {
  owner: 'Full access to all modules and settings',
  manager: 'Manage operations and staff, no settings changes',
  accountant: 'Ledgers, payments, reports, and audit logs',
  cashier: 'Process sales and receive payments',
  staff: 'Basic view access for daily operations',
};

const permissionCategories = [
  { label: 'Dashboard', perms: ['dashboard.view'] },
  { label: 'Customers', perms: ['customers.view', 'customers.create', 'customers.update', 'customers.deactivate', 'customers.receive_payment'] },
  { label: 'Suppliers', perms: ['suppliers.view', 'suppliers.create', 'suppliers.update', 'suppliers.make_payment'] },
  { label: 'Products', perms: ['products.view', 'products.create', 'products.update', 'products.deactivate'] },
  { label: 'Inventory', perms: ['inventory.view', 'inventory.adjust', 'inventory.mark_damaged', 'inventory.mark_expired'] },
  { label: 'Sales', perms: ['sales.view', 'sales.create_cash', 'sales.create_credit', 'sales.create_partial', 'sales.create_discount', 'sales.reverse', 'sales.return'] },
  { label: 'Purchases', perms: ['purchases.view', 'purchases.create_cash', 'purchases.create_credit', 'purchases.create_partial', 'purchases.return'] },
  { label: 'Expenses', perms: ['expenses.view', 'expenses.create', 'expenses.update'] },
  { label: 'Warranty', perms: ['warranties.view', 'warranties.create', 'warranties.manage_claims'] },
  { label: 'Reports', perms: ['reports.view', 'reports.export'] },
  { label: 'Administration', perms: ['users.manage', 'roles.manage', 'settings.manage', 'audit.view'] },
  { label: 'AI', perms: ['ai.approve_transactions'] },
];

const roleList = ['owner', 'manager', 'accountant', 'cashier', 'staff'];

export function UsersPage() {
  const { shop, user, role } = useAuth();
  const toast = useToast();
  const [shopUsers, setShopUsers] = useState<ShopUser[]>([]);
  const [rolePerms, setRolePerms] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [actionMenu, setActionMenu] = useState<string | null>(null);

  const load = async () => {
    if (!shop) return;
    setLoading(true);
    const [su, rp] = await Promise.all([
      supabase.from('shop_users').select('*').eq('shop_id', shop.id).order('created_at', { ascending: true }),
      supabase.from('role_permissions').select('*'),
    ]);
    setShopUsers((su.data ?? []) as ShopUser[]);
    const permMap: Record<string, string[]> = {};
    for (const r of (rp.data ?? []) as any[]) {
      permMap[r.role] = r.permissions;
    }
    setRolePerms(permMap);
    setLoading(false);
  };

  useEffect(() => { load(); }, [shop]);

  const changeRole = async (su: ShopUser, newRole: string) => {
    if (su.role === 'owner') { toast('error', 'Cannot change the owner role.'); return; }
    const { error } = await supabase.rpc('update_shop_user_role', { p_shop_user_id: su.id, p_role: newRole });
    if (error) { toast('error', error.message); return; }
    toast('success', `Role changed to ${newRole}.`);
    setActionMenu(null);
    load();
  };

  const deactivate = async (su: ShopUser) => {
    if (su.role === 'owner') { toast('error', 'Cannot deactivate the owner.'); return; }
    const { error } = await supabase.rpc('deactivate_shop_user', { p_shop_user_id: su.id });
    if (error) { toast('error', error.message); return; }
    toast('success', 'User deactivated.');
    setActionMenu(null);
    load();
  };

  const reactivate = async (su: ShopUser) => {
    const { error } = await supabase.from('shop_users').update({ status: 'active', updated_at: new Date().toISOString() }).eq('id', su.id);
    if (error) { toast('error', error.message); return; }
    toast('success', 'User reactivated.');
    setActionMenu(null);
    load();
  };

  if (loading) return <div className="flex justify-center py-20"><Spinner className="h-8 w-8" /></div>;

  const isOwner = role === 'owner';

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6 md:py-8">
      <PageHeader
        title="Users & Roles"
        subtitle={`${shopUsers.length} members in your shop`}
        action={
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowMatrix(true)}>Permissions Matrix</Button>
            {isOwner && <Button onClick={() => setShowInvite(true)}><Plus className="h-4 w-4" /> Invite Staff</Button>}
          </div>
        }
      />

      {/* Staff list */}
      <Card className="mb-6">
        <CardHeader title="Staff Members" subtitle="Manage who can access your shop" />
        <CardBody className="p-0">
          {shopUsers.length === 0 ? (
            <EmptyState icon={<UserCog className="h-8 w-8" />} title="No staff members" description="Invite staff to help manage your shop." action={isOwner && <Button onClick={() => setShowInvite(true)}><Plus className="h-4 w-4" /> Invite Staff</Button>} />
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {shopUsers.map((su) => (
                <div key={su.id} className="flex items-center justify-between px-5 py-4">
                  <div className="flex items-center gap-3">
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${su.role === 'owner' ? 'bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400' : 'bg-slate-100 text-slate-500 dark:bg-slate-800'}`}>
                      {su.status === 'active' ? <UserCheck className="h-5 w-5" /> : su.status === 'invited' ? <Clock className="h-5 w-5" /> : <UserX className="h-5 w-5" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{su.invited_email}</p>
                      <div className="mt-0.5 flex items-center gap-2">
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${su.role === 'owner' ? 'bg-blue-100 text-blue-700 dark:bg-blue-950/50 dark:text-blue-400' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}>
                          <Shield className="h-3 w-3" /> {su.role}
                        </span>
                        <StatusBadge status={su.status} />
                        <span className="text-xs text-slate-400">Added {formatDate(su.created_at)}</span>
                      </div>
                    </div>
                  </div>
                  {isOwner && su.role !== 'owner' && (
                    <div className="relative">
                      <button onClick={() => setActionMenu(actionMenu === su.id ? null : su.id)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                        <MoreVertical className="h-4 w-4" />
                      </button>
                      {actionMenu === su.id && (
                        <>
                          <div className="fixed inset-0 z-10" onClick={() => setActionMenu(null)} />
                          <div className="absolute right-0 z-20 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                            <p className="px-3 py-1.5 text-xs font-medium uppercase tracking-wide text-slate-400">Change role</p>
                            {['manager', 'accountant', 'cashier', 'staff'].map((r) => (
                              <button key={r} onClick={() => changeRole(su, r)} className={`block w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 dark:hover:bg-slate-800 ${su.role === r ? 'font-medium text-blue-600 dark:text-blue-400' : 'text-slate-700 dark:text-slate-300'}`}>
                                {r} {su.role === r && '✓'}
                              </button>
                            ))}
                            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                            {su.status === 'active' ? (
                              <button onClick={() => deactivate(su)} className="block w-full px-3 py-1.5 text-left text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950/30">Deactivate</button>
                            ) : su.status === 'disabled' ? (
                              <button onClick={() => reactivate(su)} className="block w-full px-3 py-1.5 text-left text-sm text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30">Reactivate</button>
                            ) : null}
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardBody>
      </Card>

      {/* Role definitions */}
      <div className="mb-6">
        <h2 className="mb-3 text-base font-semibold text-slate-900 dark:text-slate-100">Role Definitions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {roleList.map((r) => (
            <Card key={r} className="p-4">
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <p className="font-semibold capitalize text-slate-900 dark:text-slate-100">{r}</p>
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{roleDescriptions[r]}</p>
              <p className="mt-2 text-xs font-medium text-slate-400">{rolePerms[r]?.length ?? 0} permissions</p>
            </Card>
          ))}
        </div>
      </div>

      <InviteModal open={showInvite} onClose={() => setShowInvite(false)} onCreated={load} />
      <PermissionsMatrixModal open={showMatrix} onClose={() => setShowMatrix(false)} rolePerms={rolePerms} />
    </div>
  );
}

function InviteModal({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { shop } = useAuth();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('staff');
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!shop || !email.trim()) return;
    setSaving(true);
    const { error } = await supabase.rpc('invite_shop_user', {
      p_shop_id: shop.id, p_email: email.trim(), p_role: role,
    });
    setSaving(false);
    if (error) { toast('error', error.message); return; }
    toast('success', `Invitation sent to ${email}. When they sign up with this email, they will join your shop.`);
    setEmail(''); setRole('staff');
    onClose(); onCreated();
  };

  return (
    <Modal open={open} onClose={onClose} title="Invite Staff Member" size="sm">
      <form onSubmit={submit} className="space-y-4">
        <div className="rounded-lg bg-blue-50 p-3 text-sm text-blue-700 dark:bg-blue-950/30 dark:text-blue-300">
          <Mail className="mb-1 inline h-4 w-4" /> The person will receive access when they create an account with this email. They will join your shop instead of creating their own.
        </div>
        <Field label="Email address"><Input type="email" required placeholder="staff@example.com" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role">
          <Select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="manager">Manager</option>
            <option value="accountant">Accountant</option>
            <option value="cashier">Cashier</option>
            <option value="staff">Staff Member</option>
          </Select>
        </Field>
        <p className="text-xs text-slate-500 dark:text-slate-400">{roleDescriptions[role]}</p>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={saving}><Mail className="h-4 w-4" /> Send Invitation</Button>
        </div>
      </form>
    </Modal>
  );
}

function PermissionsMatrixModal({ open, onClose, rolePerms }: { open: boolean; onClose: () => void; rolePerms: Record<string, string[]> }) {
  const displayRoles = ['owner', 'manager', 'accountant', 'cashier', 'staff'];
  return (
    <Modal open={open} onClose={onClose} title="Permissions Matrix" size="xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-100 bg-slate-50 dark:border-slate-800 dark:bg-slate-800/50">
            <tr>
              <th className="sticky left-0 bg-slate-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">Permission</th>
              {displayRoles.map((r) => <th key={r} className="px-3 py-3 text-center text-xs font-medium capitalize text-slate-500 dark:text-slate-400 whitespace-nowrap">{r}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {permissionCategories.map((cat) => (
              <Fragment key={cat.label}>
                <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                  <td colSpan={displayRoles.length + 1} className="px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{cat.label}</td>
                </tr>
                {cat.perms.map((perm) => (
                  <tr key={perm} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                    <td className="sticky left-0 bg-white px-4 py-2.5 font-mono text-xs text-slate-700 dark:bg-slate-900 dark:text-slate-300">{perm}</td>
                    {displayRoles.map((r) => (
                      <td key={r} className="px-3 py-2.5 text-center">
                        {rolePerms[r]?.includes(perm) ? <Check className="mx-auto h-4 w-4 text-emerald-500" /> : <X className="mx-auto h-4 w-4 text-slate-300 dark:text-slate-600" />}
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400',
    invited: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400',
    disabled: 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400',
  };
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${styles[status] ?? styles.active}`}>{status}</span>;
}
