import { useEffect, useMemo, useState } from 'react'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Button } from '@/components/ui/button'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { RichTextView } from '@/components/ui/rich-text-view'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import { Trash2 } from 'lucide-react'
import type { NotaProyecto, RolWorkspace, TipoNota } from '@/types'

const isHtmlEmpty = (html: string): boolean =>
  html.replace(/<[^>]+>/g, '').trim() === ''

const TIPO_NOTA_CONFIG: Record<TipoNota, { label: string; color: string }> = {
  general:    { label: 'General',    color: 'bg-muted text-muted-foreground' },
  reunion:    { label: 'Reunión',    color: 'bg-yellow-500/20 text-yellow-400' },
  decision:   { label: 'Decisión',   color: 'bg-blue-500/20 text-blue-400' },
  bloqueante: { label: 'Bloqueante', color: 'bg-red-500/20 text-red-400' },
  acuerdo:    { label: 'Acuerdo',    color: 'bg-green-500/20 text-green-400' },
}

const TIPO_NOTA_ORDEN: TipoNota[] = ['general', 'reunion', 'decision', 'bloqueante', 'acuerdo']

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
  const [tipo, setTipo] = useState<TipoNota>('general')
  const [filtroTipo, setFiltroTipo] = useState<TipoNota | 'todos'>('todos')
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
    if (isHtmlEmpty(texto)) return
    setSaving(true)
    try {
      const { data } = await api.post<NotaProyecto>(base, { texto, tipo })
      setNotas(prev => [data, ...prev])
      setTexto('')
      setTipo('general')
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

  const notasFiltradas = useMemo(
    () => filtroTipo === 'todos' ? notas : notas.filter(n => n.tipo === filtroTipo),
    [notas, filtroTipo],
  )

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <RichTextEditor
          value={texto}
          onChange={setTexto}
          placeholder="Escribe una nota para este proyecto..."
        />
        <div className="flex items-center justify-between gap-2">
          <Select value={tipo} onValueChange={(v) => setTipo(v as TipoNota)}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPO_NOTA_ORDEN.map(t => (
                <SelectItem key={t} value={t}>{TIPO_NOTA_CONFIG[t].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleAdd} disabled={saving || isHtmlEmpty(texto)} size="sm">
            {saving ? 'Guardando...' : 'Añadir nota'}
          </Button>
        </div>
      </div>

      {notas.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar:</span>
          <Select value={filtroTipo} onValueChange={(v) => setFiltroTipo(v as TipoNota | 'todos')}>
            <SelectTrigger className="h-8 w-44 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos los tipos</SelectItem>
              {TIPO_NOTA_ORDEN.map(t => (
                <SelectItem key={t} value={t}>{TIPO_NOTA_CONFIG[t].label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : notasFiltradas.length === 0 ? (
        <p className="text-sm text-muted-foreground italic">
          {notas.length === 0 ? 'Aún no hay notas en este proyecto.' : 'No hay notas de este tipo.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {notasFiltradas.map(nota => {
            const cfg = TIPO_NOTA_CONFIG[nota.tipo] ?? TIPO_NOTA_CONFIG.general
            return (
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
                    <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-medium ${cfg.color}`}>
                      {cfg.label}
                    </span>
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
                <RichTextView className="mt-2 text-sm" html={nota.texto} />
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
