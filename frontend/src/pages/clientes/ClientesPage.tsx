import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage, isLimitError } from '@/lib/api'
import type { Cliente, ClienteStats } from '@/types'
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
import { Plus, Loader2, Users, Pencil, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'
import { formatEUR, formatHoras } from '@/lib/utils'

function getInitialsColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash)
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 55%, 40%)`
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
}

export default function ClientesPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [statsMap, setStatsMap] = useState<Map<string, ClienteStats>>(new Map())
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Cliente | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Cliente | null>(null)

  const [form, setForm] = useState({ nombre: '', email: '' })

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const { data } = await api.get<Cliente[]>(`/workspaces/${currentWorkspace.id}/clientes`)
      setClientes(data)
      // Load stats in parallel
      const entries = await Promise.all(
        data.map(async (c) => {
          try {
            const r = await api.get<ClienteStats>(`/workspaces/${currentWorkspace.id}/clientes/${c.id}/stats`)
            return [c.id, r.data] as [string, ClienteStats]
          } catch {
            return [c.id, { proyectos: 0, tareas: 0, horas_totales: 0, ingresos_totales: 0 }] as [string, ClienteStats]
          }
        }),
      )
      setStatsMap(new Map(entries))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentWorkspace?.id])

  const openCreate = () => {
    setEditTarget(null)
    setForm({ nombre: '', email: '' })
    setModalOpen(true)
  }

  const openEdit = (c: Cliente) => {
    setEditTarget(c)
    setForm({ nombre: c.nombre, email: c.email ?? '' })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.nombre || !currentWorkspace) return
    setSaving(true)
    try {
      if (editTarget) {
        const { data } = await api.put<Cliente>(
          `/workspaces/${currentWorkspace.id}/clientes/${editTarget.id}`,
          { nombre: form.nombre, email: form.email || null },
        )
        setClientes((c) => c.map((x) => (x.id === data.id ? data : x)))
        toast({ title: 'Cliente actualizado' })
      } else {
        const { data } = await api.post<Cliente>(
          `/workspaces/${currentWorkspace.id}/clientes`,
          { nombre: form.nombre, email: form.email || null },
        )
        setClientes((c) => [...c, data])
        // Load stats for new client
        try {
          const r = await api.get<ClienteStats>(`/workspaces/${currentWorkspace.id}/clientes/${data.id}/stats`)
          setStatsMap((m) => new Map(m).set(data.id, r.data))
        } catch { /* ignore */ }
        toast({ title: 'Cliente creado' })
      }
      setModalOpen(false)
    } catch (err) {
      const msg = getErrorMessage(err)
      toast({
        title: isLimitError(err) ? 'Límite de plan alcanzado' : 'No se pudo guardar el cliente',
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
      await api.delete(`/workspaces/${currentWorkspace.id}/clientes/${deleteTarget.id}`)
      setClientes((c) => c.filter((x) => x.id !== deleteTarget.id))
      setStatsMap((m) => { const n = new Map(m); n.delete(deleteTarget.id); return n })
      toast({ title: 'Cliente eliminado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setDeleteTarget(null)
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
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Clientes</h1>
        <Button size="sm" className="h-10" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo
        </Button>
      </div>

      {clientes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-lg">
          <Users className="h-8 w-8" />
          <p className="text-sm">No hay clientes todavía</p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo cliente
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {clientes.map((cliente) => {
            const stats = statsMap.get(cliente.id)
            const color = getInitialsColor(cliente.nombre)
            const initials = getInitials(cliente.nombre)
            return (
              <div
                key={cliente.id}
                className="bg-card border border-border rounded-lg p-4 flex flex-col gap-3"
              >
                <div className="flex items-start gap-3">
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold text-white flex-shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cliente.nombre}</p>
                    {cliente.email ? (
                      <p className="text-xs text-muted-foreground truncate">{cliente.email}</p>
                    ) : (
                      <p className="text-xs text-muted-foreground/50">Sin email</p>
                    )}
                  </div>
                </div>

                {stats && (
                  <div className="grid grid-cols-3 gap-2 text-center border-t border-border pt-3">
                    <div>
                      <p className="text-xs text-muted-foreground">Proyectos</p>
                      <p className="text-sm font-semibold">{stats.proyectos}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Horas</p>
                      <p className="text-sm font-semibold">{formatHoras(stats.horas_totales)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Ingresos</p>
                      <p className="text-sm font-semibold">{formatEUR(stats.ingresos_totales)}</p>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-1 border-t border-border pt-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-foreground"
                    onClick={() => openEdit(cliente)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    onClick={() => setDeleteTarget(cliente)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(v) => !v && setModalOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar cliente' : 'Nuevo cliente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Nombre</Label>
              <Input
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Nombre del cliente"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Email (opcional)</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="email@ejemplo.com"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || !form.nombre}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? 'Guardar' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Eliminar cliente</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Eliminar <span className="font-medium text-foreground">{deleteTarget?.nombre}</span>? Esta acción no se puede deshacer.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDelete}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
