import * as XLSX from 'xlsx'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { format } from 'date-fns'
import type { Gasto, KanbanEstado, Proyecto, Sprint, Tag, Tarea } from '@/types'

// ── Labels ────────────────────────────────────────────────────────────────────

const PRIORIDAD: Record<string, string> = {
  critico: 'Crítico',
  alto: 'Alto',
  medio: 'Medio',
  bajo: 'Bajo',
}

const ESTADO_PAGO: Record<string, string> = {
  pendiente: 'Pendiente',
  facturado: 'Facturado',
  cobrado: 'Cobrado',
}

function buildEstadoMap(kanbanEstados: KanbanEstado[]): Record<string, string> {
  return Object.fromEntries(kanbanEstados.map((e) => [e.id, e.nombre]))
}

const TIPO_PAGO: Record<string, string> = {
  unico: 'Único',
  recurrente: 'Recurrente',
}

const PERIODICIDAD: Record<string, string> = {
  mensual: 'Mensual',
  trimestral: 'Trimestral',
  anual: 'Anual',
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function slugify(str: string): string {
  return str.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
}

function dateSuffix(): string {
  return format(new Date(), 'yyyyMMdd')
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function formatHorasExport(horas: number): string {
  if (horas < 1) return `${Math.round(horas * 60)}min`
  return `${horas}h`
}

// ── Sprint Excel ──────────────────────────────────────────────────────────────

export function exportSprintsExcel(
  proyecto: Proyecto,
  sprints: Sprint[],
  tareas: Tarea[],
  tags: Tag[],
  kanbanEstados: KanbanEstado[] = [],
) {
  const ESTADO_KANBAN = buildEstadoMap(kanbanEstados)
  const wb = XLSX.utils.book_new()

  // ── Hoja 1: Planificación ──────────────────────────────────────────────────
  const rows: (string | number)[][] = []
  const headerRow = ['Sprint', 'Tarea', 'Prioridad', 'Horas est.', 'Estado', 'Fecha inicio', 'Fecha fin']
  rows.push(headerRow)

  let totalProyecto = 0

  for (const sprint of sprints) {
    const sprintTareas = tareas.filter((t) => t.sprint_id === sprint.id)
    const sprintTotal = sprintTareas.reduce((s, t) => s + t.horas, 0)
    totalProyecto += sprintTotal

    // Fila título del sprint
    rows.push([sprint.nombre, '', '', '', '', sprint.fecha_inicio, sprint.fecha_fin])

    for (const t of sprintTareas) {
      rows.push([
        '',
        t.descripcion,
        t.prioridad ? PRIORIDAD[t.prioridad] ?? t.prioridad : '',
        t.horas,
        ESTADO_KANBAN[t.estado_kanban] ?? t.estado_kanban,
        t.fecha_inicio ?? '',
        t.fecha_fin ?? '',
      ])
    }

    if (sprintTareas.length === 0) {
      rows.push(['', '(sin tareas asignadas)', '', '', '', '', ''])
    }

    // Fila total del sprint
    rows.push([`TOTAL ${sprint.nombre}`, '', '', sprintTotal, '', '', ''])
    rows.push(['', '', '', '', '', '', '']) // separador
  }

  // Sin planificar
  const unplanned = tareas.filter((t) => !t.sprint_id)
  if (unplanned.length > 0) {
    rows.push(['Sin planificar', '', '', '', '', '', ''])
    for (const t of unplanned) {
      rows.push([
        '',
        t.descripcion,
        t.prioridad ? PRIORIDAD[t.prioridad] ?? t.prioridad : '',
        t.horas,
        ESTADO_KANBAN[t.estado_kanban] ?? t.estado_kanban,
        t.fecha_inicio ?? '',
        t.fecha_fin ?? '',
      ])
    }
    const unplannedTotal = unplanned.reduce((s, t) => s + t.horas, 0)
    totalProyecto += unplannedTotal
    rows.push(['TOTAL Sin planificar', '', '', unplannedTotal, '', '', ''])
    rows.push(['', '', '', '', '', '', ''])
  }

  rows.push(['TOTAL PROYECTO', '', '', totalProyecto, '', '', ''])

  const ws1 = XLSX.utils.aoa_to_sheet(rows)
  ws1['!cols'] = [{ wch: 28 }, { wch: 45 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Planificación')

  // ── Hoja 2: Resumen ────────────────────────────────────────────────────────
  const resumenRows: (string | number)[][] = [
    ['Sprint', 'Fecha inicio', 'Fecha fin', 'Nº tareas', 'Horas totales'],
  ]
  for (const sprint of sprints) {
    const st = tareas.filter((t) => t.sprint_id === sprint.id)
    resumenRows.push([
      sprint.nombre,
      sprint.fecha_inicio,
      sprint.fecha_fin,
      st.length,
      st.reduce((s, t) => s + t.horas, 0),
    ])
  }
  const ws2 = XLSX.utils.aoa_to_sheet(resumenRows)
  ws2['!cols'] = [{ wch: 28 }, { wch: 14 }, { wch: 14 }, { wch: 10 }, { wch: 14 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumen')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  downloadBlob(
    new Blob([buf], { type: 'application/octet-stream' }),
    `sprints-${slugify(proyecto.nombre)}-${dateSuffix()}.xlsx`,
  )
}

// ── Sprint PDF ────────────────────────────────────────────────────────────────

export function exportSprintsPDF(
  proyecto: Proyecto,
  sprints: Sprint[],
  tareas: Tarea[],
  _tags: Tag[],
  kanbanEstados: KanbanEstado[] = [],
) {
  const ESTADO_KANBAN = buildEstadoMap(kanbanEstados)
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const navy: [number, number, number] = [26, 58, 107]
  const pageW = doc.internal.pageSize.getWidth()
  let y = 18

  // Encabezado
  doc.setFontSize(18)
  doc.setTextColor(...navy)
  doc.text(`Planificación de Sprints`, 14, y)
  y += 8
  doc.setFontSize(10)
  doc.setTextColor(100, 100, 100)
  doc.text(`Proyecto: ${proyecto.nombre}`, 14, y)
  y += 5
  doc.text(`Generado: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 14, y)
  y += 10

  // Tabla por sprint
  for (const sprint of sprints) {
    const sprintTareas = tareas.filter((t) => t.sprint_id === sprint.id)
    const sprintTotal = sprintTareas.reduce((s, t) => s + t.horas, 0)

    // Subtítulo del sprint
    doc.setFontSize(11)
    doc.setTextColor(...navy)
    doc.text(`${sprint.nombre}  ·  ${sprint.fecha_inicio} – ${sprint.fecha_fin}`, 14, y)
    y += 2

    autoTable(doc, {
      startY: y,
      head: [['Tarea', 'Prioridad', 'Horas', 'Estado']],
      body:
        sprintTareas.length > 0
          ? [
              ...sprintTareas.map((t) => [
                t.descripcion,
                t.prioridad ? PRIORIDAD[t.prioridad] ?? t.prioridad : '—',
                formatHorasExport(t.horas),
                ESTADO_KANBAN[t.estado_kanban] ?? t.estado_kanban,
              ]),
              [{ content: `Total: ${formatHorasExport(sprintTotal)}`, colSpan: 4, styles: { halign: 'right', fontStyle: 'bold' } }],
            ]
          : [['(sin tareas asignadas)', '', '', '']],
      headStyles: { fillColor: navy, fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      columnStyles: { 0: { cellWidth: pageW - 28 - 24 - 20 - 26 }, 1: { cellWidth: 24 }, 2: { cellWidth: 20 }, 3: { cellWidth: 26 } },
      margin: { left: 14, right: 14 },
      theme: 'striped',
      didDrawPage: () => { y = (doc as any).lastAutoTable.finalY + 10 },
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // Sin planificar
  const unplanned = tareas.filter((t) => !t.sprint_id)
  if (unplanned.length > 0) {
    doc.setFontSize(11)
    doc.setTextColor(...navy)
    doc.text(`Sin planificar`, 14, y)
    y += 2
    autoTable(doc, {
      startY: y,
      head: [['Tarea', 'Prioridad', 'Horas', 'Estado']],
      body: unplanned.map((t) => [
        t.descripcion,
        t.prioridad ? PRIORIDAD[t.prioridad] ?? t.prioridad : '—',
        formatHorasExport(t.horas),
        ESTADO_KANBAN[t.estado_kanban] ?? t.estado_kanban,
      ]),
      headStyles: { fillColor: [100, 100, 100] as [number, number, number], fontSize: 9 },
      bodyStyles: { fontSize: 8 },
      margin: { left: 14, right: 14 },
      theme: 'striped',
    })
    y = (doc as any).lastAutoTable.finalY + 10
  }

  // Tabla resumen
  doc.setFontSize(11)
  doc.setTextColor(...navy)
  doc.text('Resumen por Sprint', 14, y)
  y += 2
  autoTable(doc, {
    startY: y,
    head: [['Sprint', 'Fecha inicio', 'Fecha fin', 'Nº tareas', 'Horas']],
    body: sprints.map((s) => {
      const st = tareas.filter((t) => t.sprint_id === s.id)
      return [s.nombre, s.fecha_inicio, s.fecha_fin, st.length, formatHorasExport(st.reduce((acc, t) => acc + t.horas, 0))]
    }),
    headStyles: { fillColor: navy, fontSize: 9 },
    bodyStyles: { fontSize: 8 },
    margin: { left: 14, right: 14 },
    theme: 'striped',
  })

  doc.save(`sprints-${slugify(proyecto.nombre)}-${dateSuffix()}.pdf`)
}

// ── Tareas Excel ──────────────────────────────────────────────────────────────

export function exportTareasExcel(
  proyecto: Proyecto,
  tareas: Tarea[],
  sprints: Sprint[],
  tags: Tag[],
  kanbanEstados: KanbanEstado[] = [],
) {
  const ESTADO_KANBAN = buildEstadoMap(kanbanEstados)
  const sprintMap = Object.fromEntries(sprints.map((s) => [s.id, s.nombre]))
  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t.nombre]))

  const rows: (string | number)[][] = [
    ['Descripción', 'Fecha', 'Horas', 'Prioridad', 'Estado Kanban', 'Estado Pago', 'Sprint', 'Tag', 'Fecha inicio', 'Fecha fin'],
    ...tareas.map((t) => [
      t.descripcion,
      t.fecha,
      t.horas,
      t.prioridad ? PRIORIDAD[t.prioridad] ?? t.prioridad : '',
      ESTADO_KANBAN[t.estado_kanban] ?? t.estado_kanban,
      ESTADO_PAGO[t.estado_pago] ?? t.estado_pago,
      t.sprint_id ? sprintMap[t.sprint_id] ?? '' : '',
      t.tag_id ? tagMap[t.tag_id] ?? '' : '',
      t.fecha_inicio ?? '',
      t.fecha_fin ?? '',
    ]),
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [
    { wch: 45 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 24 }, { wch: 14 }, { wch: 14 }, { wch: 14 },
  ]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Tareas')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  downloadBlob(
    new Blob([buf], { type: 'application/octet-stream' }),
    `tareas-${slugify(proyecto.nombre)}-${dateSuffix()}.xlsx`,
  )
}

// ── Gastos Excel ──────────────────────────────────────────────────────────────

export function exportGastosExcel(proyecto: Proyecto, gastos: Gasto[]) {
  const total = gastos.reduce((s, g) => s + g.monto, 0)

  const rows: (string | number)[][] = [
    ['Concepto', 'Fecha', 'Monto (€)', 'Tipo pago', 'Periodicidad'],
    ...gastos.map((g) => [
      g.concepto,
      g.fecha,
      g.monto,
      TIPO_PAGO[g.tipo_pago] ?? g.tipo_pago,
      g.periodicidad ? PERIODICIDAD[g.periodicidad] ?? g.periodicidad : '',
    ]),
    ['TOTAL', '', total, '', ''],
  ]

  const ws = XLSX.utils.aoa_to_sheet(rows)
  ws['!cols'] = [{ wch: 35 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }]

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Gastos')

  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })
  downloadBlob(
    new Blob([buf], { type: 'application/octet-stream' }),
    `gastos-${slugify(proyecto.nombre)}-${dateSuffix()}.xlsx`,
  )
}
