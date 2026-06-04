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
import { TagPicker } from '@/components/etiquetas/TagPicker'
import { TagBadges } from '@/components/etiquetas/TagBadges'
import { Trash2 } from 'lucide-react'
import type { NotaProyecto, RolWorkspace, Tag } from '@/types'

const isHtmlEmpty = (html: string): boolean =>
  html.replace(/<[^>]+>/g, '').trim() === ''

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
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [filtroTagId, setFiltroTagId] = useState<string>('todos')
  const [saving, setSaving] = useState(false)

  const base = currentWorkspace ? `/workspaces/${currentWorkspace.id}/proyectos/${proyectoId}/notas` : ''

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const [notasRes, tagsRes] = await Promise.all([
        api.get<NotaProyecto[]>(base),
        api.get<Tag[]>(`/workspaces/${currentWorkspace.id}/tags`),
      ])
      setNotas(notasRes.data)
      setTags(tagsRes.data)
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
      const { data } = await api.post<NotaProyecto>(base, { texto, tag_ids: selectedTagIds })
      setNotas(prev => [data, ...prev])
      setTexto('')
      setSelectedTagIds([])
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
    () => filtroTagId === 'todos'
      ? notas
      : notas.filter(n => (n.tags ?? []).some(t => t.id === filtroTagId)),
    [notas, filtroTagId],
  )

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <RichTextEditor
          value={texto}
          onChange={setTexto}
          placeholder="Escribe una nota para este proyecto..."
        />
        <TagPicker
          tags={tags}
          value={selectedTagIds}
          onChange={setSelectedTagIds}
          emptyHint="No tienes etiquetas. Créalas en el menú Etiquetas."
        />
        <div className="flex items-center justify-end">
          <Button onClick={handleAdd} disabled={saving || isHtmlEmpty(texto)} size="sm">
            {saving ? 'Guardando...' : 'Añadir nota'}
          </Button>
        </div>
      </div>

      {notas.length > 0 && tags.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Filtrar:</span>
          <Select value={filtroTagId} onValueChange={setFiltroTagId}>
            <SelectTrigger className="h-8 w-48 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todas las etiquetas</SelectItem>
              {tags.map(t => (
                <SelectItem key={t.id} value={t.id}>
                  <span className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ backgroundColor: t.color }} />
                    {t.nombre}
                  </span>
                </SelectItem>
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
          {notas.length === 0 ? 'Aún no hay notas en este proyecto.' : 'No hay notas con esta etiqueta.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {notasFiltradas.map(nota => (
            <li key={nota.id} className="rounded-md border bg-card p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
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
                  <TagBadges tags={nota.tags} className="ml-1" />
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
          ))}
        </ul>
      )}
    </div>
  )
}
