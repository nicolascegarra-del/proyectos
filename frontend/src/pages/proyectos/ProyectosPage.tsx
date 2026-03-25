import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage, isLimitError } from '@/lib/api'
import type { Cliente, Proyecto } from '@/types'
import { formatEUR } from '@/lib/utils'
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
import { Switch } from '@/components/ui/switch'
import { Plus, FolderKanban, ExternalLink, Loader2, Pencil, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'

type FormState = {
  nombre: string
  cliente_id: string
  tarifa_hora: string
  alerta_horas_max: string
  stopwatch_enabled: boolean
  retainer_horas: string
}

const emptyForm = (): FormState => ({
  nombre: '',
  cliente_id: '',
  tarifa_hora: '0',
  alerta_horas_max: '',
  stopwatch_enabled: false,
  retainer_horas: '',
})

export default function ProyectosPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Proyecto | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Proyecto | null>(null)
  const [newClientOpen, setNewClientOpen] = useState(false)
  const [newClientNombre, setNewClientNombre] = useState('')
  const [newClientEmail, setNewClientEmail] = useState('')
  const [savingClient, setSavingClient] = useState(false)

  const [form, setForm] = useState<FormState>(emptyForm())

  const navigate = useNavigate()

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const [pRes, cRes] = await Promise.all([
        api.get<Proyecto[]>(`/workspaces/${currentWorkspace.id}/proyectos`),
        api.get<Cliente[]>(`/workspaces/${currentWorkspace.id}/clientes`),
      ])
      setProyectos(pRes.data)
      setClientes(cRes.data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentWorkspace?.id])

  const openCreate = () => {
    setEditTarget(null)
    setForm(emptyForm())
    setModalOpen(true)
  }

  const openEdit = (p: Proyecto, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditTarget(p)
    setForm({
      nombre: p.nombre,
      cliente_id: p.cliente_id,
      tarifa_hora: p.tarifa_hora.toString(),
      alerta_horas_max: p.alerta_horas_max?.toString() ?? '',
      stopwatch_enabled: p.stopwatch_enabled,
      retainer_horas: p.retainer_horas?.toString() ?? '',
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.nombre || !form.cliente_id || !currentWorkspace) return
    setSaving(true)
    try {
      const payload = {
        nombre: form.nombre,
        cliente_id: form.cliente_id,
        tarifa_hora: parseFloat(form.tarifa_hora) || 0,
        alerta_horas_max: form.alerta_horas_max ? parseFloat(form.alerta_horas_max) : null,
        stopwatch_enabled: form.stopwatch_enabled,
        retainer_horas: form.retainer_horas ? parseFloat(form.retainer_horas) : null,
      }

      if (editTarget) {
        const { data } = await api.put<Proyecto>(
          `/workspaces/${currentWorkspace.id}/proyectos/${editTarget.id}`,
          payload,
        )
        setProyectos((prev) => prev.map((x) => (x.id === data.id ? data : x)))
        toast({ title: 'Proyecto actualizado' })
      } else {
        const { data } = await api.post<Proyecto>(
          `/workspaces/${currentWorkspace.id}/proyectos`,
          payload,
        )
        setProyectos((prev) => [...prev, data])
        toast({ title: 'Proyecto creado' })
      }
      setModalOpen(false)
      setForm(emptyForm())
    } catch (err) {
      const msg = getErrorMessage(err)
      toast({
        title: isLimitError(err) ? 'Límite de plan alcanzado' : editTarget ? 'No se pudo actualizar el proyecto' : 'No se pudo crear el proyecto',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget || !currentWorkspace) return
    try {
      await api.delete(`/workspaces/${currentWorkspace.id}/proyectos/${deleteTarget.id}`)
      setProyectos((prev) => prev.filter((x) => x.id !== deleteTarget.id))
      toast({ title: 'Proyecto eliminado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setDeleteTarget(null)
    }
  }

  const handleCreateCliente = async () => {
    if (!newClientNombre || !currentWorkspace) return
    setSavingClient(true)
    try {
      const { data } = await api.post<Cliente>(
        `/workspaces/${currentWorkspace.id}/clientes`,
        { nombre: newClientNombre, email: newClientEmail || null },
      )
      setClientes((c) => [...c, data])
      setForm((f) => ({ ...f, cliente_id: data.id }))
      setNewClientOpen(false)
      setNewClientNombre('')
      setNewClientEmail('')
      toast({ title: 'Cliente creado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSavingClient(false)
    }
  }

  const clienteNombre = (id: string) =>
    clientes.find((c) => c.id === id)?.nombre ?? '—'

  if (loading) {
    return (
      <div className="space-y-4 max-w-4xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-28" />
          <Skeleton className="h-10 w-24" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-4 border border-border rounded-lg space-y-3">
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Proyectos</h1>
        <Button size="sm" onClick={openCreate} className="h-10">
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo
        </Button>
      </div>

      {proyectos.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-lg">
          <FolderKanban className="h-8 w-8" />
          <p className="text-sm">Crea tu primer proyecto</p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo proyecto
          </Button>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {proyectos.map((p) => (
            <div
              key={p.id}
              className="bg-card border border-border rounded-lg p-4 space-y-3 hover:border-primary/30 transition-colors cursor-pointer"
              onClick={() => navigate({ to: '/proyectos/$proyectoId', params: { proyectoId: p.id } })}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate">{p.nombre}</p>
                  <p className="text-xs text-muted-foreground">{clienteNombre(p.cliente_id)}</p>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={(e) => openEdit(p, e)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={(e) => { e.stopPropagation(); setDeleteTarget(p) }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                  <ExternalLink className="h-4 w-4 text-muted-foreground mt-0.5" />
                </div>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{formatEUR(p.tarifa_hora)}/h</span>
                {p.stopwatch_enabled && (
                  <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded">Cronómetro</span>
                )}
                {p.retainer_horas && (
                  <span className="bg-muted px-1.5 py-0.5 rounded">Retainer {p.retainer_horas}h</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear/editar proyecto */}
      <Dialog open={modalOpen} onOpenChange={(v) => { if (!v) { setModalOpen(false); setEditTarget(null); setForm(emptyForm()) } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar proyecto' : 'Nuevo proyecto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={form.nombre} onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del proyecto" />
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <div className="flex gap-2">
                <Select value={form.cliente_id} onValueChange={(v) => setForm((f) => ({ ...f, cliente_id: v }))}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecciona un cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!editTarget && (
                  <Button type="button" variant="outline" size="icon" title="Nuevo cliente" onClick={() => setNewClientOpen(true)}>
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tarifa/hora (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.tarifa_hora} onChange={(e) => setForm((f) => ({ ...f, tarifa_hora: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Alerta horas máx.</Label>
                <Input type="number" min="0" placeholder="Opcional" value={form.alerta_horas_max} onChange={(e) => setForm((f) => ({ ...f, alerta_horas_max: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Horas retainer (bolsa)</Label>
              <Input type="number" min="0" placeholder="Opcional" value={form.retainer_horas} onChange={(e) => setForm((f) => ({ ...f, retainer_horas: e.target.value }))} />
            </div>
            <div className="flex items-center justify-between">
              <Label>Cronómetro</Label>
              <Switch checked={form.stopwatch_enabled} onCheckedChange={(v) => setForm((f) => ({ ...f, stopwatch_enabled: v }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalOpen(false); setEditTarget(null); setForm(emptyForm()) }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.nombre || !form.cliente_id}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal nuevo cliente inline */}
      <Dialog open={newClientOpen} onOpenChange={(v) => { if (!v) { setNewClientOpen(false); setNewClientNombre(''); setNewClientEmail('') } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo cliente</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input value={newClientNombre} onChange={(e) => setNewClientNombre(e.target.value)} placeholder="Nombre del cliente" />
            </div>
            <div className="space-y-1.5">
              <Label>Email <span className="text-muted-foreground text-xs">(opcional)</span></Label>
              <Input type="email" value={newClientEmail} onChange={(e) => setNewClientEmail(e.target.value)} placeholder="cliente@email.com" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewClientOpen(false); setNewClientNombre(''); setNewClientEmail('') }}>Cancelar</Button>
            <Button onClick={handleCreateCliente} disabled={savingClient || !newClientNombre}>
              {savingClient && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmar eliminar */}
      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Eliminar proyecto"
        description={deleteTarget ? `¿Eliminar "${deleteTarget.nombre}"? Se eliminarán también todas sus tareas y gastos. Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </div>
  )
}
