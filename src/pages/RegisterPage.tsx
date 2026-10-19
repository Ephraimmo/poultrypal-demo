import Logo from '@/components/Logo';
import { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { getApps } from 'firebase/app';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { UserPlus, Eye, EyeOff, LockKeyhole } from 'lucide-react';
import { toast } from 'sonner';

const auth = getAuth(getApps()[0]);

interface Props {
  onBack: () => void;
}

/** Registration form panel. It stays mounted while the auth shell animates. */
export default function RegisterPage({ onBack }: Props) {
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!fullName.trim()) return setError('Please enter your full name.');
    if (password.length < 6) return setError('Password must be at least 6 characters.');
    if (password !== confirm) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
      if (cred.user && fullName.trim()) await updateProfile(cred.user, { displayName: fullName.trim() });
      toast.success('Account created', { description: 'An administrator must grant you access before you can use the app.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create account.';
      setError(message.replace('Firebase: ', ''));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-5 rounded-[2rem] border border-border/80 bg-card/95 p-6 shadow-2xl shadow-primary/[0.10] backdrop-blur-xl sm:p-8">
      <div className="flex items-center gap-3 lg:hidden">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Logo className="h-6 w-6" /></div>
        <span className="font-display text-xl font-extrabold">PoultryPro</span>
      </div>

      <div>
        <h1 className="font-display text-3xl font-extrabold text-foreground">Create your account</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Register your email to request access. An administrator will assign your permissions.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}

        <div className="space-y-1.5">
          <Label htmlFor="register-name">Full name</Label>
          <Input id="register-name" autoComplete="name" placeholder="Your full name" value={fullName} onChange={e => setFullName(e.target.value)} required className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="register-email">Email</Label>
          <Input id="register-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="register-password">Password</Label>
          <div className="relative">
            <Input id="register-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="At least 6 characters" value={password} onChange={e => setPassword(e.target.value)} required minLength={6} className="h-11 pr-10" />
            <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide passwords' : 'Show passwords'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="register-confirm">Confirm password</Label>
          <Input id="register-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" placeholder="Repeat your password" value={confirm} onChange={e => setConfirm(e.target.value)} required minLength={6} className="h-11" />
        </div>
        <Button type="submit" className="h-11 w-full" disabled={loading}>
          {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> : <><UserPlus className="h-4 w-4" />Create account</>}
        </Button>
      </form>

      <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground"><LockKeyhole className="h-3.5 w-3.5" />Protected by Firebase Authentication.</p>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <button type="button" onClick={onBack} className="font-semibold text-primary hover:underline">
          Back to Login
        </button>
      </p>
    </div>
  );
}
