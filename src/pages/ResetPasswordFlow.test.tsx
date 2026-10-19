import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/* The whole reset flow talks to Firebase through src/lib/authAdmin.
   Mock that module so the flow can be exercised end-to-end offline. */
const sendResetEmail = vi.fn();
const verifyResetCode = vi.fn();
const completePasswordReset = vi.fn();

vi.mock('@/lib/authAdmin', async () => {
  const actual = await vi.importActual<typeof import('@/lib/authAdmin')>('@/lib/authAdmin');
  return {
    ...actual,
    sendResetEmail: (...a: unknown[]) => sendResetEmail(...a),
    verifyResetCode: (...a: unknown[]) => verifyResetCode(...a),
    completePasswordReset: (...a: unknown[]) => completePasswordReset(...a),
  };
});

// The register screen boots a real Firebase Auth instance at import time.
vi.mock('@/pages/RegisterPage', () => ({ default: () => null }));

// No real Firebase app in tests.
vi.mock('@/lib/firebase', () => ({
  firebaseConfig: { apiKey: 'test-key' },
  db: {},
  ref: vi.fn(),
  set: vi.fn(),
  onValue: vi.fn(() => () => {}),
}));

// The login screen only needs `login` from the auth context for this flow.
vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({ login: vi.fn().mockResolvedValue(true) }),
}));

const err = (code: string, message = code) => Object.assign(new Error(message), { code });

beforeEach(() => {
  sendResetEmail.mockReset();
  verifyResetCode.mockReset();
  completePasswordReset.mockReset();
  window.history.replaceState(null, '', '/');
});

afterEach(cleanup);

async function renderResetPage(url: string) {
  window.history.replaceState(null, '', url);
  const { default: ResetPasswordPage } = await import('./ResetPasswordPage');
  return render(<ResetPasswordPage onDone={() => {}} />);
}

describe('requesting a reset email', () => {
  it('sends the reset email and confirms delivery', async () => {
    sendResetEmail.mockResolvedValue(undefined);
    const { default: LoginPage } = await import('./LoginPage');
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /forgot password/i }));
    const emailField = await screen.findByLabelText(/^email$/i, { selector: '#reset-email' });
    await user.clear(emailField);
    await user.type(emailField, 'farmer@poultrypro.local');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    await waitFor(() => expect(sendResetEmail).toHaveBeenCalledWith('farmer@poultrypro.local'));
    expect(await screen.findByText(/check your inbox/i)).toBeInTheDocument();
  });

  it('shows a friendly error when the address has no account', async () => {
    sendResetEmail.mockRejectedValue(err('auth/user-not-found'));
    const { default: LoginPage } = await import('./LoginPage');
    const user = userEvent.setup();
    render(<LoginPage />);

    await user.click(screen.getByRole('button', { name: /forgot password/i }));
    const emailField = await screen.findByLabelText(/^email$/i, { selector: '#reset-email' });
    await user.clear(emailField);
    await user.type(emailField, 'nobody@poultrypro.local');
    await user.click(screen.getByRole('button', { name: /send reset link/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/no firebase login account exists/i);
  });
});

describe('resetting with a valid code', () => {
  it('verifies the code, saves the new password and returns to sign in', async () => {
    verifyResetCode.mockResolvedValue('farmer@poultrypro.local');
    completePasswordReset.mockResolvedValue(undefined);
    const user = userEvent.setup();
    await renderResetPage('/?oobCode=GOODCODE#/reset-password');

    expect(await screen.findByText(/resetting the password for farmer@poultrypro.local/i)).toBeInTheDocument();
    expect(verifyResetCode).toHaveBeenCalledWith('GOODCODE');

    await user.type(screen.getByLabelText('New password'), 'FarmTest@2026!');
    await user.type(screen.getByLabelText('Confirm new password'), 'FarmTest@2026!');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    await waitFor(() => expect(completePasswordReset).toHaveBeenCalledWith('GOODCODE', 'FarmTest@2026!'));
    expect(await screen.findByText(/password updated/i)).toBeInTheDocument();
    expect(screen.getByText(/sign in with your new password/i)).toBeInTheDocument();
  });

  it('reads the code from a hash-router style link', async () => {
    verifyResetCode.mockResolvedValue('hash@poultrypro.local');
    await renderResetPage('/#/reset-password?oobCode=HASHCODE');
    await waitFor(() => expect(verifyResetCode).toHaveBeenCalledWith('HASHCODE'));
  });

  it('rejects mismatched or too-short passwords before calling Firebase', async () => {
    verifyResetCode.mockResolvedValue('farmer@poultrypro.local');
    const user = userEvent.setup();
    await renderResetPage('/?oobCode=GOODCODE');
    await screen.findByText(/resetting the password for/i);

    await user.type(screen.getByLabelText('New password'), 'abc');
    await user.type(screen.getByLabelText('Confirm new password'), 'abc');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/at least 6 characters/i);

    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'FarmTest@2026!');
    await user.clear(screen.getByLabelText('Confirm new password'));
    await user.type(screen.getByLabelText('Confirm new password'), 'Different@2026!');
    await user.click(screen.getByRole('button', { name: /update password/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/do not match/i);

    expect(completePasswordReset).not.toHaveBeenCalled();
  });
});

describe('invalid or expired codes', () => {
  it('shows an error for an invalid/used code and disables the form', async () => {
    verifyResetCode.mockRejectedValue(err('auth/invalid-action-code'));
    await renderResetPage('/?oobCode=BADCODE');

    expect(await screen.findByRole('alert')).toHaveTextContent(/invalid or has already been used/i);
    expect(screen.getByLabelText('New password')).toBeDisabled();
    expect(screen.getByRole('button', { name: /update password/i })).toBeDisabled();
  });

  it('shows an expiry-specific error for an expired code', async () => {
    verifyResetCode.mockRejectedValue(err('auth/expired-action-code'));
    await renderResetPage('/?oobCode=EXPIRED');
    expect(await screen.findByRole('alert')).toHaveTextContent(/has expired/i);
  });

  it('explains when the link carries no code at all', async () => {
    await renderResetPage('/#/reset-password');
    expect(await screen.findByRole('alert')).toHaveTextContent(/missing its security code/i);
    expect(verifyResetCode).not.toHaveBeenCalled();
  });

  it('surfaces a failure that happens while saving the new password', async () => {
    verifyResetCode.mockResolvedValue('farmer@poultrypro.local');
    completePasswordReset.mockRejectedValue(err('auth/expired-action-code'));
    const user = userEvent.setup();
    await renderResetPage('/?oobCode=GOODCODE');
    await screen.findByText(/resetting the password for/i);

    await user.type(screen.getByLabelText('New password'), 'FarmTest@2026!');
    await user.type(screen.getByLabelText('Confirm new password'), 'FarmTest@2026!');
    await user.click(screen.getByRole('button', { name: /update password/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/has expired/i);
    expect(screen.queryByText(/password updated/i)).not.toBeInTheDocument();
  });
});
