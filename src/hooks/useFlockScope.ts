import { useCallback, useMemo } from 'react';
import { usePermissions } from '@/contexts/PermissionsContext';

/**
 * Flock-based data scoping.
 *
 * Admins (and profiles with `flockIds: 'all'`) see everything. Everyone else is
 * limited to the batches/flocks explicitly assigned to their profile, across
 * every table and chart.
 */
export function useFlockScope() {
  const { profile } = usePermissions();

  const allowed = useMemo<Set<string> | null>(() => {
    if (!profile) return new Set<string>();
    if (profile.isAdmin || profile.flockIds === 'all') return null; // null = unrestricted
    return new Set(Array.isArray(profile.flockIds) ? profile.flockIds : []);
  }, [profile]);

  const isAllowed = useCallback(
    (batchId: string | undefined | null) => {
      if (allowed === null) return true;
      if (!batchId) return false;
      return allowed.has(batchId);
    },
    [allowed],
  );

  const scope = useCallback(
    <T,>(items: readonly T[], getBatchId: (item: T) => string | undefined | null): T[] => {
      if (allowed === null) return [...items];
      return items.filter((i) => isAllowed(getBatchId(i)));
    },
    [allowed, isAllowed],
  );

  return { unrestricted: allowed === null, isAllowed, scope };
}
