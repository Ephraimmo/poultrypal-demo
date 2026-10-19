import { deleteApp, getApp, initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  signOut,
} from 'firebase/auth';
import { firebaseConfig } from '@/lib/firebase';

/**
 * Creates a Firebase Auth account without touching the current session.
 *
 * Firebase signs in whoever was just created on the app instance used, so we
 * spin up a short-lived *secondary* app, create the account there, then throw
 * the instance away. The signed-in administrator stays signed in.
 *
 * Returns the new user's uid — the profile must be stored under this uid so the
 * permissions/flock assignments resolve when the person logs in.
 */
export async function createAuthUser(email: string, password: string): Promise<string> {
  const primary = getApp();
  const secondary = initializeApp(primary.options, `user-provisioning-${Date.now()}`);
  const auth = getAuth(secondary);
  try {
    const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
    return cred.user.uid;
  } finally {
    await signOut(auth).catch(() => {});
    await deleteApp(secondary).catch(() => {});
  }
}

export async function sendResetEmail(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) {
    throw Object.assign(new Error('That email address is not valid.'), { code: 'auth/invalid-email' });
  }

  // Call Firebase Auth's REST endpoint directly. This avoids a known failure in
  // some embedded preview browsers where the Auth SDK reports
  // `network-request-failed` even though ordinary HTTPS requests work.
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestType: 'PASSWORD_RESET', email: normalizedEmail }),
        signal: controller.signal,
        referrerPolicy: 'no-referrer',
      },
    );

    const payload = await response.json().catch(() => ({})) as {
      email?: string;
      error?: { message?: string };
    };
    if (!response.ok) {
      const reason = payload.error?.message || `HTTP_${response.status}`;
      const code = reason.includes('INVALID_EMAIL')
        ? 'auth/invalid-email'
        : reason.includes('EMAIL_NOT_FOUND')
          ? 'auth/user-not-found'
          : reason.includes('TOO_MANY')
            ? 'auth/too-many-requests'
            : 'auth/reset-request-failed';
      throw Object.assign(new Error(reason.replaceAll('_', ' ').toLowerCase()), { code });
    }

    if (payload.email?.toLowerCase() !== normalizedEmail) {
      throw Object.assign(new Error('Firebase did not confirm the reset recipient.'), {
        code: 'auth/reset-request-failed',
      });
    }
  } catch (error) {
    if ((error as { code?: string })?.code) throw error;
    throw Object.assign(new Error('Could not connect to the Firebase password-reset endpoint.'), {
      code: 'auth/network-request-failed',
      cause: error,
    });
  } finally {
    window.clearTimeout(timeout);
  }
}

/** Shared REST caller for the Firebase Auth out-of-band code endpoints. */
async function callIdentityToolkit<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:${path}?key=${encodeURIComponent(firebaseConfig.apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        referrerPolicy: 'no-referrer',
      },
    );
  } catch (error) {
    throw Object.assign(new Error('Could not connect to Firebase.'), {
      code: 'auth/network-request-failed',
      cause: error,
    });
  }

  const payload = await response.json().catch(() => ({})) as T & { error?: { message?: string } };
  if (!response.ok) {
    const reason = payload.error?.message || `HTTP_${response.status}`;
    const code = reason.includes('EXPIRED_OOB_CODE')
      ? 'auth/expired-action-code'
      : reason.includes('INVALID_OOB_CODE')
        ? 'auth/invalid-action-code'
        : reason.includes('WEAK_PASSWORD')
          ? 'auth/weak-password'
          : reason.includes('USER_DISABLED')
            ? 'auth/user-disabled'
            : 'auth/reset-request-failed';
    throw Object.assign(new Error(reason.replaceAll('_', ' ').toLowerCase()), { code });
  }
  return payload;
}

/** Validates a password-reset code and returns the account email it belongs to. */
export async function verifyResetCode(oobCode: string): Promise<string> {
  const payload = await callIdentityToolkit<{ email?: string }>('resetPassword', { oobCode });
  if (!payload.email) {
    throw Object.assign(new Error('This reset link is no longer valid.'), { code: 'auth/invalid-action-code' });
  }
  return payload.email;
}

/** Applies a new password using the code from the reset email. */
export async function completePasswordReset(oobCode: string, newPassword: string): Promise<void> {
  await callIdentityToolkit('resetPassword', { oobCode, newPassword });
}

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code || '';
  if (code === 'auth/email-already-in-use') return 'That email already has a login account.';
  if (code === 'auth/invalid-email') return 'That email address is not valid.';
  if (code === 'auth/weak-password') return 'Password must be at least 6 characters.';
  if (code === 'auth/operation-not-allowed') return 'Email/password sign-in is disabled for this project.';
  if (code === 'auth/user-not-found') return 'No Firebase login account exists for that email address.';
  if (code === 'auth/too-many-requests') return 'Too many requests. Please wait a few minutes and try again.';
  if (code === 'auth/network-request-failed') return 'The reset request could not reach Firebase. Check your connection and try again.';
  if (code === 'auth/expired-action-code') return 'This password reset link has expired. Request a new email.';
  if (code === 'auth/invalid-action-code') return 'This password reset link is invalid or has already been used. Request a new email.';
  if (code === 'auth/user-disabled') return 'This account has been disabled by an administrator.';
  return (err as Error)?.message?.replace('Firebase: ', '') || 'The account request could not be completed.';
}
