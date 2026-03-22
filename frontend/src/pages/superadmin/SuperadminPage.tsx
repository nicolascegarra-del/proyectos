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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Loader2, Pencil, Plus } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

type Metrics = {
  total_users: number
  total_workspaces: number
  total_proyectos: number
  total_tareas: number
}

export default function SuperadminPage() {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [users, setUsers] = useState<User[]>([])
  const [metrics, setMetrics] = useState<Metrics | null>(null)
  const [loading, setLoading] = useState(true)

  const [planOpen, setPlanOpen] = useState(false)
  const [editPlan, setEditPlan] = useState<Plan | null>(null)
  const [saving, setSaving] = useState(false)

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

  const [assignPlanOpen, setAssignPlanOpen] = useState(false)
  const [assignUser, setAssignUser] = useState<User | null>(null)
  const [assignPlanId, setAssignPlanId] = useState('')

  const load = async () => {
    setLoading(true)
    try {
      const [planesRes, usersRes, metricsRes] = await Promise.all([
        api.get<Plan[]>('/superadmin/planes'),
        api.get<User[]>('/superadmin/usuarios'),
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

  const openCreatePlan = () => {
    setEditPlan(null)
    setPlanForm({
      nombre: '', max_workspaces: '1', max_proyectos_por_workspace: '5',
      max_tareas_por_proyecto: '100', max_miembros_por_workspace: '3',
      max_gastos_por_proyecto: '50', max_presupuestos_por_workspace: '10',
      precio: '0', activo: true, es_default: false,
    })
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
        const { data } = await api.put<Plan>(`/superadmin/planes/${editPlan.id}`, payload)
        setPlanes((p) => p.map((x) => (x.id === data.id ? data : x)))
        toast({ title: 'Plan actualizado' })
      } else {
        const { data } = await api.post<Plan>('/superadmin/planes', payload)
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

  const handleToggleUserActive = async (user: User) => {
    try {
      const { data } = await api.put<User>(`/superadmin/usuarios/${user.id}`, {
        is_active: !user.is_active,
      })
      setUsers((u) => u.map((x) => (x.id === data.id ? data : x)))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleAssignPlan = async () => {
    if (!assignUser || !assignPlanId) return
    setSaving(true)
    try {
      const { data } = await api.put<User>(`/superadmin/usuarios/${assignUser.id}`, {
        plan_id: assignPlanId,
      })
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <h1 className="text-xl font-semibold">Superadmin</h1>

      {metrics && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Usuarios', value: metrics.total_users },
            { label: 'Workspaces', value: metrics.total_workspaces },
            { label: 'Proyectos', value: metrics.total_proyectos },
            { label: 'Tareas', value: metrics.total_tareas },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card border border-border rounded-lg p-3">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold">{value}</p>
            </div>
          ))}
        </div>
      )}

      <Tabs defaultValue="planes">
        <TabsList>
          <TabsTrigger value="planes">Planes</TabsTrigger>
          <TabsTrigger value="usuarios">Usuarios</TabsTrigger>
        </TabsList>

        <TabsContent value="planes" className="mt-4 space-y-3">
          <div className="flex justify-end">
            <Button size="sm" onClick={openCreatePlan}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nuevo plan
            </Button>
          </div>
          <div className="space-y-2">
            {planes.map((plan) => (
              <div
                key={plan.id}
                className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{plan.nombre}</p>
                    {plan.es_default && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                        Default
                      </span>
                    )}
                    {!plan.activo && (
                      <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded">
                        Inactivo
                      </span>
                    )}
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

        <TabsContent value="usuarios" className="mt-4">
          <div className="space-y-2">
            {users.map((user) => (
              <div
                key={user.id}
                className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{user.nombre ?? user.email}</p>
                  <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-xs text-muted-foreground">
                    {planes.find((p) => p.id === user.plan_id)?.nombre ?? '—'}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setAssignUser(user)
                      setAssignPlanId(user.plan_id ?? '')
                      setAssignPlanOpen(true)
                    }}
                  >
                    Plan
                  </Button>
                  <Switch
                    checked={user.is_active}
                    onCheckedChange={() => handleToggleUserActive(user)}
                  />
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      <Dialog open={planOpen} onOpenChange={(v) => !v && setPlanOpen(false)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editPlan ? 'Editar plan' : 'Nuevo plan'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={planForm.nombre}
                onChange={(e) => setPlanForm((f) => ({ ...f, nombre: e.target.value }))}
              />
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
                  <Input
                    type="number"
                    min="-1"
                    value={planForm[key as keyof typeof planForm] as string}
                    onChange={(e) => setPlanForm((f) => ({ ...f, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1.5">
              <Label>Precio (€/mes)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={planForm.precio}
                onChange={(e) => setPlanForm((f) => ({ ...f, precio: e.target.value }))}
              />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={planForm.activo}
                  onCheckedChange={(v) => setPlanForm((f) => ({ ...f, activo: v }))}
                />
                <Label>Activo</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={planForm.es_default}
                  onCheckedChange={(v) => setPlanForm((f) => ({ ...f, es_default: v }))}
                />
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

      <Dialog open={assignPlanOpen} onOpenChange={(v) => !v && setAssignPlanOpen(false)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Asignar plan</DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label>{assignUser?.email}</Label>
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
    </div>
  )
}
