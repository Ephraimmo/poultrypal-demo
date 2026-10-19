import Logo from '@/components/Logo';
import { Skeleton } from '@/components/ui/skeleton';

export default function LoadingScreen() {
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
      <div className="flex items-center justify-center py-4 gap-2 text-muted-foreground">
        <Logo className="h-5 w-5 animate-pulse" />
        <span className="text-sm font-medium">Loading farm data...</span>
      </div>
    </div>
  );
}
