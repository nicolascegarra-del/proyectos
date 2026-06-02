import { useEffect, useState } from 'react'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import { Trash2 } from 'lucide-react'
import type { NotaProyecto, RolWorkspace } from '@/types'

interface NotasTabProps {
  proyectoId: string
  /** Rol del usuario actual en el workspace (para mostrar borrar de otros si admin/owner). */
  currentRol?: RolWorkspace
}

function formatDateTime(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export function NotasTab({ proyectoId, currentRol }: NotasTabProps) {
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const user = useAuthStore(s => s.user)
  const [notas, setNotas] = useState<NotaProyecto[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [saving, setSaving] = useState(false)

  const base = currentWorkspace ? `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/notas` : ''

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const { data } = await api.get<NotaProyecto[]>(base)
      setNotas(data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [proyectoId, currentWorkspace?.id])

  const handleAdd = async () => {
    const trimmed = texto.trim()
    if (!trimmed) return
    setSaving(true)
    try {
      const { data } = await api.post<NotaProyecto>(base, { texto: trimmed })
      setNotas(prev => [data, ...prev])
      setTexto('')
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (nota: NotaProyecto) => {
    if (!confirm('¿Eliminar esta nota?')) return
    try {
      await api.delete(`${base}/${nota.id}`)
      setNotas(prev => prev.filter(n => n.id !== nota.id))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const canDelete = (nota: NotaProyecto) =>
    user?.id === nota.user_id || currentRol === 'owner' || currentRol === 'admin'

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Textarea
          rows={3}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Escribe una nota para este proyecto..."
          maxLength={4000}
        />
        <div className="flex justify-end">
          <Button onClick={handleAdd} disabled={saving || !texto.trim()} size="sm">
            {saving ? 'Guardando...' : 'Añadir nota'}
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : notas.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">Aún no hay notas en este proyecto.</p>
      ) : (
        <ul className="space-y-2">
          {notas.map(nota => (
            <li key={nota.id} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  {nota.autor_avatar_url ? (
                    <img src={nota.autor_avatar_url} alt="" className="h-5 w-5 rounded-full" />
                  ) : (
                    <span className="h-5 w-5 rounded-full bg-klyp-pale text-klyp-navy text-[10px] font-semibold flex items-center justify-center">
                      {(nota.autor_nombre || nota.autor_email || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                  <span className="font-medium text-foreground">{nota.autor_nombre || nota.autor_email}</span>
                  <span>·</span>
                  <span>{formatDateTime(nota.created_at)}</span>
                </div>
                {canDelete(nota) && (
                  <button
                    onClick={() => handleDelete(nota)}
                    className="p-1 text-muted-foreground hover:text-destructive"
                    title="Eliminar nota"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm">{nota.texto}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
