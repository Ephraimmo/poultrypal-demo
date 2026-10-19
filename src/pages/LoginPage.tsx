import Logo from '@/components/Logo';
import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { LogIn, Eye, EyeOff, CheckCircle2, Mail } from 'lucide-react';
import RegisterPage from '@/pages/RegisterPage';
import { authErrorMessage, sendResetEmail } from '@/lib/authAdmin';

export default function LoginPage() {
  const { login } = useAuth();
  const [showRegister, setShowRegister] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (loginError) {
      const code = (loginError as { code?: string })?.code;
      setError(code === 'auth/account-disabled'
        ? 'This account has been disabled by an administrator. Contact your administrator to restore access.'
        : 'Invalid email or password. Try the demo credentials below.');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = () => {
    setEmail('demo@farm.com');
    setPassword('123456');
  };

  const transition = 'transform-gpu transition-transform duration-500 ease-in-out motion-reduce:transition-none';

  return (
    <main className="relative h-[100dvh] min-h-[640px] overflow-hidden bg-background">
      {/* One persistent illustration travels from left to right. Because it is
          never unmounted or swapped, there is no image flash during navigation. */}
      <AuthArtwork registerActive={showRegister} transition={transition} />

      {/* Login panel: right at rest, then travels completely beyond the left edge. */}
      <section
        className={`absolute inset-y-0 right-0 z-20 flex w-full items-center justify-center overflow-y-auto bg-background/65 p-4 backdrop-blur-[2px] sm:p-8 lg:w-1/2 lg:bg-transparent lg:backdrop-blur-none ${transition} ${showRegister ? '-translate-x-full lg:-translate-x-[200%]' : 'translate-x-0'}`}
        aria-hidden={showRegister}
        {...(showRegister ? { inert: '' } : {})}
      >
        <div className="my-auto w-full max-w-md space-y-7 rounded-[2rem] border border-border/80 bg-card/95 p-6 shadow-2xl shadow-primary/[0.10] backdrop-blur-xl sm:p-8">
          <div className="flex items-center justify-center gap-3 lg:hidden">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><Logo className="h-6 w-6" /></div>
            <span className="font-display text-2xl font-extrabold text-foreground">PoultryPro</span>
          </div>

          <div className="text-center lg:text-left">
            <h1 className="font-display text-3xl font-extrabold text-foreground">Welcome back</h1>
            <p className="mt-2 text-muted-foreground">Sign in to manage your farm</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input id="login-email" type="email" autoComplete="email" placeholder="Enter your email" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Password</Label>
              <div className="relative">
                <Input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Enter your password" value={password} onChange={e => setPassword(e.target.value)} required className="h-11 pr-10" />
                <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? 'Hide password' : 'Show password'} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>
            <Button type="submit" className="h-11 w-full" disabled={loading}>
              {loading ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> : <><LogIn className="h-4 w-4" />Sign In</>}
            </Button>
            <p className="text-center text-sm">
              <button type="button" onClick={() => setForgotOpen(true)} className="font-semibold text-primary hover:underline">Forgot password?</button>
            </p>
          </form>

          <ForgotPasswordDialog open={forgotOpen} onOpenChange={setForgotOpen} defaultEmail={email} />


          <div className="rounded-xl border border-border bg-muted/45 p-4">
            <p className="mb-2 text-sm font-semibold text-foreground">Demo credentials</p>
            <div className="space-y-1 text-sm text-muted-foreground">
              <p>Email: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">demo@farm.com</code></p>
              <p>Password: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">123456</code></p>
            </div>
            <Button variant="outline" size="sm" className="mt-3 w-full" onClick={fillDemo}>Use Demo Credentials</Button>
          </div>

          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <button type="button" onClick={() => setShowRegister(true)} className="font-semibold text-primary hover:underline">Register</button>
          </p>
        </div>
      </section>

      {/* Register starts beyond the right edge and crosses into the left half. */}
      <section
        className={`absolute inset-y-0 left-0 z-20 flex w-full items-center justify-center overflow-y-auto bg-background/65 p-4 backdrop-blur-[2px] sm:p-8 lg:w-1/2 lg:bg-transparent lg:backdrop-blur-none ${transition} ${showRegister ? 'translate-x-0' : 'translate-x-full lg:translate-x-[200%]'}`}
        aria-hidden={!showRegister}
        {...(!showRegister ? { inert: '' } : {})}
      >
        <div className="my-auto w-full"><RegisterPage onBack={() => setShowRegister(false)} /></div>
      </section>
    </main>
  );
}

function ForgotPasswordDialog({ open, onOpenChange, defaultEmail }: {
  open: boolean;
  onOpenChange: (value: boolean) => void;
  defaultEmail: string;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const handleOpenChange = (value: boolean) => {
    if (value) {
      setEmail(defaultEmail);
      setError('');
      setSent(false);
    }
    onOpenChange(value);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSending(true);
    try {
      await sendResetEmail(email);
      setSent(true);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Reset your password</DialogTitle>
          <DialogDescription>
            {sent
              ? 'Check your inbox and follow the link to choose a new password.'
              : 'We will email you a secure link to set a new password.'}
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <DialogFooter>
            <Button className="w-full" onClick={() => handleOpenChange(false)}>Done</Button>
          </DialogFooter>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && <div role="alert" className="rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">{error}</div>}
            <div className="space-y-2">
              <Label htmlFor="reset-email">Email</Label>
              <Input id="reset-email" type="email" autoComplete="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required className="h-11" />
            </div>
            <Button type="submit" className="h-11 w-full" disabled={sending}>
              {sending ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" /> : <><Mail className="h-4 w-4" />Send reset link</>}
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}


function AuthArtwork({ registerActive, transition }: { registerActive: boolean; transition: string }) {
  return (
    <aside
      className={`absolute inset-y-0 -left-[10%] z-10 w-[120%] overflow-hidden lg:left-0 lg:w-1/2 ${transition} ${registerActive ? 'translate-x-[8%] lg:translate-x-full' : '-translate-x-[8%] lg:translate-x-0'}`}
      aria-hidden="true"
    >
      <div className="absolute inset-0 farm-gradient" />
      <div className="absolute -inset-x-[8%] inset-y-0 scale-105 bg-[url('https://images.unsplash.com/photo-1548550023-2bdb3c5beed7?w=1600&q=85')] bg-cover bg-center opacity-40 mix-blend-overlay" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-transparent to-white/[0.04]" />
      <div className="relative z-10 hidden h-full flex-col justify-center px-12 text-primary-foreground lg:flex xl:px-16">
        <div className="mb-7 flex h-16 w-16 items-center justify-center rounded-2xl border border-white/15 bg-white/10 shadow-2xl backdrop-blur"><Logo className="h-10 w-10" /></div>
        <h2 className="font-display text-4xl font-extrabold xl:text-5xl">PoultryPro</h2>
        <p className="mt-5 max-w-lg text-lg leading-relaxed text-primary-foreground/78">Your complete poultry farm management system. Track batches, monitor health, manage feed, and analyse profits — all in one place.</p>
        <div className="mt-9 grid max-w-lg gap-3 sm:grid-cols-3">
          {['Real-time tracking', 'Smart analytics', 'Secure access'].map(item => (
            <div key={item} className="flex items-center gap-2 text-xs font-medium text-primary-foreground/75"><CheckCircle2 className="h-4 w-4 text-sidebar-primary" />{item}</div>
          ))}
        </div>
      </div>
    </aside>
  );
}
