import React, { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import {
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
} from 'firebase/auth';
import { getApps } from 'firebase/app';
import { get } from 'firebase/database';
import { db, ref } from '@/lib/firebase';

const app = getApps()[0];
const auth = getAuth(app);

/**
 * Older builds could open the demo account as a browser-only "local" session
 * that never talked to Firebase, so each browser showed its own data. Remove
 * any such saved session so every login is a real Firebase sign-in.
 */
const LEGACY_LOCAL_DEMO_SESSION_KEY = 'poultrypro-demo-session';
try {
  localStorage.removeItem(LEGACY_LOCAL_DEMO_SESSION_KEY);
} catch {
  // Storage can be disabled in some embedded viewers; nothing to clean up then.
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function disabledAccountError(): Error & { code: string } {
  return Object.assign(
    new Error('This account has been disabled by an administrator. Contact your administrator to restore access.'),
    { code: 'auth/account-disabled' },
  );
}

/** Check application access without changing or deleting the Firebase Auth account. */
async function isAccountDisabled(uid: string): Promise<boolean> {
  try {
    // Read current and legacy access records independently. Some database rule
    // sets allow a user to read their own RBAC profile but not the legacy node;
    // one denied legacy read must never suppress a valid disabled profile.
    const lookup = Promise.allSettled([
      get(ref(db, `userProfiles/${uid}`)),
      get(ref(db, `users/${uid}`)),
    ]);
    const results = await Promise.race([
      lookup,
      new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Access check timed out')), 5000)),
    ]);
    const profileSnap = results[0].status === 'fulfilled' ? results[0].value : null;
    const legacySnap = results[1].status === 'fulfilled' ? results[1].value : null;
    const profile = profileSnap?.exists() ? profileSnap.val() as { active?: boolean } : null;
    const legacy = legacySnap?.exists() ? legacySnap.val() as { disabled?: boolean } : null;
    return profile?.active === false || legacy?.disabled === true;
  } catch (error) {
    // A temporary database failure must not turn valid credentials into a false
    // lockout. The live profile subscription performs the same check once RTDB
    // reconnects and signs disabled users out immediately.
    console.error('Could not verify account access state:', error);
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const loginInProgressRef = useRef(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Never leave the whole app behind a permanent spinner if an embedded
    // browser blocks Firebase's auth initialization request.
    const timeout = window.setTimeout(() => setLoading(false), 4000);
    const unsub = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        window.clearTimeout(timeout);
        // Explicit login performs its own access check before publishing the
        // authenticated user. Avoid a competing listener check/sign-out race.
        if (firebaseUser && loginInProgressRef.current) return;
        if (firebaseUser) {
          setLoading(true);
          if (await isAccountDisabled(firebaseUser.uid)) {
            await signOut(auth).catch(() => undefined);
            setUser(null);
            setLoading(false);
            return;
          }
        }
        setUser(firebaseUser);
        setLoading(false);
      },
      () => {
        window.clearTimeout(timeout);
        setLoading(false);
      },
    );
    return () => {
      window.clearTimeout(timeout);
      unsub();
    };
  }, []);

  const login = async (rawEmail: string, password: string) => {
    const email = rawEmail.trim().toLowerCase();
    loginInProgressRef.current = true;

    try {
      const credential = await Promise.race([
        signInWithEmailAndPassword(auth, email, password),
        new Promise<never>((_, reject) => {
          window.setTimeout(() => reject(new Error('Authentication request timed out.')), 6000);
        }),
      ]);
      if (await isAccountDisabled(credential.user.uid)) {
        await signOut(auth).catch(() => undefined);
        throw disabledAccountError();
      }
      // Every account, including the demo login, must be a real Firebase
      // session so the database serves the same data in every browser.
      setUser(credential.user);
      setLoading(false);
    } finally {
      loginInProgressRef.current = false;
    }
  };

  const logout = async () => {
    setUser(null);
    await signOut(auth).catch(() => undefined);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
