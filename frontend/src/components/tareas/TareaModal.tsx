import { useRef, useState, useEffect } from 'react'
import { api, getErrorMessage } from '@/lib/api'
import type { EstadoKanban, EstadoPago, Prioridad, Proyecto, Subtarea, Tag, Tarea } from '@/types'
import { today } from '@/lib/utils'
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
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Check, ChevronDown, ChevronUp, Loader2, Paperclip, Plus, Trash2, X, ExternalLink } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

const COMPLEJIDAD_LABELS: Record<number, string> = {
  1: '1 — Trivial',
  2: '2 — Muy fácil',
  3: '3 — Fácil',
  4: '4 — Moderado',
  5: '5 — Medio',
  6: '6 — Difícil',
  7: '7 — Muy difícil',
  8: '8 — Complejo',
  9: '9 — Dividir tarea',
}

interface TareaModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  tarea?: Tarea
  proyectoId: string
  workspaceId: string
  tags: Tag[]
  proyectos?: Proyecto[]
  onSaved: (tarea: Tarea) => void
  onDeleted?: (tareaId: string) => void
}

type FormState = {
  descripcion: string
  descripcion_larga: string
  horas: string
  fecha: string
  tag_id: string
  prioridad: string
  complejidad: string
  github_url: string
  estado_pago: EstadoPago
  estado_kanban: EstadoKanban
  fecha_inicio: string
  fecha_fin: string
}

const emptyForm = (): FormState => ({
  descripcion: '',
  descripcion_larga: '',
  horas: '0',
  fecha: today(),
  tag_id: '',
  prioridad: '',
  complejidad: '',
  github_url: '',
  estado_pago: 'pendiente',
  estado_kanban: 'todo',
  fecha_inicio: '',
  fecha_fin: '',
})

export function TareaModal({
  open,
  onOpenChange,
  tarea,
  proyectoId,
  workspaceId,
  tags,
  proyectos,
  onSaved,
  onDeleted,
}: TareaModalProps) {
  const isEdit = !!tarea
  const [form, setForm] = useState<FormState>(emptyForm())
  const [selectedProyectoId, setSelectedProyectoId] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [archivoUrl, setArchivoUrl] = useState<string | null>(null)
  const [showExtras, setShowExtras] = useState(false)
  const [descError, setDescError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pendingFileRef = useRef<File | null>(null)

  // Subtareas
  const [subtareas, setSubtareas] = useState<Subtarea[]>([])
  const [newSubtarea, setNewSubtarea] = useState('')
  const [savingSubtarea, setSavingSubtarea] = useState(false)
  const [loadingSubtareas, setLoadingSubtareas] = useState(false)

  const efectiveProyectoId = proyectoId || selectedProyectoId

  useEffect(() => {
    if (open) {
      setSelectedProyectoId(tarea?.proyecto_id ?? '')
      if (tarea) {
        setForm({
          descripcion: tarea.descripcion,
          descripcion_larga: tarea.descripcion_larga ?? '',
          horas: tarea.horas.toString(),
          fecha: tarea.fecha,
          tag_id: tarea.tag_id ?? '',
          prioridad: tarea.prioridad ?? '',
          complejidad: tarea.complejidad?.toString() ?? '',
          github_url: tarea.github_url ?? '',
          estado_pago: tarea.estado_pago,
          estado_kanban: tarea.estado_kanban,
          fecha_inicio: tarea.fecha_inicio ?? '',
          fecha_fin: tarea.fecha_fin ?? '',
        })
        setArchivoUrl(tarea.archivo_url)
        setShowExtras(!!(tarea.github_url || tarea.archivo_url))
        loadSubtareas(tarea.id, tarea.proyecto_id)
      } else {
        setForm(emptyForm())
        setArchivoUrl(null)
        setShowExtras(false)
        setSubtareas([])
      }
      setDescError(false)
      pendingFileRef.current = null
      setNewSubtarea('')
    }
  }, [open, tarea])

  const loadSubtareas = async (tareaId: string, pId: string) => {
    setLoadingSubtareas(true)
    try {
      const { data } = await api.get<Subtarea[]>(
        `/workspaces/${workspaceId}/proyectos/${pId}/tareas/${tareaId}/subtareas`,
      )
      setSubtareas(data)
    } catch {
      // silencioso
    } finally {
      setLoadingSubtareas(false)
    }
  }

  const set = (field: keyof FormState, value: string) =>
    setForm((f) => ({ ...f, [field]: value }))

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    pendingFileRef.current = file
    toast({ title: `Archivo seleccionado: ${file.name}` })
  }

  const uploadFile = async (tareaId: string): Promise<string | null> => {
    const file = pendingFileRef.current
    if (!file) return null
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const { data } = await api.post<Tarea>(
        `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tareaId}/upload`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' } },
      )
      return data.archivo_url
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
      return null
    } finally {
      setUploading(false)
      pendingFileRef.current = null
    }
  }

  const handleSave = async () => {
    if (!form.descripcion.trim()) { setDescError(true); return }
    if (!efectiveProyectoId) {
      toast({ title: 'Selecciona un proyecto', variant: 'destructive' })
      return
    }
    setSaving(true)
    try {
      const payload = {
        descripcion: form.descripcion,
        descripcion_larga: form.descripcion_larga || null,
        horas: parseFloat(form.horas) || 0,
        fecha: form.fecha,
        tag_id: form.tag_id || null,
        prioridad: (form.prioridad as Prioridad) || null,
        complejidad: form.complejidad ? parseInt(form.complejidad) : null,
        github_url: form.github_url || null,
        estado_pago: form.estado_pago,
        estado_kanban: form.estado_kanban,
        fecha_inicio: form.fecha_inicio || null,
        fecha_fin: form.fecha_fin || null,
      }

      let savedTarea: Tarea
      if (isEdit && tarea) {
        const { data } = await api.put<Tarea>(
          `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tarea.id}`,
          payload,
        )
        savedTarea = data
      } else {
        const { data } = await api.post<Tarea>(
          `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas`,
          payload,
        )
        savedTarea = data
      }

      if (pendingFileRef.current) {
        const url = await uploadFile(savedTarea.id)
        if (url) savedTarea = { ...savedTarea, archivo_url: url }
      }

      onSaved(savedTarea)
      onOpenChange(false)
      toast({ title: isEdit ? 'Tarea actualizada' : 'Tarea creada' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!tarea) return
    try {
      await api.delete(
        `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tarea.id}`,
      )
      onDeleted?.(tarea.id)
      onOpenChange(false)
      toast({ title: 'Tarea eliminada' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleAddSubtarea = async () => {
    if (!newSubtarea.trim() || !tarea) return
    setSavingSubtarea(true)
    try {
      const { data } = await api.post<Subtarea>(
        `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tarea.id}/subtareas`,
        { descripcion: newSubtarea.trim() },
      )
      setSubtareas((prev) => [...prev, data])
      setNewSubtarea('')
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSavingSubtarea(false)
    }
  }

  const handleToggleSubtarea = async (subtarea: Subtarea) => {
    if (!tarea) return
    try {
      const { data } = await api.put<Subtarea>(
        `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tarea.id}/subtareas/${subtarea.id}`,
        { completada: !subtarea.completada },
      )
      setSubtareas((prev) => prev.map((s) => (s.id === data.id ? data : s)))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleDeleteSubtarea = async (subtarea: Subtarea) => {
    if (!tarea) return
    try {
      await api.delete(
        `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tarea.id}/subtareas/${subtarea.id}`,
      )
      setSubtareas((prev) => prev.filter((s) => s.id !== subtarea.id))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const completadas = subtareas.filter((s) => s.completada).length

  const isBusy = saving || uploading

  return (
    <>
      <Dialog open={open} onOpenChange={(v) => !isBusy && onOpenChange(v)}>
        <DialogContent className="sm:max-w-lg w-full sm:h-auto h-screen sm:rounded-lg rounded-none flex flex-col max-h-screen sm:max-h-[90vh]">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>{isEdit ? 'Editar tarea' : 'Nueva tarea'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 overflow-y-auto flex-1 pr-1">
            {/* Selector de proyecto (solo desde bitácora) */}
            {proyectos && (
              <div className="space-y-1.5">
                <Label>Proyecto <span className="text-destructive">*</span></Label>
                <Select value={selectedProyectoId} onValueChange={setSelectedProyectoId} disabled={isEdit}>
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

            {/* Descripción */}
            <div className="space-y-1.5">
              <Label>
                Descripción
                <span className="text-destructive ml-1">*</span>
              </Label>
              <Input
                value={form.descripcion}
                onChange={(e) => { set('descripcion', e.target.value); setDescError(false) }}
                placeholder="Título de la tarea"
                autoFocus
                aria-required="true"
                aria-invalid={descError}
                className={descError ? 'border-destructive' : ''}
              />
              {descError && (
                <p className="text-xs text-destructive">La descripción es obligatoria</p>
              )}
            </div>

            {/* Descripción larga */}
            <div className="space-y-1.5">
              <Label>Descripción detallada</Label>
              <Textarea
                rows={5}
                value={form.descripcion_larga}
                onChange={(e) => set('descripcion_larga', e.target.value)}
                placeholder="Contexto, criterios de aceptación, notas..."
                className="resize-y"
              />
            </div>

            {/* Subtareas (solo en edición) */}
            {isEdit && (
              <div className="border border-border/50 rounded-md overflow-hidden">
                <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground">
                    Subtareas
                    {subtareas.length > 0 && (
                      <span className="ml-1.5 text-muted-foreground/60">
                        {completadas}/{subtareas.length}
                      </span>
                    )}
                  </span>
                  {subtareas.length > 0 && (
                    <div className="flex-1 mx-3 h-1 bg-muted rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${(completadas / subtareas.length) * 100}%` }}
                      />
                    </div>
                  )}
                </div>
                <div className="px-3 pb-3 pt-2 space-y-2">
                  {loadingSubtareas ? (
                    <p className="text-xs text-muted-foreground">Cargando...</p>
                  ) : (
                    subtareas.map((s) => (
                      <div key={s.id} className="flex items-center gap-2 group/sub">
                        <button
                          type="button"
                          onClick={() => handleToggleSubtarea(s)}
                          className={`flex-shrink-0 h-4 w-4 rounded border transition-colors flex items-center justify-center ${
                            s.completada
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-border hover:border-primary'
                          }`}
                        >
                          {s.completada && <Check className="h-2.5 w-2.5" />}
                        </button>
                        <span className={`text-sm flex-1 min-w-0 ${s.completada ? 'line-through text-muted-foreground' : ''}`}>
                          {s.descripcion}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleDeleteSubtarea(s)}
                          className="flex-shrink-0 opacity-0 group-hover/sub:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                  {/* Añadir subtarea */}
                  <div className="flex items-center gap-2 mt-1">
                    <Input
                      value={newSubtarea}
                      onChange={(e) => setNewSubtarea(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAddSubtarea() } }}
                      placeholder="Nueva subtarea..."
                      className="h-7 text-xs flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-7 w-7 flex-shrink-0"
                      onClick={handleAddSubtarea}
                      disabled={savingSubtarea || !newSubtarea.trim()}
                    >
                      {savingSubtarea ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Fecha y horas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => set('fecha', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Horas</Label>
                <Input
                  type="number"
                  min="0"
                  max="24"
                  step="0.25"
                  value={form.horas}
                  onChange={(e) => set('horas', e.target.value)}
                />
              </div>
            </div>

            {/* Planificación Gantt */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Inicio (Gantt)</Label>
                <Input
                  type="date"
                  value={form.fecha_inicio}
                  onChange={(e) => set('fecha_inicio', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Fin (Gantt)</Label>
                <Input
                  type="date"
                  value={form.fecha_fin}
                  onChange={(e) => set('fecha_fin', e.target.value)}
                />
              </div>
            </div>

            {/* Prioridad y Complejidad */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Prioridad</Label>
                <Select value={form.prioridad} onValueChange={(v) => set('prioridad', v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin prioridad" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin prioridad</SelectItem>
                    <SelectItem value="critico">🔴 Crítico</SelectItem>
                    <SelectItem value="alto">🟠 Alto</SelectItem>
                    <SelectItem value="medio">🟡 Medio</SelectItem>
                    <SelectItem value="bajo">🟢 Bajo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Complejidad</Label>
                <Select value={form.complejidad} onValueChange={(v) => set('complejidad', v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin puntuación" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin puntuación</SelectItem>
                    {Object.entries(COMPLEJIDAD_LABELS).map(([val, label]) => (
                      <SelectItem key={val} value={val}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Estado pago y Kanban */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Estado pago</Label>
                <Select value={form.estado_pago} onValueChange={(v) => set('estado_pago', v as EstadoPago)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pendiente">⏳ Pendiente</SelectItem>
                    <SelectItem value="facturado">💳 Facturado</SelectItem>
                    <SelectItem value="cobrado">✅ Cobrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Columna kanban</Label>
                <Select value={form.estado_kanban} onValueChange={(v) => set('estado_kanban', v as EstadoKanban)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="backlog">Backlog</SelectItem>
                    <SelectItem value="todo">Por hacer</SelectItem>
                    <SelectItem value="en_progreso">En progreso</SelectItem>
                    <SelectItem value="revision">Revisión</SelectItem>
                    <SelectItem value="done">Hecho</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Tag */}
            <div className="space-y-1.5">
              <Label>Etiqueta</Label>
              <Select value={form.tag_id} onValueChange={(v) => set('tag_id', v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin etiqueta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin etiqueta</SelectItem>
                  {tags.map((t) => (
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

            {/* Extras collapsible: GitHub + Archivo */}
            <div className="border border-border/50 rounded-md overflow-hidden">
              <button
                type="button"
                onClick={() => setShowExtras((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
              >
                <span className="font-medium">Enlace GitHub y archivo adjunto</span>
                {showExtras ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>

              {showExtras && (
                <div className="px-3 pb-3 space-y-3 border-t border-border/50 pt-3">
                  {/* GitHub URL */}
                  <div className="space-y-1.5">
                    <Label>Ruta GitHub (PR, branch, issue...)</Label>
                    <Input
                      value={form.github_url}
                      onChange={(e) => set('github_url', e.target.value)}
                      placeholder="https://github.com/org/repo/pull/123"
                    />
                  </div>

                  {/* Archivo adjunto */}
                  <div className="space-y-1.5">
                    <Label>Archivo adjunto</Label>
                    {archivoUrl ? (
                      <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                        <Paperclip className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                        <a
                          href={`${archivoUrl}?token=${localStorage.getItem('access_token') ?? ''}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-primary truncate flex-1 flex items-center gap-1 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {archivoUrl.split('/').pop()}
                          <ExternalLink className="h-3 w-3" />
                        </a>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => { e.stopPropagation(); setArchivoUrl(null) }}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
                        >
                          <Paperclip className="mr-1.5 h-3.5 w-3.5" />
                          {pendingFileRef.current ? pendingFileRef.current.name : 'Adjuntar archivo'}
                        </Button>
                        {uploading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                        {!uploading && <span className="text-xs text-muted-foreground">máx. 10 MB</span>}
                      </div>
                    )}
                    <input
                      ref={fileRef}
                      type="file"
                      className="hidden"
                      accept=".jpg,.jpeg,.png,.gif,.pdf,.doc,.docx,.xls,.xlsx,.zip,.txt,.md"
                      onChange={handleFileSelect}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="flex-shrink-0 flex-col-reverse sm:flex-row gap-2 pt-2">
            {isEdit && (
              <Button
                variant="ghost"
                className="text-destructive hover:text-destructive mr-auto"
                onClick={() => setConfirmDelete(true)}
                disabled={isBusy}
              >
                <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                Eliminar
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isBusy}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={isBusy || !form.descripcion}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {uploading && !saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEdit ? 'Guardar cambios' : 'Crear tarea'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Eliminar tarea"
        description={`¿Eliminar "${tarea?.descripcion}"? Esta acción no se puede deshacer.`}
        confirmLabel="Eliminar"
        onConfirm={handleDelete}
      />
    </>
  )
}
