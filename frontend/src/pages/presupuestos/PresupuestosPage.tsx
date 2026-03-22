import { useEffect, useState } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage, isLimitError } from '@/lib/api'
import type { Cliente, EstadoPresupuesto, Presupuesto, Proyecto } from '@/types'
import { formatEUR, formatDate } from '@/lib/utils'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, FileText, ExternalLink, Lock } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'

const ESTADO_COLORS: Record<EstadoPresupuesto, string> = {
  borrador: 'bg-muted text-muted-foreground',
  enviado: 'bg-blue-500/10 text-blue-400',
  aceptado: 'bg-green-500/10 text-green-400',
  rechazado: 'bg-red-500/10 text-red-400',
}

const ESTADO_LABELS: Record<EstadoPresupuesto, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
}

export default function PresupuestosPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const navigate = useNavigate()
  const [presupuestos, setPresupuestos] = useState<Presupuesto[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [filterEstado, setFilterEstado] = useState<string>('all')

  const [form, setForm] = useState({
    cliente_id: '',
    proyecto_id: '',
    fecha: new Date().toISOString().split('T')[0],
  })

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const [pRes, cRes, prRes] = await Promise.all([
        api.get<Presupuesto[]>(`/workspaces/${currentWorkspace.id}/presupuestos`),
        api.get<Cliente[]>(`/workspaces/${currentWorkspace.id}/clientes`),
        api.get<Proyecto[]>(`/workspaces/${currentWorkspace.id}/proyectos`),
      ])
      setPresupuestos(pRes.data)
      setClientes(cRes.data)
      setProyectos(prRes.data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [currentWorkspace?.id])

  const resetForm = () => setForm({
    cliente_id: '',
    proyecto_id: '',
    fecha: new Date().toISOString().split('T')[0],
  })

  const handleCreate = async () => {
    if (!form.cliente_id || !currentWorkspace) return
    setSaving(true)
    try {
      const { data } = await api.post<Presupuesto>(
        `/workspaces/${currentWorkspace.id}/presupuestos`,
        {
          cliente_id: form.cliente_id,
          proyecto_id: form.proyecto_id || null,
          fecha: form.fecha,
        },
      )
      setPresupuestos((p) => [data, ...p])
      setModalOpen(false)
      resetForm()
      toast({ title: 'Presupuesto creado' })
      navigate({ to: '/presupuestos/$presupuestoId', params: { presupuestoId: data.id } })
    } catch (err) {
      const msg = getErrorMessage(err)
      toast({
        title: isLimitError(err) ? 'Límite alcanzado' : 'Error',
        description: msg,
        variant: 'destructive',
      })
    } finally {
      setSaving(false)
    }
  }

  const clienteNombre = (id: string) => clientes.find((c) => c.id === id)?.nombre ?? '—'

  const filtered = filterEstado === 'all'
    ? presupuestos
    : presupuestos.filter((p) => p.estado === filterEstado)

  if (loading) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-36" />
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-9 w-40" />
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 border border-border rounded-md">
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-16" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Presupuestos</h1>
        <Button size="sm" className="h-10" onClick={() => setModalOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nuevo
        </Button>
      </div>

      <Select value={filterEstado} onValueChange={setFilterEstado}>
        <SelectTrigger className="w-40 h-9">
          <SelectValue placeholder="Estado" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos</SelectItem>
          <SelectItem value="borrador">Borrador</SelectItem>
          <SelectItem value="enviado">Enviado</SelectItem>
          <SelectItem value="aceptado">Aceptado</SelectItem>
          <SelectItem value="rechazado">Rechazado</SelectItem>
        </SelectContent>
      </Select>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-lg">
          <FileText className="h-8 w-8" />
          <p className="text-sm">No hay presupuestos</p>
          <Button size="sm" onClick={() => setModalOpen(true)}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nuevo presupuesto
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-3 bg-card border border-border rounded-md px-4 py-3 hover:border-primary/20 transition-colors cursor-pointer"
              onClick={() => navigate({ to: '/presupuestos/$presupuestoId', params: { presupuestoId: p.id } })}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{p.numero}</p>
                  {p.is_locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                </div>
                <p className="text-xs text-muted-foreground">
                  {clienteNombre(p.cliente_id)} · {formatDate(p.fecha)}
                </p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ESTADO_COLORS[p.estado]}`}>
                {ESTADO_LABELS[p.estado]}
              </span>
              <span className="font-semibold text-sm tabular-nums flex-shrink-0">
                {formatEUR(p.total)}
              </span>
              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            </div>
          ))}
        </div>
      )}

      <Dialog open={modalOpen} onOpenChange={(v) => { if (!v) { setModalOpen(false); resetForm() } }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Nuevo presupuesto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Select value={form.cliente_id} onValueChange={(v) => setForm((f) => ({ ...f, cliente_id: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un cliente" />
                </SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Proyecto (opcional)</Label>
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
            <div className="space-y-1.5">
              <Label>Fecha</Label>
              <Input
                type="date"
                value={form.fecha}
                onChange={(e) => setForm((f) => ({ ...f, fecha: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setModalOpen(false); resetForm() }}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={saving || !form.cliente_id}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Crear
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
