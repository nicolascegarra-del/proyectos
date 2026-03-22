import { useEffect, useState } from 'react'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { api, getErrorMessage } from '@/lib/api'
import type { Configuracion, SMTPConfig } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { AlertDialog } from '@/components/ui/alert-dialog'
import { Loader2, Save, Send, Trash2 } from 'lucide-react'
import { toast } from '@/components/ui/use-toast'

export default function ConfiguracionPage() {
  const currentWorkspace = useWorkspaceStore((s) => s.currentWorkspace)

  const [config, setConfig] = useState<Configuracion | null>(null)
  const [smtp, setSmtp] = useState<SMTPConfig | null>(null)
  const [loadingConfig, setLoadingConfig] = useState(true)
  const [loadingSmtp, setLoadingSmtp] = useState(true)
  const [savingConfig, setSavingConfig] = useState(false)
  const [savingSmtp, setSavingSmtp] = useState(false)
  const [testingSmtp, setTestingSmtp] = useState(false)
  const [confirmDeleteSmtp, setConfirmDeleteSmtp] = useState(false)

  const [configForm, setConfigForm] = useState({
    webhook_url: '',
    email_template_subject: '',
    email_template_body: '',
  })

  const [smtpForm, setSmtpForm] = useState({
    host: '',
    port: '587',
    username: '',
    password: '',
    from_email: '',
    from_name: '',
    use_tls: true,
    use_ssl: false,
  })

  const [testEmail, setTestEmail] = useState('')

  useEffect(() => {
    if (!currentWorkspace) return
    setLoadingConfig(true)
    api
      .get<Configuracion>(`/workspaces/${currentWorkspace.id}/configuracion`)
      .then(({ data }) => {
        setConfig(data)
        setConfigForm({
          webhook_url: data.webhook_url ?? '',
          email_template_subject: data.email_template_subject ?? '',
          email_template_body: data.email_template_body ?? '',
        })
      })
      .catch((err) => toast({ title: getErrorMessage(err), variant: 'destructive' }))
      .finally(() => setLoadingConfig(false))

    setLoadingSmtp(true)
    api
      .get<SMTPConfig>('/smtp')
      .then(({ data }) => {
        setSmtp(data)
        setSmtpForm({
          host: data.host,
          port: data.port.toString(),
          username: data.username,
          password: '',
          from_email: data.from_email,
          from_name: data.from_name ?? '',
          use_tls: data.use_tls,
          use_ssl: data.use_ssl,
        })
      })
      .catch((err) => {
        const status = err?.response?.status
        if (status !== 404) toast({ title: getErrorMessage(err), variant: 'destructive' })
      })
      .finally(() => setLoadingSmtp(false))
  }, [currentWorkspace?.id])

  const handleSaveConfig = async () => {
    if (!currentWorkspace) return
    setSavingConfig(true)
    try {
      const { data } = await api.put<Configuracion>(
        `/workspaces/${currentWorkspace.id}/configuracion`,
        {
          webhook_url: configForm.webhook_url || null,
          email_template_subject: configForm.email_template_subject || null,
          email_template_body: configForm.email_template_body || null,
        },
      )
      setConfig(data)
      toast({ title: 'Configuración guardada' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSavingConfig(false)
    }
  }

  const handleSaveSmtp = async () => {
    if (!smtpForm.host || !smtpForm.username || !smtpForm.from_email) return
    setSavingSmtp(true)
    try {
      const payload = {
        host: smtpForm.host,
        port: parseInt(smtpForm.port) || 587,
        username: smtpForm.username,
        password: smtpForm.password || undefined,
        from_email: smtpForm.from_email,
        from_name: smtpForm.from_name || null,
        use_tls: smtpForm.use_tls,
        use_ssl: smtpForm.use_ssl,
      }
      if (smtp) {
        const { data } = await api.put<SMTPConfig>('/smtp', payload)
        setSmtp(data)
      } else {
        const { data } = await api.post<SMTPConfig>('/smtp', payload)
        setSmtp(data)
      }
      toast({ title: 'SMTP guardado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setSavingSmtp(false)
    }
  }

  const handleDeleteSmtp = async () => {
    try {
      await api.delete('/smtp')
      setSmtp(null)
      setSmtpForm({
        host: '', port: '587', username: '', password: '',
        from_email: '', from_name: '', use_tls: true, use_ssl: false,
      })
      toast({ title: 'SMTP eliminado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    }
  }

  const handleTestSmtp = async () => {
    if (!testEmail) return
    setTestingSmtp(true)
    try {
      await api.post('/smtp/test', { to: testEmail })
      toast({ title: 'Email de prueba enviado' })
    } catch (err) {
      toast({ title: getErrorMessage(err), variant: 'destructive' })
    } finally {
      setTestingSmtp(false)
    }
  }

  if (loadingConfig) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <h1 className="text-xl font-semibold">Configuración</h1>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Workspace
        </h2>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Webhook URL</Label>
            <Input
              value={configForm.webhook_url}
              onChange={(e) => setConfigForm((f) => ({ ...f, webhook_url: e.target.value }))}
              placeholder="https://hooks.ejemplo.com/..."
            />
            <p className="text-xs text-muted-foreground">
              Se llamará al aceptar un presupuesto o marcar una tarea como cobrada.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Asunto del email (presupuesto)</Label>
            <Input
              value={configForm.email_template_subject}
              onChange={(e) => setConfigForm((f) => ({ ...f, email_template_subject: e.target.value }))}
              placeholder="Presupuesto {{numero}} de {{proyecto}}"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Cuerpo del email</Label>
            <Textarea
              rows={6}
              value={configForm.email_template_body}
              onChange={(e) => setConfigForm((f) => ({ ...f, email_template_body: e.target.value }))}
              placeholder="Hola {{cliente}},&#10;&#10;Adjunto el presupuesto por {{total}}.&#10;&#10;Variables: {{cliente}}, {{proyecto}}, {{total}}, {{numero}}"
            />
            <p className="text-xs text-muted-foreground">
              Variables: <code>{'{{cliente}}'}</code>, <code>{'{{proyecto}}'}</code>, <code>{'{{total}}'}</code>, <code>{'{{numero}}'}</code>
            </p>
          </div>
          <Button onClick={handleSaveConfig} disabled={savingConfig} size="sm">
            {savingConfig ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Guardar
          </Button>
        </div>
      </section>

      <hr className="border-border" />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            SMTP
          </h2>
          {smtp && (
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setConfirmDeleteSmtp(true)}>
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Eliminar
            </Button>
          )}
        </div>

        {loadingSmtp ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Host</Label>
                <Input
                  value={smtpForm.host}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, host: e.target.value }))}
                  placeholder="smtp.gmail.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Puerto</Label>
                <Input
                  type="number"
                  value={smtpForm.port}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, port: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Usuario</Label>
              <Input
                value={smtpForm.username}
                onChange={(e) => setSmtpForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="tu@email.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{smtp ? 'Contraseña (dejar vacío para no cambiar)' : 'Contraseña'}</Label>
              <Input
                type="password"
                value={smtpForm.password}
                onChange={(e) => setSmtpForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>From email</Label>
                <Input
                  value={smtpForm.from_email}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, from_email: e.target.value }))}
                  placeholder="noreply@tudominio.com"
                />
              </div>
              <div className="space-y-1.5">
                <Label>From nombre</Label>
                <Input
                  value={smtpForm.from_name}
                  onChange={(e) => setSmtpForm((f) => ({ ...f, from_name: e.target.value }))}
                  placeholder="Tu Empresa"
                />
              </div>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch
                  checked={smtpForm.use_tls}
                  onCheckedChange={(v) => setSmtpForm((f) => ({ ...f, use_tls: v, use_ssl: v ? false : f.use_ssl }))}
                />
                <Label>TLS</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch
                  checked={smtpForm.use_ssl}
                  onCheckedChange={(v) => setSmtpForm((f) => ({ ...f, use_ssl: v, use_tls: v ? false : f.use_tls }))}
                />
                <Label>SSL</Label>
              </div>
            </div>
            <Button
              onClick={handleSaveSmtp}
              disabled={savingSmtp || !smtpForm.host || !smtpForm.username || !smtpForm.from_email}
              size="sm"
            >
              {savingSmtp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {smtp ? 'Actualizar SMTP' : 'Guardar SMTP'}
            </Button>
          </div>
        )}

        {smtp && (
          <div className="pt-2 space-y-2">
            <Label className="text-xs text-muted-foreground">Probar configuración</Label>
            <div className="flex gap-2">
              <Input
                type="email"
                placeholder="Enviar email de prueba a..."
                value={testEmail}
                onChange={(e) => setTestEmail(e.target.value)}
                className="flex-1"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleTestSmtp}
                disabled={testingSmtp || !testEmail}
              >
                {testingSmtp ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        )}
      </section>

      <AlertDialog
        open={confirmDeleteSmtp}
        onOpenChange={setConfirmDeleteSmtp}
        title="Eliminar configuración SMTP"
        description="¿Eliminar la configuración SMTP? Se desactivará el envío de emails."
        confirmLabel="Eliminar"
        onConfirm={handleDeleteSmtp}
      />
    </div>
  )
}
