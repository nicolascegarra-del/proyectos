import { useState } from 'react'
import { api, getErrorMessage } from '@/lib/api'
import type { Presupuesto, Configuracion } from '@/types'
import { formatEUR } from '@/lib/utils'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Send, Loader2 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

interface EmailModalProps {
  open: boolean
  onClose: () => void
  presupuesto: Presupuesto
  clienteNombre: string
  proyectoNombre: string
  config: Configuracion | null
}

function renderTemplate(template: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce(
    (t, [k, v]) => t.replaceAll(`{{${k}}}`, v),
    template,
  )
}

export function EmailModal({
  open,
  onClose,
  presupuesto,
  clienteNombre,
  proyectoNombre,
  config,
}: EmailModalProps) {
  const vars = {
    cliente: clienteNombre,
    proyecto: proyectoNombre,
    total: formatEUR(presupuesto.total),
  }

  const defaultSubject = renderTemplate(
    config?.email_template_subject ?? 'Presupuesto {{proyecto}} - {{cliente}}',
    vars,
  )
  const defaultBody = renderTemplate(
    config?.email_template_body ?? 'Total: {{total}} €',
    vars,
  )

  const [toEmail, setToEmail] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [body, setBody] = useState(defaultBody)
  const [sending, setSending] = useState(false)

  const handleSend = async () => {
    if (!toEmail) return
    setSending(true)
    try {
      await api.post(
        `/workspaces/${presupuesto.workspace_id}/presupuestos/${presupuesto.id}/send-email`,
        { to_email: toEmail, custom_subject: subject, custom_body: body },
      )
      toast({ title: 'Email enviado correctamente' })
      onClose()
    } catch (err) {
      toast({
        title: 'Error al enviar email',
        description: getErrorMessage(err),
        variant: 'destructive',
      })
    } finally {
      setSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar presupuesto por email</DialogTitle>
          <DialogDescription>
            Presupuesto {presupuesto.numero} — {formatEUR(presupuesto.total)}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="to-email">Destinatario</Label>
            <Input
              id="to-email"
              type="email"
              placeholder="cliente@empresa.com"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-subject">Asunto</Label>
            <Input
              id="email-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="email-body">Cuerpo</Label>
            <Textarea
              id="email-body"
              rows={8}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              className="resize-none font-mono text-sm"
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Variables disponibles:{' '}
            <code className="bg-muted px-1 rounded">{'{{cliente}}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{{proyecto}}'}</code>{' '}
            <code className="bg-muted px-1 rounded">{'{{total}}'}</code>
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={sending}>
            Cancelar
          </Button>
          <Button onClick={handleSend} disabled={sending || !toEmail}>
            {sending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Send className="mr-2 h-4 w-4" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
