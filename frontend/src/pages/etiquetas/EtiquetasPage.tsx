import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage } from '@/lib/api'
import type { Tag } from '@/types'
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
import { Loader2, Plus, Pencil, Trash2, Tags as TagsIcon } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

const PRESET_COLORS = [
  '#6B7280', '#EAB308', '#EF4444', '#3B82F6', '#22C55E',
  '#A855F7', '#EC4899', '#F97316', '#14B8A6', '#051937',
]

export default function EtiquetasPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)
  const [tags, setTags] = useState<Tag[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editTarget, setEditTarget] = useState<Tag | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null)
  const [form, setForm] = useState({ nombre: '', color: PRESET_COLORS[0] })

  const base = currentWorkspace ? `/workspaces/${currentWorkspace.id}/tags` : ''

  const load = async () => {
    if (!currentWorkspace) return
    setLoading(true)
    try {
      const { data } = await api.get<Tag[]>(base)
      setTags(data)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentWorkspace?.id])

  const openCreate = () => {
    setEditTarget(null)
    setForm({ nombre: '', color: PRESET_COLORS[0] })
    setModalOpen(true)
  }

  const openEdit = (tag: Tag) => {
    setEditTarget(tag)
    setForm({ nombre: tag.nombre, color: tag.color })
    setModalOpen(true)
  }

  const handleSave = async () => {
    if (!form.nombre.trim() || !currentWorkspace) return
    setSaving(true)
    try {
      if (editTarget) {
        const { data } = await api.put<Tag>(`${base}/${editTarget.id}`, {
          nombre: form.nombre.trim(),
          color: form.color,
        })
        setTags((prev) => prev.map((t) => (t.id === data.id ? data : t)))
        toast({ title: 'Etiqueta actualizada' })
      } else {
        const { data } = await api.post<Tag>(base, {
          nombre: form.nombre.trim(),
          color: form.color,
        })
        setTags((prev) => [...prev, data])
        toast({ title: 'Etiqueta creada' })
      }
      setModalOpen(false)
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    try {
      await api.delete(`${base}/${deleteTarget.id}`)
      setTags((prev) => prev.filter((t) => t.id !== deleteTarget.id))
      toast({ title: 'Etiqueta eliminada' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setDeleteTarget(null)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Etiquetas</h1>
          <p className="text-xs text-muted-foreground">
            Tus etiquetas son privadas. Úsalas para clasificar tareas y notas.
          </p>
        </div>
        <Button size="sm" className="h-10" onClick={openCreate}>
          <Plus className="mr-1.5 h-4 w-4" />
          Nueva
        </Button>
      </div>

      {tags.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-3 text-muted-foreground border border-dashed border-border rounded-lg">
          <TagsIcon className="h-8 w-8" />
          <p className="text-sm">Aún no tienes etiquetas</p>
          <Button size="sm" onClick={openCreate}>
            <Plus className="mr-1.5 h-4 w-4" />
            Nueva etiqueta
          </Button>
        </div>
      ) : (
        <ul className="space-y-2">
          {tags.map((tag) => (
            <li
              key={tag.id}
              className="flex items-center justify-between gap-3 rounded-md border bg-card p-3"
            >
              <span className="flex items-center gap-2.5">
                <span
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                <span className="text-sm font-medium">{tag.nombre}</span>
              </span>
              <span className="flex items-center gap-1">
                <button
                  onClick={() => openEdit(tag)}
                  className="p-2 text-muted-foreground hover:text-foreground rounded-md hover:bg-accent"
                  title="Editar"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setDeleteTarget(tag)}
                  className="p-2 text-muted-foreground hover:text-destructive rounded-md hover:bg-accent"
                  title="Eliminar"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Editar etiqueta' : 'Nueva etiqueta'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tag-nombre">Nombre</Label>
              <Input
                id="tag-nombre"
                value={form.nombre}
                onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
                placeholder="Ej. Reunión"
                maxLength={100}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex flex-wrap items-center gap-2">
                {PRESET_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, color: c }))}
                    className={`w-7 h-7 rounded-full border-2 transition-transform ${
                      form.color.toLowerCase() === c.toLowerCase()
                        ? 'border-foreground scale-110'
                        : 'border-transparent'
                    }`}
                    style={{ backgroundColor: c }}
                    aria-label={`Color ${c}`}
                  />
                ))}
                <input
                  type="color"
                  value={form.color}
                  onChange={(e) => setForm((f) => ({ ...f, color: e.target.value }))}
                  className="w-9 h-9 rounded cursor-pointer bg-transparent border border-border"
                  title="Color personalizado"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md bg-muted px-3 py-2">
              <span className="text-xs text-muted-foreground">Vista previa:</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-background px-2 py-0.5 text-[11px] font-medium">
                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: form.color }} />
                {form.nombre || 'Etiqueta'}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving || !form.nombre.trim()}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(v) => !v && setDeleteTarget(null)}
        title="Eliminar etiqueta"
        description={`¿Eliminar la etiqueta "${deleteTarget?.nombre}"? Se quitará de las tareas y notas que la tengan.`}
        onConfirm={handleDelete}
        confirmLabel="Eliminar"
        variant="destructive"
      />
    </div>
  )
}
