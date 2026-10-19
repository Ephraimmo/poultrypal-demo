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

const DEMO_EMAIL = 'demo@farm.com';
const DEMO_PASSWORD = '123456';
const DEMO_SESSION_KEY = 'poultrypro-demo-session';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function readDemoSession(): boolean {
  try {
    return localStorage.getItem(DEMO_SESSION_KEY) === 'true';
  } catch {
    return false;
  }
}

function saveDemoSession(active: boolean): void {
  try {
    if (active) localStorage.setItem(DEMO_SESSION_KEY, 'true');
    else localStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    // Some embedded viewers disable storage. The in-memory session still works.
  }
}

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

/**
 * The hosted Firebase account remains the primary demo login. This local user
 * is a deliberate fallback for downloaded previews, file:// URLs, and offline
 * development where Firebase Auth may be blocked by the preview sandbox.
 */
function localDemoUser(): User {
  return {
    uid: 'local-demo',
    email: DEMO_EMAIL,
    displayName: 'Demo Administrator',
    emailVerified: true,
    isAnonymous: false,
    phoneNumber: null,
    photoURL: null,
    providerId: 'local-demo',
    metadata: {},
    providerData: [],
    refreshToken: '',
    tenantId: null,
    delete: async () => undefined,
    getIdToken: async () => '',
    getIdTokenResult: async () => {
      throw new Error('Token results are unavailable in local demo mode.');
    },
    reload: async () => undefined,
    toJSON: () => ({ uid: 'local-demo', email: DEMO_EMAIL }),
  } as unknown as User;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const hasSavedDemoSession = readDemoSession();
  const localDemoRef = useRef(hasSavedDemoSession);
  const loginInProgressRef = useRef(false);
  const [user, setUser] = useState<User | null>(hasSavedDemoSession ? localDemoUser() : null);
  const [loading, setLoading] = useState(!hasSavedDemoSession);

  useEffect(() => {
    // Never leave the whole app behind a permanent spinner if an embedded
    // browser blocks Firebase's auth initialization request.
    const timeout = window.setTimeout(() => setLoading(false), 4000);
    const unsub = onAuthStateChanged(
      auth,
      async (firebaseUser) => {
        window.clearTimeout(timeout);
        // A null Firebase session must not erase an active local demo session.
        if (!firebaseUser && localDemoRef.current) {
          setLoading(false);
          return;
        }
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
        // Firebase can be unavailable in embedded/static previews. The saved
        // local demo session can still open the app in that environment.
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
      localDemoRef.current = false;
      saveDemoSession(false);
      setUser(credential.user);
      setLoading(false);
    } catch (error) {
      // Keep the downloadable/live preview usable if Firebase is unreachable
      // or rejects the preview's origin. Only the documented demo credentials
      // are eligible; real users still authenticate exclusively with Firebase.
      if ((error as { code?: string })?.code === 'auth/account-disabled') throw error;
      if (email !== DEMO_EMAIL || password !== DEMO_PASSWORD) throw error;

      localDemoRef.current = true;
      saveDemoSession(true);
      setUser(localDemoUser());
      setLoading(false);
    } finally {
      loginInProgressRef.current = false;
    }
  };

  const logout = async () => {
    localDemoRef.current = false;
    saveDemoSession(false);
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
