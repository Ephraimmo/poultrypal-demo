import { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { ArrowDownRight, ArrowUpRight, LucideIcon } from 'lucide-react';

interface StatCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: string;
  trendUp?: boolean;
  className?: string;
  children?: ReactNode;
}

export default function StatCard({ title, value, icon: Icon, trend, trendUp, className }: StatCardProps) {
  return (
    <div className={cn("group relative overflow-hidden bg-card rounded-2xl border border-border/80 p-5 stat-card-hover", className)}>
      <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-primary/[0.035] transition-transform duration-500 group-hover:scale-125" />
      <div className="relative flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground">{title}</p>
          <p className="text-2xl font-extrabold mt-2 font-display tabular-nums tracking-tight">{value}</p>
          {trend && (
            <p className={cn(
              "text-[11px] mt-2 font-semibold inline-flex items-center gap-1",
              trendUp === true ? "text-success" : trendUp === false ? "text-destructive" : "text-muted-foreground",
            )}>
              {trendUp === true && <ArrowUpRight className="h-3 w-3" />}
              {trendUp === false && <ArrowDownRight className="h-3 w-3" />}
              {trend}
            </p>
          )}
        </div>
        <div className="h-11 w-11 flex items-center justify-center rounded-xl bg-primary/10 ring-1 ring-primary/10 transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
          <Icon className="h-5 w-5 text-primary transition-colors group-hover:text-primary-foreground" />
        </div>
      </div>
    </div>
  );
}
