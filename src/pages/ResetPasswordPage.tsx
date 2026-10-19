import Logo from '@/components/Logo';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, KeyRound, CheckCircle2 } from 'lucide-react';
import { authErrorMessage, completePasswordReset, verifyResetCode } from '@/lib/authAdmin';

/** Firebase appends ?oobCode=... to the real query string; a HashRouter app can
 *  also receive it after the hash. Read both so either link shape works. */
export function readResetCode(): string {
  const search = new URLSearchParams(window.location.search).get('oobCode');
  if (search) return search;
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return '';
  return new URLSearchParams(hash.slice(queryIndex + 1)).get('oobCode') || '';
}

export default function ResetPasswordPage({ onDone }: { onDone?: () => void }) {
  const [code] = useState(readResetCode);
  const [email, setEmail] = useState('');
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!code) {
      setError('This password reset link is missing its security code. Request a new email.');
      setChecking(false);
      return;
    }
    verifyResetCode(code)
      .then((address) => { if (!cancelled) setEmail(address); })
      .catch((err) => { if (!cancelled) setError(authErrorMessage(err)); })
      .finally(() => { if (!cancelled) setChecking(false); });
    return () => { cancelled = true; };
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('The two passwords do not match.');
    setSaving(true);
    try {
      await completePasswordReset(code, password);
      setDone(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const goToLogin = () => {
    // Drop the reset parameters so a refresh doesn't reopen a used link.
    window.history.replaceState(null, '', `${window.location.pathname}#/login`);
    if (onDone) onDone();
    else window.location.reload();
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-7 rounded-[2rem] border border-border/80 bg-card/95 p-6 shadow-2xl shadow-primary/[0.10] sm:p-8">
        <div className="flex items-center justify-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Logo className="h-6 w-6" /></div>
          <span className="font-display text-2xl font-extrabold text-foreground">PoultryPro</span>
        </div>

        {done ? (
          <div className="space-y-5 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" />
            <h1 className="font-display text-2xl font-extrabold text-foreground">Password updated</h1>
            <p className="text-muted-foreground">You can now sign in with your new password.</p>
            <Button className="h-11 w-full" onClick={goToLogin}>Back to sign in</Button>
          </div>
        ) : (
          <>
            <div className="text-center">
              <h1 className="font-display text-2xl font-extrabold text-foreground">Choose a new password</h1>
              <p className="mt-2 text-muted-foreground">
                {checking ? 'Checking your reset link…' : email ? `Resetting the password for ${email}` : 'This link could not be verified.'}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
              <div className="space-y-2">
                <Label htmlFor="new-password">New password</Label>
                <div className="relative">
                  <Input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={password} onChange={e => setPassword(e.target.value)} required className="h-11 pr-10" disabled={checking || !email} />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm new password</Label>
                <Input id="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={confirm} onChange={e => setConfirm(e.target.value)} required className="h-11" disabled={checking || !email} />
              </div>
              <Button type="submit" className="h-11 w-full" disabled={saving || checking || !email}>
                {saving ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> : <><KeyRound className="h-4 w-4" />Update password</>}
              </Button>
            </form>

            <p className="text-center text-sm text-muted-foreground">
              <button type="button" onClick={goToLogin} className="font-semibold text-primary hover:underline">Back to sign in</button>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
