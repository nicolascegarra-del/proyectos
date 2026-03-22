import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { api, getErrorMessage } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Loader2, ArrowLeft, CheckCircle } from 'lucide-react'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/forgot-password', { email })
      setSent(true)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <div className="w-full max-w-sm space-y-6 text-center">
        <CheckCircle className="h-12 w-12 text-green-400 mx-auto" />
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Email enviado</h2>
          <p className="text-sm text-muted-foreground">
            Si existe una cuenta con ese email, recibirás un enlace para
            restablecer tu contraseña. Revisa también tu carpeta de spam.
          </p>
        </div>
        <Link to="/login">
          <Button variant="outline" className="w-full h-11">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver al inicio de sesión
          </Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1">
        <Link
          to="/login"
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" />
          Volver
        </Link>
        <h1 className="text-2xl font-bold tracking-tight">¿Olvidaste tu contraseña?</h1>
        <p className="text-sm text-muted-foreground">
          Escribe tu email y te enviamos un enlace para recuperarla.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            placeholder="tu@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>

        {error && (
          <p className="text-sm text-destructive bg-destructive/10 px-3 py-2 rounded-md">
            {error}
          </p>
        )}

        <Button type="submit" className="w-full h-11" disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Enviar enlace de recuperación
        </Button>
      </form>
    </div>
  )
}
