import React, { createContext, useContext, useEffect, useMemo, useState, ReactNode } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  ensureProfileFor,
  subscribeProfile,
  touchLastLogin,
  logEvent,
} from '@/lib/userProfiles';
import { hasPermission, type Action, type Module, type UserProfile } from '@/lib/permissions';

function demoAdminProfile(uid: string, email: string): UserProfile {
  const now = Date.now();
  return {
    uid,
    fullName: 'Demo Administrator',
    email,
    username: 'demo',
    role: 'Administrator',
    active: true,
    permissions: {},
    flockIds: 'all',
    isAdmin: true,
    createdAt: now,
    updatedAt: now,
  };
}

interface PermissionsContextValue {
  profile: UserProfile | null;
  loading: boolean;
  can: (module: Module, action?: Action) => boolean;
  isAdmin: boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

export function PermissionsProvider({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setProfile(null);
      setLoading(false);
      return;
    }

    let mounted = true;
    let unsubscribe: (() => void) | undefined;
    const email = user.email || '';
    setLoading(true);

    // Demo mode must render immediately. Embedded/static previews often allow
    // Firebase Auth but block or indefinitely delay Realtime Database sockets.
    if (user.uid === 'local-demo' || email.toLowerCase() === 'demo@farm.com') {
      setProfile(demoAdminProfile(user.uid, email));
      setLoading(false);
      return () => {
        mounted = false;
      };
    }

    (async () => {
      try {
        const p = await ensureProfileFor({
          uid: user.uid,
          email,
          fullName: user.displayName || undefined,
        });
        if (!mounted) return;

        touchLastLogin(user.uid).catch(() => {});
        logEvent({
          actorUid: user.uid,
          actorEmail: email || undefined,
          type: 'login',
        }).catch(() => {});

        unsubscribe = subscribeProfile(user.uid, (next) => {
          if (!mounted) return;
          const resolved = next ?? p;
          setProfile(resolved);
          setLoading(false);
          // Revocation is enforced as soon as the live profile changes. The
          // Firebase Auth account remains intact and can be re-enabled later.
          if (resolved.active === false) logout().catch(() => undefined);
        });
      } catch (error) {
        if (!mounted) return;
        console.error('Could not load the user profile:', error);
        // Let the documented demo account remain usable when RTDB is blocked
        // by the live-preview environment. Never grant this fallback to other
        // accounts.
        setProfile(email.toLowerCase() === 'demo@farm.com'
          ? demoAdminProfile(user.uid, email)
          : null);
        setLoading(false);
      }
    })();

    return () => {
      mounted = false;
      unsubscribe?.();
    };
  }, [user]);

  const value = useMemo<PermissionsContextValue>(
    () => ({
      profile,
      loading,
      isAdmin: Boolean(profile?.isAdmin),
      can: (module, action = 'view') => hasPermission(profile, module, action),
    }),
    [profile, loading],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const ctx = useContext(PermissionsContext);
  if (!ctx) throw new Error('usePermissions must be used within PermissionsProvider');
  return ctx;
}

export function useCan(module: Module, action: Action = 'view') {
  return usePermissions().can(module, action);
}
