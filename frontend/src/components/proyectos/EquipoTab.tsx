import { useEffect, useMemo, useState } from 'react'
import { api, getErrorMessage } from '@/lib/api'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import { toast } from '@/components/ui/use-toast'
import { Plus, Trash2 } from 'lucide-react'
import type { ProyectoMiembro, RolWorkspace, WorkspaceMember } from '@/types'

interface EquipoTabProps {
  proyectoId: string
  currentRol?: RolWorkspace
}

export function EquipoTab({ proyectoId, currentRol }: EquipoTabProps) {
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const [miembros, setMiembros] = useState<ProyectoMiembro[]>([])
  const [workspaceMembers, setWorkspaceMembers] = useState<WorkspaceMember[]>([])
  const [loading, setLoading] = useState(true)
  const [addOpen, setAddOpen] = useState(false)
  const [selectedUserId, setSelectedUserId] = useState<string>('')
  const [horasSemana, setHorasSemana] = useState<string>('0')
  const [saving, setSaving] = useState(false)

  const isAdmin = currentRol === 'owner' || currentRol === 'admin'
  const base = currentWorkspace
    ? `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/miembros`
    : ''

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const [mRes, wsRes] = await Promise.all([
        api.get<ProyectoMiembro[]>(base),
        api.get<WorkspaceMember[]>(`/workspaces/${currentWorkspace.id}/members`),
      ])
      setMiembros(mRes.data)
      setWorkspaceMembers(wsRes.data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [proyectoId, currentWorkspace?.id])

  const candidatos = useMemo(() => {
    const yaAsignados = new Set(miembros.map(m => m.user_id))
    return workspaceMembers.filter(w => !yaAsignados.has(w.user_id))
  }, [miembros, workspaceMembers])

  const handleAdd = async () => {
    if (!selectedUserId) return
    const horas = parseFloat(horasSemana) || 0
    setSaving(true)
    try {
      const { data } = await api.post<ProyectoMiembro>(base, {
        user_id: selectedUserId,
        horas_semana: horas,
      })
      setMiembros(prev => [...prev, data])
      setAddOpen(false)
      setSelectedUserId('')
      setHorasSemana('0')
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleHorasChange = async (miembro: ProyectoMiembro, value: string) => {
    const horas = parseFloat(value)
    if (Number.isNaN(horas) || horas < 0) return
    try {
      const { data } = await api.put<ProyectoMiembro>(`${base}/${miembro.id}`, {
        horas_semana: horas,
      })
      setMiembros(prev => prev.map(m => (m.id === data.id ? data : m)))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleRemove = async (miembro: ProyectoMiembro) => {
    const nombre = miembro.user?.nombre || miembro.user?.email || 'este miembro'
    if (!confirm(`¿Quitar a ${nombre} del equipo del proyecto?`)) return
    try {
      await api.delete(`${base}/${miembro.id}`)
      setMiembros(prev => prev.filter(m => m.id !== miembro.id))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {isAdmin && (
        <div className="flex justify-end">
          <Button size="sm" onClick={() => setAddOpen(true)} disabled={candidatos.length === 0}>
            <Plus className="mr-1 h-3.5 w-3.5" /> Añadir miembro
          </Button>
        </div>
      )}

      {miembros.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          Aún no hay miembros asignados al proyecto.
          {isAdmin && candidatos.length === 0 && ' Invita primero personas al workspace.'}
        </p>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">Persona</th>
                <th className="px-3 py-2 text-left font-medium">Email</th>
                <th className="px-3 py-2 text-left font-medium w-36">Horas/semana</th>
                {isAdmin && <th className="px-3 py-2 w-10" />}
              </tr>
            </thead>
            <tbody>
              {miembros.map(m => (
                <tr key={m.id} className="border-t">
                  <td className="px-3 py-2 flex items-center gap-2">
                    {m.user?.avatar_url ? (
                      <img src={m.user.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                    ) : (
                      <span className="h-6 w-6 rounded-full bg-klyp-pale text-klyp-navy text-[10px] font-semibold flex items-center justify-center">
                        {(m.user?.nombre || m.user?.email || '?').charAt(0).toUpperCase()}
                      </span>
                    )}
                    <span>{m.user?.nombre || '—'}</span>
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{m.user?.email || '—'}</td>
                  <td className="px-3 py-2">
                    {isAdmin ? (
                      <Input
                        type="number"
                        min={0}
                        step={0.5}
                        defaultValue={m.horas_semana}
                        onBlur={e => handleHorasChange(m, e.target.value)}
                        className="h-8 w-24"
                      />
                    ) : (
                      <span>{m.horas_semana} h</span>
                    )}
                  </td>
                  {isAdmin && (
                    <td className="px-3 py-2">
                      <button
                        onClick={() => handleRemove(m)}
                        className="p-1 text-muted-foreground hover:text-destructive"
                        title="Quitar del proyecto"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Añadir miembro al proyecto</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label>Persona del workspace</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona una persona" />
                </SelectTrigger>
                <SelectContent>
                  {candidatos.map(c => (
                    <SelectItem key={c.user_id} value={c.user_id}>
                      {c.user?.nombre || c.user?.email || c.user_id}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Horas / semana</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                value={horasSemana}
                onChange={e => setHorasSemana(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)}>Cancelar</Button>
            <Button onClick={handleAdd} disabled={!selectedUserId || saving}>
              {saving ? 'Añadiendo...' : 'Añadir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
