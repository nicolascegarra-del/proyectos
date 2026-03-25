import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage, isLimitError } from '@/lib/api'
import type { Gasto, Proyecto } from '@/types'
import { formatEUR, formatDate, today } from '@/lib/utils'
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
import { Plus, Loader2, Trash2, Receipt, Pencil } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'

type GastoConNombre = Gasto & { proyecto_nombre: string }

export default function GastosPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [gastos, setGastos] = useState<GastoConNombre[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<GastoConNombre | null>(null)
  const [saving, setSaving] = useState(false)
  const [filterProyecto, setFilterProyecto] = useState('all')
  const [deletingGasto, setDeletingGasto] = useState<GastoConNombre | null>(null)

  const [form, setForm] = useState({
    proyecto_id: '',
    concepto: '',
    monto: '',
    fecha: today(),
  })

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const pRes = await api.get<Proyecto[]>(`/workspaces/${currentWorkspace.id}/proyectos`)
      setProyectos(pRes.data)
      const gastosProm = pRes.data.map((p) =>
        api.get<Gasto[]>(`/workspaces/${currentWorkspace.id}/proyectos/${p.id}/gastos`).then((r) =>
          r.data.map((g) => ({ ...g, proyecto_nombre: p.nombre })),
        ),
      )
      const results = await Promise.all(gastosProm)
      setGastos(results.flat().sort((a, b) => b.fecha.localeCompare(a.fecha)))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentWorkspace?.id])

  const openCreate = () => {
    setEditTarget(null)
    setForm({ proyecto_id: '', concepto: '', monto: '', fecha: today() })
    setModalOpen(true)
  }

  const openEdit = (gasto: GastoConNombre) => {
    setEditTarget(gasto)
    setForm({
      proyecto_id: gasto.proyecto_id,
      concepto: gasto.concepto,
      monto: gasto.monto.toString(),
      fecha: gasto.fecha,
    })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.concepto || !form.monto || !currentWorkspace) return
    if (!editTarget && !form.proyecto_id) return
    setSaving(true)
    try {
      const proyectoId = editTarget ? editTarget.proyecto_id : form.proyecto_id
      const payload = { concepto: form.concepto, monto: parseFloat(form.monto), fecha: form.fecha }

      if (editTarget) {
        const { data } = await api.put<Gasto>(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/gastos/${editTarget.id}`,
          payload,
        )
        const proyecto = proyectos.find((p) => p.id === proyectoId)
        setGastos((g) => g.map((x) => x.id === data.id ? { ...data, proyecto_nombre: proyecto?.nombre ?? '' } : x))
        toast({ title: 'Gasto actualizado' })
      } else {
        const { data } = await api.post<Gasto>(
          `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/gastos`,
          payload,
        )
        const proyecto = proyectos.find((p) => p.id === proyectoId)
        setGastos((g) => [{ ...data, proyecto_nombre: proyecto?.nombre ?? '' }, ...g])
        toast({ title: 'Gasto registrado' })
      }
      setModalOpen(false)
    } catch (err) {
      const msg = getErrorMessage(err)
      toast({
        title: isLimitError(err) ? 'Límite de plan alcanzado' : editTarget ? 'No se pudo actualizar el gasto' : 'No se pudo registrar el gasto',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (gasto: GastoConNombre) => {
    if (!currentWorkspace) return
    try {
      await api.delete(
        `/workspaces/${currentWorkspace.id}/proyectos/${gasto.proyecto_id}/gastos/${gasto.id}`,
      )
      setGastos((g) => g.filter((x) => x.id !== gasto.id))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const filtered =
    filterProyecto === 'all' ? gastos : gastos.filter((g) => g.proyecto_id === filterProyecto)
  const totalGastos = filtered.reduce((s, g) => s + g.monto, 0)

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-9 w-44" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border border-border rounded-md">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Gastos</h1>
          <p className="text-xs text-muted-foreground">Total: {formatEUR(totalGastos)}</p>
        </div>
        <Button size="sm" className="h-10" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo
        </Button>
      </div>

      <Select value={filterProyecto} onValueChange={setFilterProyecto}>
        <SelectTrigger className="w-44 h-9">
          <SelectValue placeholder="Todos los proyectos" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos los proyectos</SelectItem>
          {proyectos.map((p) => (
            <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
          ))}
        </SelectContent>
      </Select>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground border border-dashed border-border rounded-lg">
          <Receipt className="h-8 w-8" />
          <p className="text-sm">No hay gastos registrados</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((gasto) => (
            <div
              key={gasto.id}
              className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm truncate">{gasto.concepto}</p>
                <p className="text-xs text-muted-foreground">
                  {gasto.proyecto_nombre} · {formatDate(gasto.fecha)}
                </p>
              </div>
              <span className="font-semibold text-sm tabular-nums flex-shrink-0">
                {formatEUR(gasto.monto)}
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                onClick={() => openEdit(gasto)}
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={() => setDeletingGasto(gasto)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <AlertDialog
        open={!!deletingGasto}
        onOpenChange={(v) => !v && setDeletingGasto(null)}
        title="Eliminar gasto"
        description={deletingGasto ? `¿Eliminar "${deletingGasto.concepto}"? Esta acción no se puede deshacer.` : ''}
        confirmLabel="Eliminar"
        onConfirm={() => deletingGasto && handleDelete(deletingGasto)}
      />

      <Dialog open={modalOpen} onOpenChange={(v) => !v && setModalOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar gasto' : 'Nuevo gasto'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {!editTarget && (
              <div className="space-y-1.5">
                <Label>Proyecto</Label>
                <Select value={form.proyecto_id} onValueChange={(v) => setForm((f) => ({ ...f, proyecto_id: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un proyecto" />
                  </SelectTrigger>
                  <SelectContent>
                    {proyectos.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Concepto</Label>
              <Input value={form.concepto} onChange={(e) => setForm((f) => ({ ...f, concepto: e.target.value }))} placeholder="Descripción del gasto" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Monto (€)</Label>
                <Input type="number" min="0" step="0.01" value={form.monto} onChange={(e) => setForm((f) => ({ ...f, monto: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input type="date" value={form.fecha} onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving || (!editTarget && !form.proyecto_id) || !form.concepto || !form.monto}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {editTarget ? 'Guardar' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
