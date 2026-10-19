import { useEffect, useMemo, useState } from 'react';
import { Plus, Pencil, Trash2, Search, ShieldCheck, ShieldOff, UserCog, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  MODULES,
  MODULE_ACTIONS,
  MODULE_LABELS,
  ROLE_PRESETS,
  type Module,
  type Action,
  type PermissionMap,
  type UserProfile,
} from '@/lib/permissions';
import {
  deleteProfile,
  logEvent,
  patchProfile,
  saveProfile,
  subscribeProfiles,
} from '@/lib/userProfiles';
import { usePermissions } from '@/contexts/PermissionsContext';
import { useFarm } from '@/contexts/FarmContext';
import { useAuth } from '@/contexts/AuthContext';
import { authErrorMessage, createAuthUser, sendResetEmail } from '@/lib/authAdmin';
import userManagementSnapshot from '@/data/firebase-user-management-snapshot.json';

const snapshotProfiles = userManagementSnapshot.profiles as UserProfile[];

function emptyProfile(): UserProfile {
  return {
    uid: '',
    fullName: '',
    email: '',
    phone: '',
    username: '',
    role: 'Member',
    active: true,
    permissions: { dashboard: { view: true } },
    flockIds: 'all',
    isAdmin: false,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export default function UserManagementPage() {
  const { user } = useAuth();
  const { can, isAdmin } = usePermissions();
  const { batches } = useFarm();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<UserProfile | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<UserProfile | null>(null);
  const [statusTarget, setStatusTarget] = useState<UserProfile | null>(null);
  const [statusSaving, setStatusSaving] = useState(false);
  const [resetTarget, setResetTarget] = useState<UserProfile | null>(null);
  const [resetSending, setResetSending] = useState(false);
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    // Every account — including the demo login — reads and writes real RTDB
    // profiles so users created here survive sign-out. The bundled snapshot is
    // only a fallback when the database has no profiles at all.
    return subscribeProfiles((list) => {
      setProfiles(list.length ? list : [...snapshotProfiles]);
    });
  }, []);


  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = [...profiles].sort((a, b) => a.fullName.localeCompare(b.fullName));
    if (!q) return list;
    return list.filter(
      (p) =>
        p.fullName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q) ||
        p.username.toLowerCase().includes(q) ||
        p.role.toLowerCase().includes(q),
    );
  }, [profiles, search]);

  const canCreate = can('userManagement', 'create');
  const canEdit = can('userManagement', 'edit');
  const canDelete = can('userManagement', 'delete');

  const toggleActive = async (p: UserProfile) => {
    await patchProfile(p.uid, { active: !p.active });
    logEvent({
      actorUid: user?.uid || 'system',
      actorEmail: user?.email || undefined,
      type: p.active ? 'user.deactivate' : 'user.activate',
      targetUid: p.uid,
      targetLabel: p.fullName,
    });
    setProfiles((current) => current.map((item) =>
      item.uid === p.uid ? { ...item, active: !p.active, updatedAt: Date.now() } : item,
    ));
    toast.success(p.active
      ? `${p.fullName} has been disabled and can no longer sign in`
      : `${p.fullName} has been re-enabled and can sign in again`);
  };

  const confirmStatusChange = async () => {
    if (!statusTarget || statusSaving) return;
    setStatusSaving(true);
    try {
      await toggleActive(statusTarget);
      setStatusTarget(null);
    } catch (error) {
      toast.error((error as Error)?.message || 'Could not update account access');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleSave = async (profile: UserProfile, password?: string) => {
    const isNew = creating;
    let toSave = profile;
    if (isNew) {
      // Always create a real Firebase Auth account so the person can sign in,
      // and store the profile under that uid so permissions resolve at login.
      const uid = await createAuthUser(profile.email, password || '');
      toSave = { ...profile, uid };
    }
    await saveProfile(toSave);
    logEvent({
      actorUid: user?.uid || 'system',
      actorEmail: user?.email || undefined,
      type: isNew ? 'user.create' : 'user.update',
      targetUid: toSave.uid,
      targetLabel: toSave.fullName,
    });
    setProfiles((current) => {
      const exists = current.some((item) => item.uid === toSave.uid);
      return exists
        ? current.map((item) => item.uid === toSave.uid ? toSave : item)
        : [...current, toSave];
    });
    toast.success(isNew ? `${toSave.fullName} can now log in with ${toSave.email}` : 'User updated');
    setEditing(null);
    setCreating(false);
  };

  const handleDelete = async () => {
    if (!toDelete) return;
    await deleteProfile(toDelete.uid);
    logEvent({
      actorUid: user?.uid || 'system',
      actorEmail: user?.email || undefined,
      type: 'user.delete',
      targetUid: toDelete.uid,
      targetLabel: toDelete.fullName,
    });
    setProfiles((current) => current.filter((item) => item.uid !== toDelete.uid));
    toast.success(`${toDelete.fullName} deleted`);
    setToDelete(null);
  };


  const openPasswordReset = (profile: UserProfile) => {
    setResetError('');
    setResetTarget(profile);
  };

  const handlePasswordReset = async () => {
    if (!resetTarget?.email || resetSending) return;
    setResetError('');
    setResetSending(true);
    try {
      await sendResetEmail(resetTarget.email);
      toast.success(`Password reset email sent to ${resetTarget.email}`);
      setResetTarget(null);
    } catch (error) {
      setResetError(authErrorMessage(error));
    } finally {
      setResetSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="font-display text-2xl font-semibold flex items-center gap-2">
            <UserCog className="h-6 w-6 text-primary" /> User management
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Create system users and assign the modules and flocks they can access.
          </p>
        </div>
        {canCreate && (
          <Button
            onClick={() => {
              setCreating(true);
              setEditing(emptyProfile());
            }}
          >
            <Plus className="h-4 w-4 mr-2" /> New user
          </Button>
        )}
      </div>

      <div className="rounded-xl border bg-card">
        <div className="p-4 border-b flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search name, email, role…"
              className="pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <span className="text-xs text-muted-foreground ml-auto">
            {filtered.length} user{filtered.length === 1 ? '' : 's'}
          </span>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="sticky top-0 bg-muted/40 backdrop-blur">
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="hidden md:table-cell">Email</TableHead>
                <TableHead className="hidden lg:table-cell">Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden md:table-cell">Last login</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-10 text-muted-foreground text-sm">
                    No users match your search.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((p) => (
                <TableRow key={p.uid} className={!p.active ? 'bg-muted/20' : ''}>
                  <TableCell>
                    <div className="font-medium">{p.fullName}</div>
                    <div className="text-xs text-muted-foreground md:hidden">{p.email}</div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-muted-foreground">{p.email}</TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex items-center gap-2">
                      <span>{p.role}</span>
                      {p.isAdmin && <Badge variant="secondary">Admin</Badge>}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={p.active ? 'default' : 'outline'}
                      className={p.active ? 'bg-emerald-600 hover:bg-emerald-600' : ''}
                    >
                      {p.active ? 'Active' : 'Disabled'}
                    </Badge>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                    {p.lastLogin ? new Date(p.lastLogin).toLocaleString() : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      {canEdit && p.uid !== user?.uid && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setStatusTarget(p)}
                          title={p.active ? 'Disable user access' : 'Re-enable user access'}
                          aria-label={`${p.active ? 'Disable' : 'Re-enable'} access for ${p.fullName}`}
                          className={p.active ? 'hover:bg-destructive/10 hover:text-destructive' : 'text-emerald-600 hover:bg-emerald-500/10 hover:text-emerald-700'}
                        >
                          {p.active ? <ShieldOff className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
                        </Button>
                      )}
                      {canEdit && p.email && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => openPasswordReset(p)}
                          title={`Send password reset to ${p.email}`}
                          aria-label={`Reset password for ${p.fullName}`}
                        >
                          <KeyRound className="h-4 w-4" />
                        </Button>
                      )}
                      {canEdit && (
                        <Button size="icon" variant="ghost" onClick={() => { setCreating(false); setEditing(p); }}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {canDelete && p.uid !== user?.uid && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setToDelete(p)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">
          You are viewing user management with limited permissions. Only administrators can grant admin access.
        </p>
      )}

      {editing && (
        <UserEditor
          profile={editing}
          isNew={creating}
          flocks={batches.map((b) => ({ id: b.id, name: b.name || b.id }))}
          onCancel={() => { setEditing(null); setCreating(false); }}
          onSave={handleSave}
          allowAdminToggle={isAdmin}
        />
      )}

      <AlertDialog
        open={!!statusTarget}
        onOpenChange={(open) => !open && !statusSaving && setStatusTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className={`mb-2 flex h-11 w-11 items-center justify-center rounded-xl ${statusTarget?.active ? 'bg-destructive/10 text-destructive' : 'bg-emerald-500/10 text-emerald-600'}`}>
              {statusTarget?.active ? <ShieldOff className="h-5 w-5" /> : <ShieldCheck className="h-5 w-5" />}
            </div>
            <AlertDialogTitle>{statusTarget?.active ? 'Disable user access?' : 'Re-enable user access?'}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  {statusTarget?.active
                    ? <><strong className="text-foreground">{statusTarget?.fullName}</strong> will be signed out and blocked from logging in immediately.</>
                    : <><strong className="text-foreground">{statusTarget?.fullName}</strong> will be able to sign in again with their existing email and password.</>}
                </p>
                <p>The Firebase Authentication account and all audit history will be preserved.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusSaving}>Cancel</AlertDialogCancel>
            <Button
              onClick={confirmStatusChange}
              disabled={statusSaving}
              variant={statusTarget?.active ? 'destructive' : 'default'}
            >
              {statusSaving ? <><Loader2 className="h-4 w-4 animate-spin" />Updating…</> : statusTarget?.active ? <><ShieldOff className="h-4 w-4" />Disable access</> : <><ShieldCheck className="h-4 w-4" />Re-enable access</>}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!resetTarget}
        onOpenChange={(open) => {
          if (!open && !resetSending) {
            setResetTarget(null);
            setResetError('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send password reset email?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Firebase will email a secure reset link to{' '}
                  <strong className="text-foreground">{resetTarget?.email}</strong>.
                </p>
                <p>
                  The user's current password continues to work until they open the link and choose a new password.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          {resetError && (
            <div role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
              {resetError}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel disabled={resetSending}>Cancel</AlertDialogCancel>
            <Button onClick={handlePasswordReset} disabled={resetSending || !resetTarget?.email}>
              {resetSending ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Sending…</>
              ) : (
                <><KeyRound className="mr-2 h-4 w-4" /> Send reset email</>
              )}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove {toDelete?.fullName} from the system. Their audit history is preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- editor ----------

interface EditorProps {
  profile: UserProfile;
  isNew: boolean;
  flocks: Array<{ id: string; name: string }>;
  onCancel: () => void;
  onSave: (p: UserProfile, password?: string) => Promise<void> | void;
  allowAdminToggle: boolean;
}

function UserEditor({ profile, isNew, flocks, onCancel, onSave, allowAdminToggle }: EditorProps) {
  const [draft, setDraft] = useState<UserProfile>(profile);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof UserProfile>(k: K, v: UserProfile[K]) =>
    setDraft((d) => ({ ...d, [k]: v }));

  const togglePerm = (m: Module, a: Action, on: boolean) => {
    setDraft((d) => {
      const perms: PermissionMap = { ...(d.permissions || {}) };
      const mod = { ...(perms[m] || {}) };
      if (on) mod[a] = true;
      else delete mod[a];
      if (Object.keys(mod).length === 0) delete perms[m];
      else perms[m] = mod;
      return { ...d, permissions: perms };
    });
  };

  const applyPreset = (id: string) => {
    const preset = ROLE_PRESETS.find((r) => r.id === id);
    if (!preset) return;
    setDraft((d) => ({
      ...d,
      role: preset.label,
      isAdmin: id === 'administrator' && allowAdminToggle ? true : false,
      permissions: JSON.parse(JSON.stringify(preset.permissions)),
    }));
  };

  const toggleFlock = (id: string) => {
    setDraft((d) => {
      if (d.flockIds === 'all') return { ...d, flockIds: [id] };
      const set = new Set(d.flockIds);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return { ...d, flockIds: Array.from(set) };
    });
  };

  const passwordOk = !isNew || (password.length >= 6 && password === confirm);
  const valid = Boolean(
    draft.fullName.trim() && draft.email.trim() && draft.username.trim() && passwordOk,
  );

  const submit = async () => {
    setError('');
    setSaving(true);
    try {
      await onSave(draft, isNew ? password : undefined);
    } catch (err) {
      setError(authErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const resetPassword = async () => {
    setError('');
    try {
      await sendResetEmail(draft.email);
      toast.success(`Password reset email sent to ${draft.email}`);
    } catch (err) {
      setError(authErrorMessage(err));
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onCancel()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isNew ? 'New user' : `Edit ${profile.fullName || 'user'}`}</DialogTitle>
          <DialogDescription>
            {isNew
              ? 'Set a login email and password, then choose the modules and flocks this user can access.'
              : "Configure the user's details, module permissions, and flock assignments."}
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="details" className="mt-2">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="details">Details</TabsTrigger>
            <TabsTrigger value="permissions">Permissions</TabsTrigger>
            <TabsTrigger value="flocks">Flocks</TabsTrigger>
          </TabsList>

          <TabsContent value="details" className="space-y-4 pt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Full name" required>
                <Input value={draft.fullName} onChange={(e) => set('fullName', e.target.value)} />
              </Field>
              <Field label="Email" required>
                <Input
                  type="email"
                  value={draft.email}
                  disabled={!isNew}
                  onChange={(e) => set('email', e.target.value)}
                />
              </Field>
              <Field label="Phone">
                <Input value={draft.phone || ''} onChange={(e) => set('phone', e.target.value)} />
              </Field>
              <Field label="Username" required>
                <Input value={draft.username} onChange={(e) => set('username', e.target.value)} />
              </Field>
              <Field label="Role label">
                <Input value={draft.role} onChange={(e) => set('role', e.target.value)} />
              </Field>
              <Field label="Apply preset">
                <Select onValueChange={applyPreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose a role preset…" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_PRESETS.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {isNew ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 rounded-lg border bg-muted/30 p-3">
                <Field label="Password" required>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </Field>
                <Field label="Confirm password" required>
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                  />
                </Field>
                <p className="sm:col-span-2 text-xs text-muted-foreground">
                  {password && password.length < 6
                    ? 'Password must be at least 6 characters.'
                    : password && confirm && password !== confirm
                      ? 'Passwords do not match.'
                      : 'The user signs in with this email and password.'}
                </p>
              </div>
            ) : (
              <div className="rounded-lg border bg-muted/30 p-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-muted-foreground">
                  Passwords can't be read back. Send a reset link to let this user choose a new one.
                </p>
                <Button type="button" variant="outline" size="sm" onClick={resetPassword}>
                  Send password reset
                </Button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-6 pt-2">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={draft.active} onCheckedChange={(v) => set('active', v)} />
                Active
              </label>
              {allowAdminToggle && (
                <label className="flex items-center gap-2 text-sm">
                  <Switch
                    checked={Boolean(draft.isAdmin)}
                    onCheckedChange={(v) => set('isAdmin', v)}
                  />
                  Administrator (full access)
                </label>
              )}
            </div>
          </TabsContent>

          <TabsContent value="permissions" className="pt-4">
            {draft.isAdmin ? (
              <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
                Administrators automatically have every permission.
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 font-medium">Module</th>
                      {(['view', 'create', 'edit', 'delete', 'export', 'approve'] as Action[]).map((a) => (
                        <th key={a} className="px-3 py-2 font-medium text-center capitalize">
                          {a}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MODULES.map((m) => (
                      <tr key={m} className="border-t">
                        <td className="px-3 py-2 font-medium">{MODULE_LABELS[m]}</td>
                        {(['view', 'create', 'edit', 'delete', 'export', 'approve'] as Action[]).map((a) => {
                          const supported = MODULE_ACTIONS[m].includes(a);
                          const checked = Boolean(draft.permissions?.[m]?.[a]);
                          return (
                            <td key={a} className="px-3 py-2 text-center">
                              {supported ? (
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(v) => togglePerm(m, a, !!v)}
                                />
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          <TabsContent value="flocks" className="space-y-4 pt-4">
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={draft.flockIds === 'all'}
                onCheckedChange={(v) => set('flockIds', v ? 'all' : [])}
              />
              Access all flocks
            </label>
            {draft.flockIds !== 'all' && (
              <div className="rounded-lg border p-3 max-h-72 overflow-y-auto space-y-2">
                {flocks.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    No flocks yet. Create flocks first, then assign them here.
                  </p>
                )}
                {flocks.map((f) => (
                  <label key={f.id} className="flex items-center gap-3 text-sm">
                    <Checkbox
                      checked={draft.flockIds.includes(f.id)}
                      onCheckedChange={() => toggleFlock(f.id)}
                    />
                    <span>{f.name}</span>
                  </label>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>

        <DialogFooter className="mt-4">
          {error && (
            <p className="text-sm text-destructive mr-auto self-center">{error}</p>
          )}
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button disabled={!valid || saving} onClick={submit}>
            {saving ? 'Saving…' : isNew ? 'Create user' : 'Save user'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </Label>
      {children}
    </div>
  );
}
