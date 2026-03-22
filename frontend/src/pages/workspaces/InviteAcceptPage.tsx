import { useEffect, useState } from 'react'
import { useParams, useNavigate } from '@tanstack/react-router'
import { api, getErrorMessage } from '@/lib/api'
import { useAuthStore } from '@/store/authStore'
import { useWorkspaceStore } from '@/store/workspaceStore'
import { Button } from '@/components/ui/button'
import { Loader2, CheckCircle2, XCircle } from 'lucide-react'

export default function InviteAcceptPage() {
  const { token } = useParams({ strict: false }) as { token: string }
  const navigate = useNavigate()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated())
  const fetchWorkspaces = useWorkspaceStore((s) => s.fetchWorkspaces)
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading')
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    if (!isAuthenticated) {
      navigate({ to: '/login', search: { redirect: `/invites/${token}` } })
      return
    }
    api
      .post(`/workspaces/invites/${token}/accept`)
      .then(() => {
        fetchWorkspaces()
        setStatus('success')
      })
      .catch((err) => {
        setErrorMsg(getErrorMessage(err))
        setStatus('error')
      })
  }, [token])

  if (status === 'loading') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Procesando invitación…</p>
      </div>
    )
  }

  if (status === 'success') {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
        <CheckCircle2 className="h-12 w-12 text-green-500" />
        <div>
          <p className="text-lg font-semibold">¡Invitación aceptada!</p>
          <p className="text-sm text-muted-foreground mt-1">Ya eres miembro del workspace.</p>
        </div>
        <Button onClick={() => navigate({ to: '/' })}>Ir al dashboard</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center h-64 gap-4 text-center">
      <XCircle className="h-12 w-12 text-destructive" />
      <div>
        <p className="text-lg font-semibold">Error al aceptar</p>
        <p className="text-sm text-muted-foreground mt-1">{errorMsg}</p>
      </div>
      <Button variant="outline" onClick={() => navigate({ to: '/' })}>Ir al inicio</Button>
    </div>
  )
}
