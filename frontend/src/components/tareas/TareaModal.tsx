import { useRef, useState, useEffect } from 'react'
import { format } from 'date-fns'
import { api, getErrorMessage } from '@/lib/api'
import type { Comentario, EstadoPago, Prioridad, Proyecto, ProyectoMiembro, Sprint, Subtarea, Tag, Tarea } from '@/types'
import { today } from '@/lib/utils'
import { TaskTimer } from '@/components/tareas/TaskTimer'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { DatePicker } from '@/components/ui/date-picker'
import { Textarea } from '@/components/ui/textarea'
import { RichTextEditor } from '@/components/ui/rich-text-editor'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { TagPicker } from '@/components/etiquetas/TagPicker'
import { Check, ChevronDown, ChevronUp, Loader2, MessageSquare, Paperclip, Plus, Trash2, X, ExternalLink } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface TareaModalProps {
  open: boolean
  onOpenChange: (v: boolean) => void
  tarea?: Tarea
  proyectoId: string
  workspaceId: string
  tags: Tag[]
  sprints?: Sprint[]
  proyectos?: Proyecto[]
  onSaved: (tarea: Tarea) => void
  onDeleted?: (tareaId: string) => void
}

type FormState = {
  descripcion: string
  descripcion_larga: string
  horas: string
  fecha: string
  tag_ids: string[]
  prioridad: string
  github_url: string
  estado_pago: EstadoPago
  fecha_inicio: string
  fecha_fin: string
  sprint_id: string
  assigned_to: string
}

const emptyForm = (): FormState => ({
  descripcion: '',
  descripcion_larga: '',
  horas: '0',
  fecha: today(),
  tag_ids: [],
  prioridad: '',
  github_url: '',
  estado_pago: 'pendiente',
  fecha_inicio: '',
  fecha_fin: '',
  sprint_id: '',
  assigned_to: '',
})

export function TareaModal({
  open,
  onOpenChange,
  tarea,
  proyectoId,
  workspaceId,
  tags,
  sprints,
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

  // Subtareas existentes (modo edición)
  const [subtareas, setSubtareas] = useState<Subtarea[]>([])
  const [newSubtarea, setNewSubtarea] = useState('')
  const [savingSubtarea, setSavingSubtarea] = useState(false)
  const [loadingSubtareas, setLoadingSubtareas] = useState(false)

  // Borrador de subtareas (modo creación): se envían inline con el POST de la tarea
  type DraftSubtarea = {
    descripcion: string
    fecha_inicio: string
    fecha_fin: string
    horas_estimadas: string
  }
  const [draftSubtareas, setDraftSubtareas] = useState<DraftSubtarea[]>([])
  const emptyDraft = (): DraftSubtarea => ({
    descripcion: '',
    fecha_inicio: '',
    fecha_fin: '',
    horas_estimadas: '',
  })

  // Comentarios
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [newComentario, setNewComentario] = useState('')
  const [savingComentario, setSavingComentario] = useState(false)
  const [loadingComentarios, setLoadingComentarios] = useState(false)

  // Miembros del proyecto (para asignar tarea)
  const [miembros, setMiembros] = useState<ProyectoMiembro[]>([])

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
          tag_ids: (tarea.tags ?? []).map((t) => t.id),
          prioridad: tarea.prioridad ?? '',
          github_url: tarea.github_url ?? '',
          estado_pago: tarea.estado_pago,
          fecha_inicio: tarea.fecha_inicio ?? '',
          fecha_fin: tarea.fecha_fin ?? '',
          sprint_id: tarea.sprint_id ?? '',
          assigned_to: tarea.assigned_to ?? '',
        })
        setArchivoUrl(tarea.archivo_url)
        setShowExtras(!!(tarea.github_url || tarea.archivo_url))
        loadSubtareas(tarea.id, tarea.proyecto_id)
        loadComentarios(tarea.id, tarea.proyecto_id)
      } else {
        setForm(emptyForm())
        setArchivoUrl(null)
        setShowExtras(false)
        setSubtareas([])
        setComentarios([])
        setDraftSubtareas([])
      }
      setDescError(false)
      pendingFileRef.current = null
      setNewSubtarea('')
      setNewComentario('')
    }
  }, [open, tarea])

  useEffect(() => {
    if (!open || !efectiveProyectoId) {
      setMiembros([])
      return
    }
    const loadMiembros = async () => {
      try {
        const { data } = await api.get<ProyectoMiembro[]>(
          `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/miembros`,
        )
        setMiembros(data)
      } catch {
        setMiembros([])
      }
    }
    loadMiembros()
  }, [open, workspaceId, efectiveProyectoId])

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

  const loadComentarios = async (tareaId: string, pId: string) => {
    setLoadingComentarios(true)
    try {
      const { data } = await api.get<Comentario[]>(
        `/workspaces/${workspaceId}/proyectos/${pId}/tareas/${tareaId}/comentarios`,
      )
      setComentarios(data)
    } catch {
      // silencioso
    } finally {
      setLoadingComentarios(false)
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
      const payload: Record<string, unknown> = {
        descripcion: form.descripcion,
        descripcion_larga: form.descripcion_larga || null,
        horas: parseFloat(form.horas) || 0,
        fecha: form.fecha,
        tag_ids: form.tag_ids,
        prioridad: (form.prioridad as Prioridad) || null,
        github_url: form.github_url || null,
        estado_pago: form.estado_pago,
        fecha_inicio: form.fecha_inicio || null,
        fecha_fin: form.fecha_fin || null,
        assigned_to: form.assigned_to || null,
      }

      // Sprint only on edit (assign from sprint tab handles new task case)
      if (isEdit) {
        payload.sprint_id = form.sprint_id || null
      }

      let savedTarea: Tarea
      if (isEdit && tarea) {
        const { data } = await api.put<Tarea>(
          `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tarea.id}`,
          payload,
        )
        savedTarea = data
      } else {
        // En creación adjuntamos las subtareas para crearlas en la misma request
        const cleanDrafts = draftSubtareas
          .map(d => ({
            descripcion: d.descripcion.trim(),
            fecha_inicio: d.fecha_inicio || null,
            fecha_fin: d.fecha_fin || null,
            horas_estimadas: d.horas_estimadas === '' ? null : parseFloat(d.horas_estimadas) || null,
          }))
          .filter(d => d.descripcion.length > 0)
        payload.subtareas = cleanDrafts
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

  const handleSaveSubtareaField = async (s: Subtarea) => {
    if (!tarea) return
    try {
      const { data } = await api.put<Subtarea>(
        `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tarea.id}/subtareas/${s.id}`,
        {
          descripcion: s.descripcion,
          fecha_inicio: s.fecha_inicio,
          fecha_fin: s.fecha_fin,
          horas_estimadas: s.horas_estimadas,
        },
      )
      setSubtareas(prev => prev.map(x => x.id === data.id ? data : x))
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const updateSubtareaField = (s: Subtarea, field: 'fecha_inicio' | 'fecha_fin', value: string | null) => {
    const updated = { ...s, [field]: value }
    setSubtareas(prev => prev.map(x => x.id === s.id ? updated : x))
    // Auto-guardar inmediatamente para fechas (no esperan blur)
    handleSaveSubtareaField(updated)
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

  const handleAddComentario = async () => {
    if (!newComentario.trim() || !tarea) return
    setSavingComentario(true)
    try {
      const { data } = await api.post<Comentario>(
        `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tarea.id}/comentarios`,
        { texto: newComentario.trim() },
      )
      setComentarios((prev) => [...prev, data])
      setNewComentario('')
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSavingComentario(false)
    }
  }

  const handleDeleteComentario = async (c: Comentario) => {
    if (!tarea) return
    try {
      await api.delete(
        `/workspaces/${workspaceId}/proyectos/${efectiveProyectoId}/tareas/${tarea.id}/comentarios/${c.id}`,
      )
      setComentarios((prev) => prev.filter((x) => x.id !== c.id))
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

            {/* Descripción larga (rich text) */}
            <div className="space-y-1.5">
              <Label>Descripción detallada</Label>
              <RichTextEditor
                value={form.descripcion_larga}
                onChange={(v) => set('descripcion_larga', v)}
                placeholder="Contexto, criterios de aceptación, notas..."
              />
            </div>

            {/* Subtareas: visibles tanto en creación como en edición */}
            <div className="border border-border/50 rounded-md overflow-hidden">
              <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                <span className="text-xs font-medium text-muted-foreground">
                  Subtareas
                  {isEdit && subtareas.length > 0 && (
                    <span className="ml-1.5 text-muted-foreground/60">
                      {completadas}/{subtareas.length}
                    </span>
                  )}
                </span>
                {isEdit && subtareas.length > 0 && (
                  <div className="flex-1 mx-3 h-1 bg-muted rounded-full overflow-hidden">
                    <div
                      className="h-full bg-green-500 rounded-full transition-all"
                      style={{ width: `${(completadas / subtareas.length) * 100}%` }}
                    />
                  </div>
                )}
              </div>

              {isEdit ? (
                <div className="px-3 pb-3 pt-2 space-y-2">
                  {loadingSubtareas ? (
                    <p className="text-xs text-muted-foreground">Cargando...</p>
                  ) : (
                    subtareas.map((s) => (
                      <div key={s.id} className="group/sub space-y-1.5">
                        <div className="flex items-center gap-2">
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
                          <Input
                            value={s.descripcion}
                            onChange={(e) => setSubtareas(prev => prev.map(x => x.id === s.id ? { ...x, descripcion: e.target.value } : x))}
                            onBlur={() => handleSaveSubtareaField(s)}
                            className={`h-7 text-xs flex-1 ${s.completada ? 'line-through text-muted-foreground' : ''}`}
                          />
                          <button
                            type="button"
                            onClick={() => handleDeleteSubtarea(s)}
                            className="flex-shrink-0 opacity-0 group-hover/sub:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="grid grid-cols-3 gap-2 pl-6">
                          <DatePicker
                            value={s.fecha_inicio ?? ''}
                            onChange={(v) => updateSubtareaField(s, 'fecha_inicio', v || null)}
                            placeholder="Inicio"
                          />
                          <DatePicker
                            value={s.fecha_fin ?? ''}
                            onChange={(v) => updateSubtareaField(s, 'fecha_fin', v || null)}
                            placeholder="Fin"
                          />
                          <Input
                            type="number"
                            min={0}
                            step={0.25}
                            value={s.horas_estimadas ?? ''}
                            onChange={(e) => setSubtareas(prev => prev.map(x => x.id === s.id ? { ...x, horas_estimadas: e.target.value === '' ? null : parseFloat(e.target.value) } : x))}
                            onBlur={() => handleSaveSubtareaField(s)}
                            placeholder="h"
                            className="h-8"
                          />
                        </div>
                      </div>
                    ))
                  )}
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
              ) : (
                <div className="px-3 pb-3 pt-2 space-y-2">
                  {draftSubtareas.length === 0 && (
                    <p className="text-xs text-muted-foreground/60 italic">
                      Añade subtareas que se crearán junto con esta tarea.
                    </p>
                  )}
                  {draftSubtareas.map((d, i) => (
                    <div key={i} className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <Input
                          value={d.descripcion}
                          onChange={(e) => setDraftSubtareas(prev => prev.map((x, idx) => idx === i ? { ...x, descripcion: e.target.value } : x))}
                          placeholder="Descripción de la subtarea"
                          className="h-7 text-xs flex-1"
                        />
                        <button
                          type="button"
                          onClick={() => setDraftSubtareas(prev => prev.filter((_, idx) => idx !== i))}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <DatePicker
                          value={d.fecha_inicio}
                          onChange={(v) => setDraftSubtareas(prev => prev.map((x, idx) => idx === i ? { ...x, fecha_inicio: v } : x))}
                          placeholder="Inicio"
                        />
                        <DatePicker
                          value={d.fecha_fin}
                          onChange={(v) => setDraftSubtareas(prev => prev.map((x, idx) => idx === i ? { ...x, fecha_fin: v } : x))}
                          placeholder="Fin"
                        />
                        <Input
                          type="number"
                          min={0}
                          step={0.25}
                          value={d.horas_estimadas}
                          onChange={(e) => setDraftSubtareas(prev => prev.map((x, idx) => idx === i ? { ...x, horas_estimadas: e.target.value } : x))}
                          placeholder="h"
                          className="h-8"
                        />
                      </div>
                    </div>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => setDraftSubtareas(prev => [...prev, emptyDraft()])}
                  >
                    <Plus className="h-3 w-3 mr-1" /> Añadir subtarea
                  </Button>
                </div>
              )}
            </div>

            {/* Fecha y horas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Fecha</Label>
                <DatePicker value={form.fecha} onChange={(v) => set('fecha', v)} />
              </div>
              <div className="space-y-1.5">
                <Label>Horas</Label>
                <Input
                  type="number"
                  min="0"
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
                <DatePicker value={form.fecha_inicio} onChange={(v) => set('fecha_inicio', v)} placeholder="Sin fecha inicio" />
              </div>
              <div className="space-y-1.5">
                <Label>Fin (Gantt)</Label>
                <DatePicker value={form.fecha_fin} onChange={(v) => set('fecha_fin', v)} placeholder="Sin fecha fin" />
              </div>
            </div>

            {/* Prioridad y Estado pago */}
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
            </div>

            {/* Asignado a */}
            <div className="space-y-1.5">
              <Label>Asignado a</Label>
              <Select value={form.assigned_to} onValueChange={(v) => set('assigned_to', v === 'none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Sin asignar" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin asignar</SelectItem>
                  {miembros.map((m) => (
                    <SelectItem key={m.user_id} value={m.user_id}>
                      <span className="flex items-center gap-2">
                        {m.user?.avatar_url ? (
                          <img src={m.user.avatar_url} className="h-4 w-4 rounded-full" alt="" />
                        ) : (
                          <span className="h-4 w-4 rounded-full bg-klyp-pale text-klyp-navy text-[9px] font-semibold flex items-center justify-center flex-shrink-0">
                            {(m.user?.nombre ?? '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                        {m.user?.nombre ?? m.user_id}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {miembros.length === 0 && efectiveProyectoId && (
                <p className="text-[10px] text-muted-foreground">Añade miembros al proyecto desde la pestaña Equipo</p>
              )}
            </div>

            {/* Etiquetas (multietiqueta) */}
            <div className="space-y-1.5">
              <Label>Etiquetas</Label>
              <TagPicker
                tags={tags}
                value={form.tag_ids}
                onChange={(ids) => setForm((f) => ({ ...f, tag_ids: ids }))}
                emptyHint="No tienes etiquetas. Créalas en el menú Etiquetas."
              />
            </div>

            {/* Sprint (solo en edición, si hay sprints disponibles) */}
            {isEdit && sprints && sprints.length > 0 && (
              <div className="space-y-1.5">
                <Label>Sprint</Label>
                <Select value={form.sprint_id} onValueChange={(v) => set('sprint_id', v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sin sprint" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sin sprint</SelectItem>
                    {sprints.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

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
                  <div className="space-y-1.5">
                    <Label>Ruta GitHub (PR, branch, issue...)</Label>
                    <Input
                      value={form.github_url}
                      onChange={(e) => set('github_url', e.target.value)}
                      placeholder="https://github.com/org/repo/pull/123"
                    />
                  </div>

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

            {/* Cronómetro (solo en edición) */}
            {isEdit && tarea && (
              <div className="border border-border/50 rounded-md overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                  <span className="text-xs font-medium text-muted-foreground">Cronómetro</span>
                </div>
                <div className="px-3 pb-3 pt-2">
                  <TaskTimer
                    tareaId={tarea.id}
                    proyectoId={efectiveProyectoId}
                    workspaceId={workspaceId}
                    onHorasUpdated={(newHoras) => set('horas', newHoras.toString())}
                  />
                </div>
              </div>
            )}

            {/* Comentarios (solo en edición) */}
            {isEdit && (
              <div className="border border-border/50 rounded-md overflow-hidden">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30">
                  <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                  <span className="text-xs font-medium text-muted-foreground">
                    Comentarios
                    {comentarios.length > 0 && (
                      <span className="ml-1.5 text-muted-foreground/60">({comentarios.length})</span>
                    )}
                  </span>
                </div>
                <div className="px-3 pb-3 pt-2 space-y-3">
                  {loadingComentarios ? (
                    <p className="text-xs text-muted-foreground">Cargando...</p>
                  ) : comentarios.length === 0 ? (
                    <p className="text-xs text-muted-foreground/60 italic">Sin comentarios todavía</p>
                  ) : (
                    comentarios.map((c) => (
                      <div key={c.id} className="flex items-start gap-2 group/com">
                        {c.autor_avatar_url ? (
                          <img src={c.autor_avatar_url} alt="" className="h-6 w-6 rounded-full flex-shrink-0 mt-1" />
                        ) : (
                          <span className="h-6 w-6 rounded-full bg-klyp-pale text-klyp-navy text-[10px] font-semibold flex items-center justify-center flex-shrink-0 mt-1">
                            {(c.autor_nombre ?? '?').charAt(0).toUpperCase()}
                          </span>
                        )}
                        <div className="flex-1 min-w-0 bg-muted/30 rounded-md px-3 py-2">
                          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mb-1">
                            <span className="font-medium text-foreground">{c.autor_nombre ?? 'Desconocido'}</span>
                            <span>·</span>
                            <span>{format(new Date(c.created_at), 'dd/MM/yyyy HH:mm')}</span>
                          </div>
                          <p className="text-sm whitespace-pre-wrap break-words">{c.texto}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleDeleteComentario(c)}
                          className="flex-shrink-0 mt-1 opacity-0 group-hover/com:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                  {/* Añadir comentario */}
                  <div className="flex items-end gap-2 mt-1">
                    <Textarea
                      value={newComentario}
                      onChange={(e) => setNewComentario(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          handleAddComentario()
                        }
                      }}
                      placeholder="Añadir comentario... (Enter para enviar, Shift+Enter para nueva línea)"
                      rows={2}
                      className="text-xs flex-1 resize-none"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      className="h-8 w-8 flex-shrink-0"
                      onClick={handleAddComentario}
                      disabled={savingComentario || !newComentario.trim()}
                    >
                      {savingComentario ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
              </div>
            )}
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
