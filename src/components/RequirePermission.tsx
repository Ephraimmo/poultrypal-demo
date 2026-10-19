import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { usePermissions } from '@/contexts/PermissionsContext';
import type { Action, Module } from '@/lib/permissions';
import LoadingScreen from '@/components/LoadingScreen';

interface Props {
  module: Module;
  action?: Action;
  children: ReactNode;
}

/**
 * Route-level gate. If the user lacks View permission on the module they are
 * redirected to the Access Denied screen. Inactive accounts are also denied.
 */
export default function RequirePermission({ module, action = 'view', children }: Props) {
  const { profile, loading, can } = usePermissions();

  if (loading) return <LoadingScreen />;
  if (!profile || !profile.active) return <Navigate to="/access-denied" replace />;
  if (!can(module, action)) return <Navigate to="/access-denied" replace />;

  return <>{children}</>;
}
