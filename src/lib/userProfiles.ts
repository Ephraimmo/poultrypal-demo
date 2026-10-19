import { db, ref, set, onValue } from '@/lib/firebase';
import { get, update, push, remove } from 'firebase/database';
import type { PermissionMap, UserProfile } from '@/lib/permissions';

const PROFILES_PATH = 'userProfiles';
const AUDIT_PATH = 'auditLog';

export type AuditEventType =
  | 'login'
  | 'logout'
  | 'user.create'
  | 'user.update'
  | 'user.delete'
  | 'user.activate'
  | 'user.deactivate'
  | 'permissions.update'
  | 'record.create'
  | 'record.update'
  | 'record.delete';

export interface AuditEvent {
  id?: string;
  at: number;
  actorUid: string;
  actorEmail?: string;
  type: AuditEventType;
  targetUid?: string;
  targetLabel?: string;
  detail?: string;
}

export async function getProfile(uid: string): Promise<UserProfile | null> {
  const snap = await get(ref(db, `${PROFILES_PATH}/${uid}`));
  return snap.exists() ? (snap.val() as UserProfile) : null;
}

export function subscribeProfiles(cb: (profiles: UserProfile[]) => void) {
  return onValue(ref(db, PROFILES_PATH), (snap) => {
    const val = snap.val() as Record<string, UserProfile> | null;
    cb(val ? Object.values(val) : []);
  });
}

export function subscribeProfile(uid: string, cb: (profile: UserProfile | null) => void) {
  return onValue(ref(db, `${PROFILES_PATH}/${uid}`), (snap) => {
    cb(snap.exists() ? (snap.val() as UserProfile) : null);
  });
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  await set(ref(db, `${PROFILES_PATH}/${profile.uid}`), {
    ...profile,
    updatedAt: Date.now(),
  });
}

export async function patchProfile(uid: string, patch: Partial<UserProfile>): Promise<void> {
  await update(ref(db, `${PROFILES_PATH}/${uid}`), { ...patch, updatedAt: Date.now() });
}

export async function deleteProfile(uid: string): Promise<void> {
  await remove(ref(db, `${PROFILES_PATH}/${uid}`));
}

export async function touchLastLogin(uid: string): Promise<void> {
  await update(ref(db, `${PROFILES_PATH}/${uid}`), { lastLogin: Date.now() });
}

export async function countProfiles(): Promise<number> {
  const snap = await get(ref(db, PROFILES_PATH));
  if (!snap.exists()) return 0;
  return Object.keys(snap.val()).length;
}

// Ensure a profile exists for a freshly authenticated user. If no profiles
// exist yet, this first user is bootstrapped as an administrator.
export async function ensureProfileFor(input: {
  uid: string;
  email: string;
  fullName?: string;
}): Promise<UserProfile> {
  const isDemo = input.email === 'demo@farm.com';
  const existing = await getProfile(input.uid);
  if (existing) {
    // Ensure the demo account is always an active administrator so it can never
    // get locked out even if a previous session downgraded the profile.
    if (isDemo && (!existing.isAdmin || !existing.active)) {
      const fixed: UserProfile = { ...existing, isAdmin: true, active: true, flockIds: 'all' };
      await saveProfile(fixed);
      return fixed;
    }
    return existing;
  }

  const total = await countProfiles();
  const isBootstrapAdmin = total === 0 || isDemo;

  const profile: UserProfile = {
    uid: input.uid,
    fullName: input.fullName || input.email.split('@')[0],
    email: input.email,
    username: input.email.split('@')[0],
    role: isBootstrapAdmin ? 'Administrator' : 'Member',
    active: true,
    permissions: isBootstrapAdmin ? {} : { dashboard: { view: true } },
    flockIds: 'all',
    isAdmin: isBootstrapAdmin,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  await saveProfile(profile);
  return profile;
}

export async function updatePermissions(uid: string, permissions: PermissionMap): Promise<void> {
  await update(ref(db, `${PROFILES_PATH}/${uid}`), { permissions, updatedAt: Date.now() });
}

export async function logEvent(event: Omit<AuditEvent, 'at'> & { at?: number }): Promise<void> {
  const key = push(ref(db, AUDIT_PATH)).key;
  if (!key) return;
  await set(ref(db, `${AUDIT_PATH}/${key}`), {
    id: key,
    at: event.at ?? Date.now(),
    ...event,
  });
}

export function subscribeAudit(cb: (events: AuditEvent[]) => void, limit = 200) {
  return onValue(ref(db, AUDIT_PATH), (snap) => {
    const val = snap.val() as Record<string, AuditEvent> | null;
    const list = val ? Object.values(val) : [];
    list.sort((a, b) => b.at - a.at);
    cb(list.slice(0, limit));
  });
}
