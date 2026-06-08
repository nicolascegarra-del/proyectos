import { useEffect, useMemo, useState } from 'react'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import { RichTextView } from '@/components/ui/rich-text-view'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'
import { TagPicker } from '@/components/etiquetas/TagPicker'
import { TagBadges } from '@/components/etiquetas/TagBadges'
import { ArrowDownWideNarrow, ArrowUpWideNarrow, Pencil, StickyNote, Trash2 } from 'lucide-react'
import type { NotaProyecto, Proyecto, Tag } from '@/types'

const isHtmlEmpty = (html: string): boolean =>
  html.replace(/<[^>]+>/g, '').trim() === ''

function formatDateTime(iso: string): string {
  const d = new Date(iso.endsWith('Z') ? iso : iso + 'Z')
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

const wasEdited = (nota: NotaProyecto): boolean => {
  if (!nota.updated_at) return false
  return new Date(nota.updated_at).getTime() - new Date(nota.created_at).getTime() > 1000
}

export default function NotasPage() {
  const currentWorkspace = useWorkspaceStore(s => s.currentWorkspace)
  const getCurrentUserRol = useWorkspaceStore(s => s.getCurrentUserRol)
  const user = useAuthStore(s => s.user)

  const [notas, setNotas] = useState<NotaProyecto[]>([])
  const [proyectos, setProyectos] = useState<Proyecto[]>([])
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)

  // Crear
  const [texto, setTexto] = useState('')
  const [proyectoIdNueva, setProyectoIdNueva] = useState<string>('')
  const [selectedTagIds, setSelectedTagIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  // Filtros
  const [filtroProyecto, setFiltroProyecto] = useState<string>('todos')
  const [filtroTag, setFiltroTag] = useState<string>('todos')
  const [orden, setOrden] = useState<'desc' | 'asc'>('desc')

  // Editar
  const [editTarget, setEditTarget] = useState<NotaProyecto | null>(null)
  const [editTexto, setEditTexto] = useState('')
  const [editTagIds, setEditTagIds] = useState<string[]>([])
  const [editSaving, setEditSaving] = useState(false)

  const wsBase = currentWorkspace ? `/workspaces/${currentWorkspace.id}` : ''
  const currentRol = user ? getCurrentUserRol(user.id) : null
  const isAdmin = currentRol === 'owner' || currentRol === 'admin'

  // Carga inicial de proyectos y etiquetas (no dependen de los filtros).
  useEffect(() => {
    if (!currentWorkspace) return
    Promise.all([
      api.get<Proyecto[]>(`${wsBase}/proyectos`),
      api.get<Tag[]>(`${wsBase}/tags`),
    ])
      .then(([pRes, tRes]) => {
        setProyectos(pRes.data)
        setTags(tRes.data)
      })
      .catch(err => toast({ title: getErrorMessage(err), variant: 'destructive' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id])

  // Carga de notas (server-side: proyecto, etiqueta y orden).
  const loadNotas = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const params = new URLSearchParams({ orden })
      if (filtroProyecto !== 'todos') params.set('proyecto_id', filtroProyecto)
      if (filtroTag !== 'todos') params.set('tag_id', filtroTag)
      const { data } = await api.get<NotaProyecto[]>(`${wsBase}/notas?${params.toString()}`)
      setNotas(data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadNotas()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id, filtroProyecto, filtroTag, orden])

  const proyectoNombre = useMemo(() => {
    const map = new Map(proyectos.map(p => [p.id, p.nombre]))
    return (id: string) => map.get(id) ?? '—'
  }, [proyectos])

  const handleAdd = async () => {
    if (isHtmlEmpty(texto) || !proyectoIdNueva || !currentWorkspace) return
    setSaving(true)
    try {
      const { data } = await api.post<NotaProyecto>(
        `${wsBase}/proyectos/${proyectoIdNueva}/notas`,
        { texto, tag_ids: selectedTagIds },
      )
      // Reutilizamos el listado actual respetando filtros/orden.
      const nota = { ...data, proyecto_nombre: proyectoNombre(data.proyecto_id) }
      setNotas(prev => orden === 'desc' ? [nota, ...prev] : [...prev, nota])
      setTexto('')
      setSelectedTagIds([])
      toast({ title: 'Nota creada' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const openEdit = (nota: NotaProyecto) => {
    setEditTarget(nota)
    setEditTexto(nota.texto)
    setEditTagIds((nota.tags ?? []).map(t => t.id))
  }

  const handleEditSave = async () => {
    if (!editTarget || isHtmlEmpty(editTexto)) return
    setEditSaving(true)
    try {
      const { data } = await api.patch<NotaProyecto>(
        `${wsBase}/proyectos/${editTarget.proyecto_id}/notas/${editTarget.id}`,
        { texto: editTexto, tag_ids: editTagIds },
      )
      const nota = { ...data, proyecto_nombre: proyectoNombre(data.proyecto_id) }
      setNotas(prev => prev.map(n => (n.id === nota.id ? nota : n)))
      setEditTarget(null)
      toast({ title: 'Nota actualizada' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setEditSaving(false)
    }
  }

  const handleDelete = async (nota: NotaProyecto) => {
    if (!confirm('¿Eliminar esta nota?')) return
    try {
      await api.delete(`${wsBase}/proyectos/${nota.proyecto_id}/notas/${nota.id}`)
      setNotas(prev => prev.filter(n => n.id !== nota.id))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const canModify = (nota: NotaProyecto) => user?.id === nota.user_id || isAdmin
  // Las etiquetas privadas del autor: solo el autor puede re-etiquetar con su set.
  const canEditTags = (nota: NotaProyecto) => user?.id === nota.user_id

  return (
    <div className="space-y-4 max-w-3xl">
      <div>
        <h1 className="text-xl font-semibold">Notas</h1>
        <p className="text-xs text-muted-foreground">
          Crea, edita y consulta las notas de todos tus proyectos en un solo lugar.
        </p>
      </div>

      {/* Crear nota */}
      <div className="space-y-2 rounded-lg border bg-card p-3">
        <div className="space-y-1.5">
          <Label>Proyecto</Label>
          <Select value={proyectoIdNueva} onValueChange={setProyectoIdNueva}>
            <SelectTrigger className="h-10">
              <SelectValue placeholder="Selecciona un proyecto" />
            </SelectTrigger>
            <SelectContent>
              {proyectos.map(p => (
                <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <RichTextEditor
          value={texto}
          onChange={setTexto}
          placeholder="Escribe una nota..."
        />
        <TagPicker
          tags={tags}
          value={selectedTagIds}
          onChange={setSelectedTagIds}
          emptyHint="No tienes etiquetas. Créalas en el menú Etiquetas."
        />
        <div className="flex items-center justify-end">
          <Button onClick={handleAdd} disabled={saving || isHtmlEmpty(texto) || !proyectoIdNueva} size="sm">
            {saving ? 'Guardando...' : 'Añadir nota'}
          </Button>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filtroProyecto} onValueChange={setFiltroProyecto}>
          <SelectTrigger className="h-9 w-48 text-xs">
            <SelectValue placeholder="Proyecto" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos los proyectos</SelectItem>
            {proyectos.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filtroTag} onValueChange={setFiltroTag}>
          <SelectTrigger className="h-9 w-44 text-xs">
            <SelectValue placeholder="Etiqueta" />
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
        <Button
          variant="outline"
          size="sm"
          className="h-9"
          onClick={() => setOrden(o => (o === 'desc' ? 'asc' : 'desc'))}
          title={orden === 'desc' ? 'Más recientes primero' : 'Más antiguas primero'}
        >
          {orden === 'desc'
            ? <ArrowDownWideNarrow className="mr-1.5 h-4 w-4" />
            : <ArrowUpWideNarrow className="mr-1.5 h-4 w-4" />}
          Fecha
        </Button>
      </div>

      {/* Listado */}
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : notas.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-3 text-muted-foreground border border-dashed border-border rounded-lg">
          <StickyNote className="h-8 w-8" />
          <p className="text-sm">No hay notas con estos filtros.</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {notas.map(nota => (
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
                  {wasEdited(nota) && <span className="italic">(editado)</span>}
                  <span className="rounded-full bg-klyp-pale px-2 py-0.5 text-[10px] font-medium text-klyp-navy">
                    {nota.proyecto_nombre ?? proyectoNombre(nota.proyecto_id)}
                  </span>
                  <TagBadges tags={nota.tags} className="ml-1" />
                </div>
                {canModify(nota) && (
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={() => openEdit(nota)}
                      className="p-1 text-muted-foreground hover:text-foreground"
                      title="Editar nota"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(nota)}
                      className="p-1 text-muted-foreground hover:text-destructive"
                      title="Eliminar nota"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <RichTextView className="mt-2 text-sm" html={nota.texto} />
            </li>
          ))}
        </ul>
      )}

      {/* Modal editar */}
      <Dialog open={!!editTarget} onOpenChange={v => !v && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar nota</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <RichTextEditor value={editTexto} onChange={setEditTexto} placeholder="Escribe una nota..." />
            {editTarget && canEditTags(editTarget) ? (
              <TagPicker
                tags={tags}
                value={editTagIds}
                onChange={setEditTagIds}
                emptyHint="No tienes etiquetas. Créalas en el menú Etiquetas."
              />
            ) : (
              editTarget && (editTarget.tags?.length ?? 0) > 0 && (
                <TagBadges tags={editTarget.tags} />
              )
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>Cancelar</Button>
            <Button onClick={handleEditSave} disabled={editSaving || isHtmlEmpty(editTexto)}>
              {editSaving ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
