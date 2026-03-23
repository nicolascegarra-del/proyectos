import { useEffect, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage } from '@/lib/api'
import type { Articulo, Cliente, Configuracion, EstadoPresupuesto, Presupuesto, PresupuestoLinea } from '@/types'
import { formatEUR, formatDate } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ArrowLeft, Loader2, Lock, LockOpen, Mail, Plus, Trash2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import { EmailModal } from '@/components/email/EmailModal'

const ESTADOS: EstadoPresupuesto[] = ['borrador', 'enviado', 'aceptado', 'rechazado']
const ESTADO_LABELS: Record<EstadoPresupuesto, string> = {
  borrador: 'Borrador',
  enviado: 'Enviado',
  aceptado: 'Aceptado',
  rechazado: 'Rechazado',
}

export default function PresupuestoDetailPage() {
  const { presupuestoId } = useParams({ strict: false }) as { presupuestoId: string }
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const navigate = useNavigate()

  const [presupuesto, setPresupuesto] = useState<Presupuesto | null>(null)
  const [lineas, setLineas] = useState<PresupuestoLinea[]>([])
  const [articulos, setArticulos] = useState<Articulo[]>([])
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [config, setConfig] = useState<Configuracion | null>(null)
  const [loading, setLoading] = useState(true)
  const [emailOpen, setEmailOpen] = useState(false)
  const [lineaOpen, setLineaOpen] = useState(false)
  const [savingLinea, setSavingLinea] = useState(false)

  const [lineaForm, setLineaForm] = useState({
    articulo_id: '',
    concepto: '',
    cantidad: '1',
    precio_unitario: '0',
  })

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const [pRes, lRes, aRes] = await Promise.all([
        api.get<Presupuesto>(`/workspaces/${currentWorkspace.id}/presupuestos/${presupuestoId}`),
        api.get<PresupuestoLinea[]>(`/workspaces/${currentWorkspace.id}/presupuestos/${presupuestoId}/lineas`),
        api.get<Articulo[]>(`/workspaces/${currentWorkspace.id}/articulos`),
      ])
      setPresupuesto(pRes.data)
      setLineas(lRes.data)
      setArticulos(aRes.data)

      const [configRes] = await Promise.all([
        api.get<Configuracion>(`/workspaces/${currentWorkspace.id}/configuracion`).catch(() => ({ data: null })),
      ])
      setConfig(configRes.data)

      if (pRes.data.cliente_id) {
        const cRes = await api.get<Cliente>(`/workspaces/${currentWorkspace.id}/clientes/${pRes.data.cliente_id}`)
        setCliente(cRes.data)
      }
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [presupuestoId, currentWorkspace?.id])

  const handleUpdateEstado = async (estado: EstadoPresupuesto) => {
    if (!presupuesto || !currentWorkspace || presupuesto.is_locked) return
    try {
      const { data } = await api.put<Presupuesto>(
        `/workspaces/${currentWorkspace.id}/presupuestos/${presupuestoId}`,
        { estado },
      )
      setPresupuesto(data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleToggleLock = async () => {
    if (!presupuesto || !currentWorkspace) return
    try {
      const { data } = await api.put<Presupuesto>(
        `/workspaces/${currentWorkspace.id}/presupuestos/${presupuestoId}`,
        { is_locked: !presupuesto.is_locked },
      )
      setPresupuesto(data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleArticuloSelect = (articuloId: string) => {
    const art = articulos.find((a) => a.id === articuloId)
    if (art) {
      setLineaForm((f) => ({
        ...f,
        articulo_id: articuloId,
        concepto: art.concepto,
        precio_unitario: art.precio_base.toString(),
      }))
    }
  }

  const handleAddLinea = async () => {
    if (!lineaForm.concepto || !currentWorkspace || presupuesto?.is_locked) return
    setSavingLinea(true)
    try {
      const { data } = await api.post<PresupuestoLinea>(
        `/workspaces/${currentWorkspace.id}/presupuestos/${presupuestoId}/lineas`,
        {
          articulo_id: lineaForm.articulo_id || null,
          concepto: lineaForm.concepto,
          cantidad: parseFloat(lineaForm.cantidad) || 1,
          precio_unitario: parseFloat(lineaForm.precio_unitario) || 0,
        },
      )
      setLineas((l) => [...l, data])
      const pRes = await api.get<Presupuesto>(`/workspaces/${currentWorkspace.id}/presupuestos/${presupuestoId}`)
      setPresupuesto(pRes.data)
      setLineaOpen(false)
      setLineaForm({ articulo_id: '', concepto: '', cantidad: '1', precio_unitario: '0' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSavingLinea(false)
    }
  }

  const handleDeleteLinea = async (lineaId: string) => {
    if (!currentWorkspace || presupuesto?.is_locked) return
    try {
      await api.delete(`/workspaces/${currentWorkspace.id}/presupuestos/${presupuestoId}/lineas/${lineaId}`)
      setLineas((l) => l.filter((x) => x.id !== lineaId))
      const pRes = await api.get<Presupuesto>(`/workspaces/${currentWorkspace.id}/presupuestos/${presupuestoId}`)
      setPresupuesto(pRes.data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  if (loading || !presupuesto) {
    return (
      <div className="space-y-4 max-w-3xl">
        <div className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-md" />
          <div className="space-y-1 flex-1">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-48" />
          </div>
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="border border-border rounded-lg p-4 space-y-3">
          <Skeleton className="h-5 w-24" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex gap-3">
              <Skeleton className="h-10 flex-1" />
              <Skeleton className="h-10 w-20" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-10 w-28" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => navigate({ to: '/presupuestos' })}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold">{presupuesto.numero}</h1>
          <p className="text-xs text-muted-foreground">
            {cliente?.nombre ?? '—'} · {formatDate(presupuesto.fecha)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={() => setEmailOpen(true)}
          >
            <Mail className="mr-1.5 h-3.5 w-3.5" />
            Enviar
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-9"
            onClick={handleToggleLock}
          >
            {presupuesto.is_locked
              ? <><LockOpen className="mr-1.5 h-3.5 w-3.5" />Desbloquear</>
              : <><Lock className="mr-1.5 h-3.5 w-3.5" />Bloquear</>
            }
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Label className="text-xs">Estado:</Label>
        <Select
          value={presupuesto.estado}
          onValueChange={(v) => handleUpdateEstado(v as EstadoPresupuesto)}
          disabled={presupuesto.is_locked}
        >
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ESTADOS.map((e) => (
              <SelectItem key={e} value={e}>{ESTADO_LABELS[e]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {presupuesto.is_locked && (
          <span className="flex items-center gap-1 text-xs text-yellow-500">
            <Lock className="h-3 w-3" /> Bloqueado
          </span>
        )}
      </div>

      <div className="bg-card border border-border rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-medium">Líneas</h2>
          {!presupuesto.is_locked && (
            <Button size="sm" variant="ghost" className="h-8" onClick={() => setLineaOpen(true)}>
              <Plus className="mr-1 h-3.5 w-3.5" />
              Añadir
            </Button>
          )}
        </div>

        {lineas.length === 0 ? (
          <div className="flex items-center justify-center h-24 text-sm text-muted-foreground">
            No hay líneas en este presupuesto
          </div>
        ) : (
          <div className="divide-y divide-border">
            {lineas.map((linea) => (
              <div key={linea.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm">{linea.concepto}</p>
                  <p className="text-xs text-muted-foreground">
                    {linea.cantidad} × {formatEUR(linea.precio_unitario)}
                  </p>
                </div>
                <span className="text-sm font-semibold tabular-nums flex-shrink-0">
                  {formatEUR(linea.subtotal)}
                </span>
                {!presupuesto.is_locked && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteLinea(linea.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border bg-muted/30">
          <span className="text-sm font-medium text-muted-foreground">Total</span>
          <span className="text-lg font-bold tabular-nums">{formatEUR(presupuesto.total)}</span>
        </div>
      </div>

      <Dialog open={lineaOpen} onOpenChange={(v) => !v && setLineaOpen(false)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Añadir línea</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            {articulos.length > 0 && (
              <div className="space-y-1.5">
                <Label>Artículo (opcional)</Label>
                <Select value={lineaForm.articulo_id} onValueChange={handleArticuloSelect}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecciona un artículo" />
                  </SelectTrigger>
                  <SelectContent>
                    {articulos.map((a) => (
                      <SelectItem key={a.id} value={a.id}>{a.concepto}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Concepto</Label>
              <Input
                value={lineaForm.concepto}
                onChange={(e) => setLineaForm((f) => ({ ...f, concepto: e.target.value }))}
                placeholder="Descripción del servicio o producto"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Cantidad</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineaForm.cantidad}
                  onChange={(e) => setLineaForm((f) => ({ ...f, cantidad: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Precio (€)</Label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={lineaForm.precio_unitario}
                  onChange={(e) => setLineaForm((f) => ({ ...f, precio_unitario: e.target.value }))}
                />
              </div>
            </div>
            {lineaForm.concepto && (
              <p className="text-xs text-muted-foreground text-right">
                Subtotal: {formatEUR((parseFloat(lineaForm.cantidad) || 0) * (parseFloat(lineaForm.precio_unitario) || 0))}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLineaOpen(false)}>Cancelar</Button>
            <Button onClick={handleAddLinea} disabled={savingLinea || !lineaForm.concepto}>
              {savingLinea && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Añadir
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {emailOpen && (
        <EmailModal
          open={emailOpen}
          onClose={() => setEmailOpen(false)}
          presupuesto={presupuesto}
          clienteNombre={cliente?.nombre ?? ''}
          proyectoNombre={''}
          config={config}
        />
      )}
    </div>
  )
}
