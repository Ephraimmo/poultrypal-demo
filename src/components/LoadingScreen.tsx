import { useEffect, useState } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Logo from '@/components/Logo';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

const SLOW_AFTER_MS = 10000;

/**
 * Shown until farm data arrives from Firebase. The app never substitutes data
 * stored in the browser, so if the database cannot be reached this explains why
 * instead of showing figures that may differ from other devices.
 */
export default function LoadingScreen({ error }: { error?: string | null }) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center animate-in fade-in duration-300">
        <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
        <h2 className="mt-3 font-display text-lg font-bold">Could not load farm data from the database</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Firebase refused or could not complete the request, so no data is shown rather than
          showing figures that might not match your other devices.
        </p>
        <p className="mt-3 rounded-md bg-muted px-3 py-2 font-mono text-xs text-muted-foreground break-words">{error}</p>
        <Button className="mt-4" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" /> Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Stat cards skeleton */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-start justify-between">
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-20" />
              </div>
              <Skeleton className="h-10 w-10 rounded-lg" />
            </div>
          </div>
        ))}
      </div>

      {/* Chart area skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="bg-card rounded-xl border border-border p-5">
            <Skeleton className="h-5 w-32 mb-4" />
            <Skeleton className="h-[280px] w-full rounded-lg" />
          </div>
        ))}
      </div>

      {/* Centered loading indicator */}
      <div className="flex flex-col items-center justify-center py-4 gap-2 text-muted-foreground">
        <div className="flex items-center gap-2">
          <Logo className="h-5 w-5 animate-pulse" />
          <span className="text-sm font-medium">Loading farm data from the database...</span>
        </div>
        {slow && (
          <p className="max-w-md text-center text-xs">
            This is taking longer than usual. Check your internet connection. The page will
            show your data as soon as the database connects.
          </p>
        )}
      </div>
    </div>
  );
}
