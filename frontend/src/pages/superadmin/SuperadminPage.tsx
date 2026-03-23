import { useEffect, useState } from 'react'
import { api, getErrorMessage } from '@/lib/api'
import type { Plan, User } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { Loader2, Pencil, Plus, Trash2, KeyRound, Building2, ChevronDown, ChevronUp, Copy, Check } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { Skeleton } from '@/components/ui/skeleton'

type Metrics = {
  total_users: number
  active_users: number
  total_workspaces: number
  total_proyectos: number
  total_tareas: number
}

type UserWorkspace = {
  workspace_id: string
  nombre: string
  rol: string
  proyectos_count: number
  created_at: string
}

export default function SuperadminPage() {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Plan modal
  const [planOpen, setPlanOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<Plan | null>(null)
  const [planForm, setPlanForm] = useState({
    nombre: '',
    max_workspaces: '1',
    max_proyectos_por_workspace: '5',
    max_tareas_por_proyecto: '100',
    max_miembros_por_workspace: '3',
    max_gastos_por_proyecto: '50',
    max_presupuestos_por_workspace: '10',
    precio: '0',
    activo: true,
    es_default: false,
  })

  // Assign plan
  const [assignPlanOpen, setAssignPlanOpen] = useState(false)
  const [assignUser, setAssignUser] = useState<User | null>(null)
  const [assignPlanId, setAssignPlanId] = useState('')

  // Edit user
  const [editUserOpen, setEditUserOpen] = useState(false)
  const [editUser, setEditUser] = useState<User | null>(null)
  const [editUserForm, setEditUserForm] = useState({ nombre: '', email: '' })

  // Delete user
  const [deleteUser, setDeleteUser] = useState<User | null>(null)

  // Reset password
  const [resetPasswordUser, setResetPasswordUser] = useState<User | null>(null)
  const [resetPasswordResult, setResetPasswordResult] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Workspaces expansion
  const [expandedUser, setExpandedUser] = useState<string | null>(null)
  const [userWorkspaces, setUserWorkspaces] = useState<Record<string, UserWorkspace[]>>({})
  const [loadingWorkspaces, setLoadingWorkspaces] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const [planesRes, usersRes, metricsRes] = await Promise.all([
        api.get<Plan[]>('/superadmin/plans'),
        api.get<User[]>('/superadmin/users'),
        api.get<Metrics>('/superadmin/metrics'),
      ])
      setPlanes(planesRes.data)
      setUsers(usersRes.data)
      setMetrics(metricsRes.data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const toggleUserWorkspaces = async (userId: string) => {
    if (expandedUser === userId) {
      setExpandedUser(null)
      return
    }
    setExpandedUser(userId)
    if (userWorkspaces[userId]) return
    setLoadingWorkspaces(userId)
    try {
      const { data } = await api.get<UserWorkspace[]>(`/superadmin/users/${userId}/workspaces`)
      setUserWorkspaces((prev) => ({ ...prev, [userId]: data }))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoadingWorkspaces(null)
    }
  }

  const openCreatePlan = () => {
    setEditPlan(null)
    setPlanForm({ nombre: '', max_workspaces: '1', max_proyectos_por_workspace: '5', max_tareas_por_proyecto: '100', max_miembros_por_workspace: '3', max_gastos_por_proyecto: '50', max_presupuestos_por_workspace: '10', precio: '0', activo: true, es_default: false })
    setPlanOpen(true)
  }

  const openEditPlan = (plan: Plan) => {
    setEditPlan(plan)
    setPlanForm({
      nombre: plan.nombre,
      max_workspaces: plan.max_workspaces.toString(),
      max_proyectos_por_workspace: plan.max_proyectos_por_workspace.toString(),
      max_tareas_por_proyecto: plan.max_tareas_por_proyecto.toString(),
      max_miembros_por_workspace: plan.max_miembros_por_workspace.toString(),
      max_gastos_por_proyecto: plan.max_gastos_por_proyecto.toString(),
      max_presupuestos_por_workspace: plan.max_presupuestos_por_workspace.toString(),
      precio: plan.precio.toString(),
      activo: plan.activo,
      es_default: plan.es_default,
    })
    setPlanOpen(true)
  }

  const handleSavePlan = async () => {
    if (!planForm.nombre) return
    setSaving(true)
    try {
      const payload = {
        nombre: planForm.nombre,
        max_workspaces: parseInt(planForm.max_workspaces),
        max_proyectos_por_workspace: parseInt(planForm.max_proyectos_por_workspace),
        max_tareas_por_proyecto: parseInt(planForm.max_tareas_por_proyecto),
        max_miembros_por_workspace: parseInt(planForm.max_miembros_por_workspace),
        max_gastos_por_proyecto: parseInt(planForm.max_gastos_por_proyecto),
        max_presupuestos_por_workspace: parseInt(planForm.max_presupuestos_por_workspace),
        precio: parseFloat(planForm.precio),
        activo: planForm.activo,
        es_default: planForm.es_default,
      }
      if (editPlan) {
        const { data } = await api.put<Plan>(`/superadmin/plans/${editPlan.id}`, payload)
        setPlanes((p) => p.map((x) => (x.id === data.id ? data : x)))
        toast({ title: 'Plan actualizado' })
      } else {
        const { data } = await api.post<Plan>('/superadmin/plans', payload)
        setPlanes((p) => [...p, data])
        toast({ title: 'Plan creado' })
      }
      setPlanOpen(false)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleToggleActive = async (user: User) => {
    try {
      const { data } = await api.put<User>(`/superadmin/users/${user.id}`, { is_active: !user.is_active })
      setUsers((u) => u.map((x) => (x.id === data.id ? data : x)))
      toast({ title: data.is_active ? 'Usuario activado' : 'Usuario desactivado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleAssignPlan = async () => {
    if (!assignUser || !assignPlanId) return
    setSaving(true)
    try {
      const { data } = await api.put<User>(`/superadmin/users/${assignUser.id}/plan`, { plan_id: assignPlanId })
      setUsers((u) => u.map((x) => (x.id === data.id ? data : x)))
      setAssignPlanOpen(false)
      setAssignUser(null)
      setAssignPlanId('')
      toast({ title: 'Plan asignado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleEditUser = async () => {
    if (!editUser) return
    setSaving(true)
    try {
      const payload: Record<string, string> = {}
      if (editUserForm.nombre !== editUser.nombre) payload.nombre = editUserForm.nombre
      if (editUserForm.email !== editUser.email) payload.email = editUserForm.email
      if (Object.keys(payload).length === 0) { setEditUserOpen(false); return }
      const { data } = await api.put<User>(`/superadmin/users/${editUser.id}`, payload)
      setUsers((u) => u.map((x) => (x.id === data.id ? data : x)))
      setEditUserOpen(false)
      toast({ title: 'Usuario actualizado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteUser = async () => {
    if (!deleteUser) return
    try {
      await api.delete(`/superadmin/users/${deleteUser.id}`)
      setUsers((u) => u.filter((x) => x.id !== deleteUser.id))
      setDeleteUser(null)
      toast({ title: 'Usuario eliminado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleResetPassword = async (user: User) => {
    setResetPasswordUser(user)
    setResetPasswordResult(null)
    setSaving(true)
    try {
      const { data } = await api.post<{ new_password: string }>(`/superadmin/users/${user.id}/reset-password`)
      setResetPasswordResult(data.new_password)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
      setResetPasswordUser(null)
    } finally {
      setSaving(false)
    }
  }

  const copyPassword = () => {
    if (!resetPasswordResult) return
    navigator.clipboard.writeText(resetPasswordResult)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-6 w-32" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}
        </div>
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-md" />)}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-xl font-semibold">Panel Superadmin</h1>

      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Usuarios totales', value: metrics.total_users },
            { label: 'Usuarios activos', value: metrics.active_users },
            { label: 'Workspaces', value: metrics.total_workspaces },
            { label: 'Proyectos', value: metrics.total_proyectos },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value ?? 0}</p>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="usuarios">
        <TabsList>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
          <TabsTrigger value="planes">Planes</TabsTrigger>
        </TabsList>

        <TabsContent value="usuarios" className="mt-4 space-y-2">
          {users.map((user) => (
            <div key={user.id} className="border border-border rounded-lg overflow-hidden">
              {/* User row */}
              <div className="flex items-center gap-3 bg-card px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium truncate">{user.nombre ?? user.email}</p>
                    {user.is_superadmin && (
                      <Badge variant="outline" className="text-xs text-yellow-500 border-yellow-500/40">superadmin</Badge>
                    )}
                    {!user.is_active && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">inactivo</Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>

                <div className="flex items-center gap-1 flex-shrink-0">
                  <span className="text-xs text-muted-foreground mr-1 hidden sm:inline">
                    {planes.find((p) => p.id === user.plan_id)?.nombre ?? '—'}
                  </span>

                  {/* Workspaces toggle */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => toggleUserWorkspaces(user.id)}
                    title="Ver workspaces"
                  >
                    <Building2 className="h-3.5 w-3.5" />
                  </Button>

                  {/* Edit */}
                  {!user.is_superadmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => {
                        setEditUser(user)
                        setEditUserForm({ nombre: user.nombre ?? '', email: user.email })
                        setEditUserOpen(true)
                      }}
                      title="Editar usuario"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Assign plan */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => {
                      setAssignUser(user)
                      setAssignPlanId(user.plan_id ?? '')
                      setAssignPlanOpen(true)
                    }}
                    title="Cambiar plan"
                  >
                    Plan
                  </Button>

                  {/* Reset password */}
                  {!user.is_superadmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-orange-500"
                      onClick={() => handleResetPassword(user)}
                      title="Resetear contraseña"
                    >
                      <KeyRound className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Toggle active */}
                  {!user.is_superadmin && (
                    <Switch
                      checked={user.is_active}
                      onCheckedChange={() => handleToggleActive(user)}
                      title={user.is_active ? 'Desactivar' : 'Activar'}
                    />
                  )}

                  {/* Delete */}
                  {!user.is_superadmin && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => setDeleteUser(user)}
                      title="Eliminar usuario"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {/* Expand workspaces */}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground"
                    onClick={() => toggleUserWorkspaces(user.id)}
                  >
                    {expandedUser === user.id
                      ? <ChevronUp className="h-3.5 w-3.5" />
                      : <ChevronDown className="h-3.5 w-3.5" />}
                  </Button>
                </div>
              </div>

              {/* Workspaces expansion */}
              {expandedUser === user.id && (
                <div className="border-t border-border bg-muted/20 px-4 py-3">
                  {loadingWorkspaces === user.id ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Cargando workspaces...
                    </div>
                  ) : (userWorkspaces[user.id] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sin workspaces</p>
                  ) : (
                    <div className="space-y-1.5">
                      {(userWorkspaces[user.id] ?? []).map((ws) => (
                        <div key={ws.workspace_id} className="flex items-center gap-3 text-xs">
                          <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
                          <span className="flex-1 font-medium">{ws.nombre}</span>
                          <Badge variant="outline" className="text-xs capitalize">{ws.rol}</Badge>
                          <span className="text-muted-foreground">{ws.proyectos_count} proyectos</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </TabsContent>

        <TabsContent value="planes" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreatePlan}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo plan
            </Button>
          </div>
          <div className="space-y-2">
            {planes.map((plan) => (
              <div key={plan.id} className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{plan.nombre}</p>
                    {plan.es_default && <Badge variant="outline" className="text-xs text-primary">Default</Badge>}
                    {!plan.activo && <Badge variant="outline" className="text-xs text-muted-foreground">Inactivo</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {plan.max_workspaces === -1 ? '∞' : plan.max_workspaces} workspaces ·{' '}
                    {plan.max_proyectos_por_workspace === -1 ? '∞' : plan.max_proyectos_por_workspace} proyectos ·{' '}
                    €{plan.precio}/mes
                  </p>
                </div>
                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEditPlan(plan)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* Plan dialog */}
      <Dialog open={planOpen} onOpenChange={(v) => !v && setPlanOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editPlan ? 'Editar plan' : 'Nuevo plan'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={planForm.nombre} onChange={(e) => setPlanForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: 'max_workspaces', label: 'Max workspaces' },
                { key: 'max_proyectos_por_workspace', label: 'Max proyectos' },
                { key: 'max_tareas_por_proyecto', label: 'Max tareas' },
                { key: 'max_miembros_por_workspace', label: 'Max miembros' },
                { key: 'max_gastos_por_proyecto', label: 'Max gastos' },
                { key: 'max_presupuestos_por_workspace', label: 'Max presupuestos' },
              ].map(({ key, label }) => (
                <div key={key} className="space-y-1.5">
                  <Label className="text-xs">{label} (-1=∞)</Label>
                  <Input type="number" min="-1" value={planForm[key as keyof typeof planForm] as string} onChange={(e) => setPlanForm((f) => ({ ...f, [key]: e.target.value }))} />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Precio (€/mes)</Label>
              <Input type="number" min="0" step="0.01" value={planForm.precio} onChange={(e) => setPlanForm((f) => ({ ...f, precio: e.target.value }))} />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch checked={planForm.activo} onCheckedChange={(v) => setPlanForm((f) => ({ ...f, activo: v }))} />
                <Label>Activo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={planForm.es_default} onCheckedChange={(v) => setPlanForm((f) => ({ ...f, es_default: v }))} />
                <Label>Default</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPlanOpen(false)}>Cancelar</Button>
            <Button onClick={handleSavePlan} disabled={saving || !planForm.nombre}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editPlan ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Assign plan dialog */}
      <Dialog open={assignPlanOpen} onOpenChange={(v) => !v && setAssignPlanOpen(false)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Asignar plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label className="text-muted-foreground text-xs">{assignUser?.email}</Label>
            <Select value={assignPlanId} onValueChange={setAssignPlanId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecciona plan" />
              </SelectTrigger>
              <SelectContent>
                {planes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAssignPlanOpen(false)}>Cancelar</Button>
            <Button onClick={handleAssignPlan} disabled={saving || !assignPlanId}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Asignar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit user dialog */}
      <Dialog open={editUserOpen} onOpenChange={(v) => !v && setEditUserOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={editUserForm.nombre} onChange={(e) => setEditUserForm((f) => ({ ...f, nombre: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={editUserForm.email} onChange={(e) => setEditUserForm((f) => ({ ...f, email: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUserOpen(false)}>Cancelar</Button>
            <Button onClick={handleEditUser} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Guardar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete user confirmation */}
      <AlertDialog
        open={!!deleteUser}
        onOpenChange={(v) => !v && setDeleteUser(null)}
        title="Eliminar usuario"
        description={deleteUser ? `¿Eliminar a ${deleteUser.email}? Se eliminarán todos sus datos. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        onConfirm={handleDeleteUser}
      />

      {/* Reset password result dialog */}
      <Dialog open={!!resetPasswordResult} onOpenChange={(v) => { if (!v) { setResetPasswordUser(null); setResetPasswordResult(null); setCopied(false) } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Contraseña reseteada</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Nueva contraseña temporal para <span className="font-medium text-foreground">{resetPasswordUser?.email}</span>:
            </p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-md font-mono text-sm">
              <span className="flex-1 select-all">{resetPasswordResult}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copyPassword}>
                {copied ? <Check className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">Comparte esta contraseña con el usuario. Solo se muestra una vez.</p>
          </div>
          <DialogFooter>
            <Button onClick={() => { setResetPasswordUser(null); setResetPasswordResult(null); setCopied(false) }}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
