import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { useAuthStore } from '@/store/authStore'
import { api, getErrorMessage, isLimitError } from '@/lib/api'
import type { RolWorkspace, Workspace, WorkspaceMember } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Plus,
  Loader2,
  Building2,
  Users,
  UserPlus,
  Trash2,
  Crown,
} from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

export default function WorkspacesPage() {
  const user = useAuthStore((s) => s.user)
  const { workspaces, currentWorkspace, fetchWorkspaces, setCurrentWorkspace } = useWorkspaceStore()
  const [members, setMembers] = useState<WorkspaceMember[]>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [inviteOpen, setInviteOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [nombre, setNombre] = useState('')
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRol, setInviteRol] = useState<RolWorkspace>('member')
  const [removingMember, setRemovingMember] = useState<WorkspaceMember | null>(null)

  useEffect(() => {
    fetchWorkspaces()
  }, [])

  useEffect(() => {
    if (!currentWorkspace) return
    setLoadingMembers(true)
    api
      .get<WorkspaceMember[]>(`/workspaces/${currentWorkspace.id}/members`)
      .then(({ data }) => setMembers(data))
      .catch((err) => toast({ title: getErrorMessage(err), variant: 'destructive' }))
      .finally(() => setLoadingMembers(false))
  }, [currentWorkspace?.id])

  const handleCreate = async () => {
    if (!nombre) return
    setSaving(true)
    try {
      const { data } = await api.post<Workspace>('/workspaces', { nombre })
      await fetchWorkspaces()
      setCurrentWorkspace(data)
      setCreateOpen(false)
      setNombre('')
      toast({ title: 'Workspace creado' })
    } catch (err) {
      const msg = getErrorMessage(err)
      toast({
        title: isLimitError(err) ? 'Límite de workspaces alcanzado' : 'Error',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleInvite = async () => {
    if (!inviteEmail || !currentWorkspace) return
    setSaving(true)
    try {
      await api.post(`/workspaces/${currentWorkspace.id}/invites`, {
        email: inviteEmail,
        rol: inviteRol,
      })
      setInviteOpen(false)
      setInviteEmail('')
      setInviteRol('member')
      toast({ title: 'Invitación enviada' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleRemoveMember = async (memberId: string) => {
    if (!currentWorkspace) return
    try {
      await api.delete(`/workspaces/${currentWorkspace.id}/members/${memberId}`)
      setMembers((m) => m.filter((x) => x.id !== memberId))
      toast({ title: 'Miembro eliminado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleUpdateRol = async (memberId: string, rol: RolWorkspace) => {
    if (!currentWorkspace) return
    try {
      const { data } = await api.put<WorkspaceMember>(
        `/workspaces/${currentWorkspace.id}/members/${memberId}`,
        { rol },
      )
      setMembers((m) => m.map((x) => (x.id === data.id ? data : x)))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const myRol = members.find((m) => m.user_id === user?.id)?.rol
  const canManage = myRol === 'owner' || myRol === 'admin'

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Workspaces</h1>
        <Button size="sm" className="h-10" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo
        </Button>
      </div>

      <div className="space-y-2">
        {workspaces.map((ws) => (
          <div
            key={ws.id}
            className={`flex items-center gap-3 border rounded-md px-4 py-3 cursor-pointer transition-colors ${
              currentWorkspace?.id === ws.id
                ? 'bg-primary/10 border-primary/30'
                : 'bg-card border-border hover:border-primary/20'
            }`}
            onClick={() => setCurrentWorkspace(ws)}
          >
            <Building2 className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="flex-1 text-sm font-medium">{ws.nombre}</span>
            {currentWorkspace?.id === ws.id && (
              <span className="text-xs text-primary font-medium">Activo</span>
            )}
          </div>
        ))}
      </div>

      {currentWorkspace && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold flex items-center gap-2">
              <Users className="h-4 w-4" />
              Miembros — {currentWorkspace.nombre}
            </h2>
            {canManage && (
              <Button size="sm" variant="outline" className="h-8" onClick={() => setInviteOpen(true)}>
                <UserPlus className="mr-1.5 h-3.5 w-3.5" />
                Invitar
              </Button>
            )}
          </div>

          {loadingMembers ? (
            <div className="flex items-center justify-center h-24">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-1.5">
              {members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 bg-card border border-border rounded-md px-3 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm truncate">{m.user?.email ?? m.user_id}</p>
                  </div>
                  {m.rol === 'owner' ? (
                    <span className="flex items-center gap-1 text-xs text-yellow-500">
                      <Crown className="h-3 w-3" /> Owner
                    </span>
                  ) : canManage && m.user_id !== user?.id ? (
                    <Select
                      value={m.rol}
                      onValueChange={(v) => handleUpdateRol(m.id, v as RolWorkspace)}
                    >
                      <SelectTrigger className="h-7 w-28 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="admin">Admin</SelectItem>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="viewer">Viewer</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{m.rol}</span>
                  )}
                  {canManage && m.rol !== 'owner' && m.user_id !== user?.id && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setRemovingMember(m)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <AlertDialog
        open={!!removingMember}
        onOpenChange={(v) => !v && setRemovingMember(null)}
        title="Eliminar miembro"
        description={removingMember ? `¿Eliminar a ${removingMember.user?.email ?? removingMember.user_id} del workspace?` : ''}
        confirmLabel="Eliminar"
        onConfirm={() => removingMember && handleRemoveMember(removingMember.id)}
      />

      <Dialog open={createOpen} onOpenChange={(v) => { if (!v) { setCreateOpen(false); setNombre('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo workspace</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Nombre del workspace"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setCreateOpen(false); setNombre('') }}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving || !nombre}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={inviteOpen} onOpenChange={(v) => { if (!v) { setInviteOpen(false); setInviteEmail('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Invitar miembro</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="email@ejemplo.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol</Label>
              <Select value={inviteRol} onValueChange={(v) => setInviteRol(v as RolWorkspace)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setInviteOpen(false); setInviteEmail('') }}>Cancelar</Button>
            <Button onClick={handleInvite} disabled={saving || !inviteEmail}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Invitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
