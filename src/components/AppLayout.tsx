import Logo from '@/components/Logo';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Bird, Skull, ShoppingCart, Wheat,
  Heart, Thermometer, DollarSign, Package, BarChart3,
  ChevronLeft, Menu, PieChart, Settings, LogOut, Wallet, Users, HandCoins,
  ChevronDown, LucideIcon, Sprout, UserCog, Calculator,
} from 'lucide-react';
import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { useFarm } from '@/contexts/FarmContext';
import { useAuth } from '@/contexts/AuthContext';
import { usePermissions } from '@/contexts/PermissionsContext';
import type { Module } from '@/lib/permissions';
import LoadingScreen from '@/components/LoadingScreen';
import { Button } from '@/components/ui/button';

type NavItem = { to: string; icon: LucideIcon; label: string; module: Module };
type NavGroup = { id: string; label: string; icon: LucideIcon; items: NavItem[] };
type NavEntry = NavItem | NavGroup;

const isGroup = (e: NavEntry): e is NavGroup => 'items' in e;

const navEntries: NavEntry[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', module: 'dashboard' },
  {
    id: 'flock', label: 'Flock', icon: Bird,
    items: [
      { to: '/batches', icon: Bird, label: 'Batches', module: 'flocks' },
      { to: '/mortality', icon: Skull, label: 'Mortality', module: 'mortality' },
      { to: '/harvest', icon: Sprout, label: 'Harvest', module: 'flocks' },
    ],
  },
  {
    id: 'payments', label: 'Payments', icon: Wallet,
    items: [
      { to: '/sales', icon: ShoppingCart, label: 'Sales', module: 'sales' },
      { to: '/collections', icon: Wallet, label: 'Collections', module: 'payments' },
      { to: '/advances', icon: HandCoins, label: 'Advances', module: 'payments' },
      { to: '/buyers', icon: Users, label: 'Buyers', module: 'customers' },
    ],
  },
  {
    id: 'feed', label: 'Feed', icon: Wheat,
    items: [
      { to: '/feed', icon: Wheat, label: 'Feed Records', module: 'feeding' },
      { to: '/feed-settings', icon: Settings, label: 'Feed Settings', module: 'feeding' },
      { to: '/inventory', icon: Package, label: 'Inventory', module: 'inventory' },
    ],
  },
  {
    id: 'operations', label: 'Operations', icon: Heart,
    items: [
      { to: '/health', icon: Heart, label: 'Health', module: 'health' },
      { to: '/environment', icon: Thermometer, label: 'Environment', module: 'environment' },
    ],
  },
  {
    id: 'finance', label: 'Finance', icon: DollarSign,
    items: [
      { to: '/expenses', icon: DollarSign, label: 'Expenses', module: 'expenses' },
      { to: '/cost-profit', icon: PieChart, label: 'Cost & Profit', module: 'finance' },
      { to: '/growth-calculator', icon: Calculator, label: 'Growth Calculator', module: 'finance' },
    ],
  },
  { to: '/reports', icon: BarChart3, label: 'Reports', module: 'reports' },
  { to: '/users', icon: UserCog, label: 'User Management', module: 'userManagement' },
];

// Flatten for header title lookup
const flatItems: NavItem[] = navEntries.flatMap(e => (isGroup(e) ? e.items : [e]));

const GROUP_STORAGE_KEY = 'nav:openGroups';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { loaded } = useFarm();
  const { user, logout } = useAuth();
  const { can, profile } = usePermissions();
  const location = useLocation();

  // Filter nav entries by view-permission. Groups with no visible items are hidden entirely.
  const visibleEntries = useMemo<NavEntry[]>(() => {
    return navEntries
      .map<NavEntry | null>(entry => {
        if (!isGroup(entry)) return can(entry.module, 'view') ? entry : null;
        const items = entry.items.filter(i => can(i.module, 'view'));
        return items.length ? { ...entry, items } : null;
      })
      .filter((e): e is NavEntry => e !== null);
  }, [can, profile]);

  const visibleFlat: NavItem[] = visibleEntries.flatMap(e => (isGroup(e) ? e.items : [e]));

  // Determine which group contains the active route
  const activeGroupId = visibleEntries.find(e => isGroup(e) && e.items.some(i => i.to === location.pathname)) as NavGroup | undefined;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const raw = window.localStorage.getItem(GROUP_STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return {};
  });

  // Auto-open the group that contains the current route
  useEffect(() => {
    if (activeGroupId?.id) {
      setOpenGroups(prev => (prev[activeGroupId.id] ? prev : { ...prev, [activeGroupId.id]: true }));
    }
  }, [activeGroupId?.id]);

  useEffect(() => {
    try { window.localStorage.setItem(GROUP_STORAGE_KEY, JSON.stringify(openGroups)); } catch { /* ignore */ }
  }, [openGroups]);

  const toggleGroup = (id: string) => setOpenGroups(prev => ({ ...prev, [id]: !prev[id] }));

  const currentLabel = visibleFlat.find(n => n.to === location.pathname)?.label || 'PoultryPro';
  const displayName = profile?.fullName || user?.displayName || user?.email?.split('@')[0] || 'User';
  const initials = displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('') || 'U';

  return (
    <div className="flex h-screen overflow-hidden app-canvas">
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/45 backdrop-blur-sm md:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside className={cn(
        "fixed md:relative z-50 h-full bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 shadow-2xl shadow-black/10",
        collapsed ? "w-[72px]" : "w-[272px]",
        mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
      )}>
        <div className={cn("flex items-center gap-3 px-4 h-[76px] border-b border-sidebar-border/80", collapsed && "justify-center px-2")}>
          <div className="h-10 w-10 rounded-xl bg-sidebar-primary/15 ring-1 ring-sidebar-primary/25 flex items-center justify-center shrink-0 shadow-inner">
            <Logo className="h-6 w-6 text-sidebar-primary" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <span className="block font-display text-lg font-extrabold tracking-tight text-sidebar-primary-foreground">PoultryPro</span>
              <span className="block text-[10px] uppercase tracking-[0.18em] font-semibold text-sidebar-foreground/45">Farm intelligence</span>
            </div>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {visibleEntries.map(entry => {
            if (!isGroup(entry)) {
              const active = location.pathname === entry.to;
              return (
                <NavLink
                  key={entry.to}
                  to={entry.to}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    "relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    active ? "bg-sidebar-primary/12 text-sidebar-primary ring-1 ring-inset ring-sidebar-primary/15 shadow-sm"
                           : "text-sidebar-foreground/68 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground"
                  )}
                  title={collapsed ? entry.label : undefined}
                >
                  <entry.icon className="h-5 w-5 shrink-0" />
                  {!collapsed && <span>{entry.label}</span>}
                </NavLink>
              );
            }

            const groupActive = entry.items.some(i => i.to === location.pathname);
            const isOpen = collapsed ? true : (openGroups[entry.id] ?? groupActive);

            if (collapsed) {
              // In collapsed mode render items flat with tooltip titles
              return (
                <div key={entry.id} className="space-y-0.5 py-0.5">
                  {entry.items.map(item => {
                    const active = location.pathname === item.to;
                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        onClick={() => setMobileOpen(false)}
                        title={`${entry.label} · ${item.label}`}
                        className={cn(
                          "flex items-center justify-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                          active ? "bg-sidebar-accent text-sidebar-primary"
                                 : "text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                        )}
                      >
                        <item.icon className="h-5 w-5 shrink-0" />
                      </NavLink>
                    );
                  })}
                </div>
              );
            }

            return (
              <div key={entry.id} className="space-y-0.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(entry.id)}
                  aria-expanded={isOpen}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all",
                    groupActive
                      ? "text-sidebar-primary bg-sidebar-primary/[0.06]"
                      : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                  )}
                >
                  <entry.icon className="h-5 w-5 shrink-0" />
                  <span className="flex-1 text-left">{entry.label}</span>
                  <ChevronDown className={cn("h-4 w-4 transition-transform text-sidebar-foreground/40", isOpen && "rotate-180")} />
                </button>
                {isOpen && (
                  <div className="ml-5 pl-3 border-l border-sidebar-primary/15 space-y-1 py-1">
                    {entry.items.map(item => {
                      const active = location.pathname === item.to;
                      return (
                        <NavLink
                          key={item.to}
                          to={item.to}
                          onClick={() => setMobileOpen(false)}
                          className={cn(
                            "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all",
                            active
                              ? "bg-sidebar-primary/12 text-sidebar-primary font-semibold"
                              : "text-sidebar-foreground/65 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
                          )}
                        >
                          <item.icon className="h-4 w-4 shrink-0" />
                          <span>{item.label}</span>
                        </NavLink>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border/80 p-3">
          <div className={cn("flex items-center gap-3 rounded-xl bg-sidebar-accent/55 p-2.5", collapsed && "justify-center p-2")}>
            <div className="h-8 w-8 rounded-lg bg-sidebar-primary/15 text-sidebar-primary flex items-center justify-center text-xs font-bold ring-1 ring-sidebar-primary/20 shrink-0">
              {initials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-sidebar-accent-foreground truncate">{displayName}</p>
                <p className="text-[10px] text-sidebar-foreground/45 truncate">{profile?.role || 'Farm member'}</p>
              </div>
            )}
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="hidden md:flex mt-2 w-full items-center justify-center py-2 rounded-lg text-sidebar-foreground/45 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto app-canvas">
        <header className="sticky top-0 z-30 h-[76px] bg-background/82 backdrop-blur-xl border-b border-border/75 px-4 md:px-7 flex items-center justify-between shadow-[0_1px_0_hsl(var(--border)/.35)]">
          <div className="flex items-center gap-3 min-w-0">
            <button className="md:hidden h-9 w-9 flex items-center justify-center rounded-xl border bg-card hover:bg-accent" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0">
              <h1 className="font-display text-lg md:text-xl font-extrabold capitalize truncate">{currentLabel}</h1>
              <p className="hidden sm:block text-[11px] text-muted-foreground mt-0.5">Monitor performance and manage your farm</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 md:gap-2">
            <div className="hidden lg:flex items-center gap-2.5 rounded-xl border border-border/80 bg-card/75 px-3 py-1.5 shadow-sm">
              <div className="h-7 w-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold">{initials}</div>
              <div className="max-w-[150px]">
                <p className="text-xs font-semibold leading-tight truncate">{displayName}</p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
              </div>
            </div>
            
            <Button variant="ghost" size="sm" onClick={logout} className="h-9 rounded-xl text-muted-foreground hover:text-destructive hover:bg-destructive/10">
              <LogOut className="h-4 w-4 md:mr-1.5" />
              <span className="hidden md:inline">Logout</span>
            </Button>
          </div>
        </header>
        <div className="app-content w-full max-w-[1680px] mx-auto p-4 md:p-7 lg:p-8 fade-in">
          {loaded ? children : <LoadingScreen />}
        </div>
      </main>
    </div>
  );
}
