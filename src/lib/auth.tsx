import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Shop } from '../types/db';

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  shop: Shop | null;
  role: string | null;
  permissions: string[];
  loading: boolean;
  shopLoading: boolean;
  signOut: () => Promise<void>;
  refreshShop: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [shop, setShop] = useState<Shop | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [permissions, setPermissions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [shopLoading, setShopLoading] = useState(false);

  const loadShop = useCallback(async (uid: string) => {
    setShopLoading(true);
    // Use the RPC that checks both ownership and shop_users membership
    const { data: shopId } = await supabase.rpc('get_my_shop_id');
    if (!shopId) {
      // Fallback: check if user owns a shop directly (for existing owners)
      const { data: ownedShop } = await supabase
        .from('shops')
        .select('*')
        .eq('owner_id', uid)
        .maybeSingle();
      if (ownedShop) {
        setShop(ownedShop as Shop);
        setRole('owner');
        const { data: ownerPerms } = await supabase.rpc('get_my_permissions', { p_shop_id: ownedShop.id });
        setPermissions((ownerPerms as string[]) ?? []);
      } else {
        setShop(null);
        setRole(null);
        setPermissions([]);
      }
      setShopLoading(false);
      return;
    }
    // Load the shop by ID
    const { data: shopData, error } = await supabase
      .from('shops')
      .select('*')
      .eq('id', shopId)
      .maybeSingle();
    if (error || !shopData) {
      setShop(null);
      setRole(null);
      setPermissions([]);
      setShopLoading(false);
      return;
    }
    setShop(shopData as Shop);
    // Load role and permissions
    const { data: roleData } = await supabase.rpc('get_my_role', { p_shop_id: shopId });
    setRole(roleData as string);
    const { data: permData } = await supabase.rpc('get_my_permissions', { p_shop_id: shopId });
    setPermissions((permData as string[]) ?? []);
    setShopLoading(false);
  }, []);

  const refreshShop = useCallback(async () => {
    if (user) await loadShop(user.id);
  }, [user, loadShop]);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        loadShop(data.session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      (async () => {
        setSession(sess);
        setUser(sess?.user ?? null);
        if (sess?.user) {
          await loadShop(sess.user.id);
        } else {
          setShop(null);
          setRole(null);
          setPermissions([]);
        }
      })();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [loadShop]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setShop(null);
    setRole(null);
    setPermissions([]);
  }, []);

  const hasPermission = useCallback((perm: string) => {
    if (role === 'owner') return true;
    return permissions.includes(perm);
  }, [role, permissions]);

  return (
    <AuthContext.Provider
      value={{ session, user, shop, role, permissions, loading, shopLoading, signOut, refreshShop, hasPermission }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
