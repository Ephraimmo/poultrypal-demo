// Permission model for RBAC.
// Modules are the top-level areas of the app. Each module has a set of actions
// (view, create, edit, delete, export, approve). Administrators grant users
// exactly the (module, action) pairs they need.

export const MODULES = [
  'dashboard',
  'flocks',
  'environment',
  'feeding',
  'health',
  'vaccinations',
  'mortality',
  'eggProduction',
  'sales',
  'customers',
  'inventory',
  'finance',
  'expenses',
  'payments',
  'reports',
  'userManagement',
  'settings',
] as const;

export type Module = (typeof MODULES)[number];

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'approve'] as const;
export type Action = (typeof ACTIONS)[number];

export const MODULE_LABELS: Record<Module, string> = {
  dashboard: 'Dashboard',
  flocks: 'Flocks',
  environment: 'Environment',
  feeding: 'Feeding',
  health: 'Health',
  vaccinations: 'Vaccinations',
  mortality: 'Mortality',
  eggProduction: 'Egg Production',
  sales: 'Sales',
  customers: 'Customers',
  inventory: 'Inventory',
  finance: 'Finance',
  expenses: 'Expenses',
  payments: 'Payments',
  reports: 'Reports',
  userManagement: 'User Management',
  settings: 'Settings',
};

// Actions that make sense per module. Approve is only meaningful for a few.
export const MODULE_ACTIONS: Record<Module, readonly Action[]> = {
  dashboard: ['view'],
  flocks: ['view', 'create', 'edit', 'delete', 'export'],
  environment: ['view', 'create', 'edit', 'delete', 'export'],
  feeding: ['view', 'create', 'edit', 'delete', 'export'],
  health: ['view', 'create', 'edit', 'delete', 'export'],
  vaccinations: ['view', 'create', 'edit', 'delete', 'export'],
  mortality: ['view', 'create', 'edit', 'delete', 'export'],
  eggProduction: ['view', 'create', 'edit', 'delete', 'export'],
  sales: ['view', 'create', 'edit', 'delete', 'export', 'approve'],
  customers: ['view', 'create', 'edit', 'delete', 'export'],
  inventory: ['view', 'create', 'edit', 'delete', 'export'],
  finance: ['view', 'export', 'approve'],
  expenses: ['view', 'create', 'edit', 'delete', 'export', 'approve'],
  payments: ['view', 'create', 'edit', 'delete', 'export', 'approve'],
  reports: ['view', 'export'],
  userManagement: ['view', 'create', 'edit', 'delete'],
  settings: ['view', 'edit'],
};

export type PermissionMap = Partial<Record<Module, Partial<Record<Action, boolean>>>>;

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  phone?: string;
  username: string;
  role: string; // free-form label, e.g. "Farm Manager"
  active: boolean;
  permissions: PermissionMap;
  flockIds: string[] | 'all'; // 'all' = every flock (default for admins)
  lastLogin?: number;
  createdAt: number;
  updatedAt: number;
  isAdmin?: boolean; // full access shortcut
}

export function hasPermission(
  profile: UserProfile | null | undefined,
  module: Module,
  action: Action = 'view',
): boolean {
  if (!profile) return false;
  if (!profile.active) return false;
  if (profile.isAdmin) return true;
  return Boolean(profile.permissions?.[module]?.[action]);
}

export function canSeeAnyOf(
  profile: UserProfile | null | undefined,
  modules: readonly Module[],
): boolean {
  return modules.some((m) => hasPermission(profile, m, 'view'));
}

export function visibleFlocks<T extends { id: string }>(
  profile: UserProfile | null | undefined,
  flocks: T[],
): T[] {
  if (!profile) return [];
  if (profile.isAdmin || profile.flockIds === 'all') return flocks;
  const allowed = new Set(profile.flockIds);
  return flocks.filter((f) => allowed.has(f.id));
}

// Preset role templates the admin can apply from the User Management UI.
export const ROLE_PRESETS: Array<{
  id: string;
  label: string;
  description: string;
  permissions: PermissionMap;
}> = [
  {
    id: 'administrator',
    label: 'Administrator',
    description: 'Full access to every module and setting.',
    permissions: Object.fromEntries(
      MODULES.map((m) => [
        m,
        Object.fromEntries(MODULE_ACTIONS[m].map((a) => [a, true])),
      ]),
    ) as PermissionMap,
  },
  {
    id: 'farmManager',
    label: 'Farm Manager',
    description: 'Dashboard, Flocks, Environment, Health, Feeding, Reports.',
    permissions: {
      dashboard: { view: true },
      flocks: { view: true, create: true, edit: true, export: true },
      environment: { view: true, create: true, edit: true, export: true },
      feeding: { view: true, create: true, edit: true, export: true },
      health: { view: true, create: true, edit: true, export: true },
      vaccinations: { view: true, create: true, edit: true },
      mortality: { view: true, create: true, edit: true },
      reports: { view: true, export: true },
    },
  },
  {
    id: 'financeOfficer',
    label: 'Finance Officer',
    description: 'Finance, Expenses, Payments, Financial Reports.',
    permissions: {
      dashboard: { view: true },
      finance: { view: true, export: true, approve: true },
      expenses: { view: true, create: true, edit: true, export: true, approve: true },
      payments: { view: true, create: true, edit: true, export: true, approve: true },
      reports: { view: true, export: true },
    },
  },
  {
    id: 'salesOfficer',
    label: 'Sales Officer',
    description: 'Sales, Customers, Egg Sales, Reports.',
    permissions: {
      dashboard: { view: true },
      sales: { view: true, create: true, edit: true, export: true },
      customers: { view: true, create: true, edit: true, export: true },
      eggProduction: { view: true, create: true, edit: true },
      reports: { view: true, export: true },
    },
  },
  {
    id: 'operationsOfficer',
    label: 'Operations Officer',
    description: 'Flocks, Feeding, Environment, Health.',
    permissions: {
      dashboard: { view: true },
      flocks: { view: true, create: true, edit: true },
      feeding: { view: true, create: true, edit: true },
      environment: { view: true, create: true, edit: true },
      health: { view: true, create: true, edit: true },
      mortality: { view: true, create: true, edit: true },
    },
  },
];
