import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage, isLimitError } from '@/lib/api'
import type { Cliente } from '@/types'
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

export default function ClientesPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [clientes, setClientes] = useState<Cliente[]>([])
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
    <div className="space-y-4 max-w-2xl">
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
        <div className="space-y-2">
          {clientes.map((cliente) => (
            <div
              key={cliente.id}
              className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{cliente.nombre}</p>
                {cliente.email && (
                  <p className="text-xs text-muted-foreground truncate">{cliente.email}</p>
                )}
              </div>
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
          ))}
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
