import { ReactNode } from 'react';
import { useCan } from '@/contexts/PermissionsContext';
import type { Action, Module } from '@/lib/permissions';

interface CanProps {
  module: Module;
  action?: Action;
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Renders `children` only when the current user has the given permission.
 * Use it to hide Create/Export buttons, whole cards, etc.
 *
 *   <Can module="sales" action="create">
 *     <Button>New sale</Button>
 *   </Can>
 */
export function Can({ module, action = 'view', fallback = null, children }: CanProps) {
  const allowed = useCan(module, action);
  return <>{allowed ? children : fallback}</>;
}
