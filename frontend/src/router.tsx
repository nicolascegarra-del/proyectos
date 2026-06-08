import {
  createRootRoute,
  createRoute,
  createRouter,
  redirect,
  Outlet,
} from '@tanstack/react-router'
import { useAuthStore } from './store/authStore'

import AppLayout from './components/layout/AppLayout'
import LoginPage from './pages/auth/LoginPage'
import RegisterPage from './pages/auth/RegisterPage'
import ForgotPasswordPage from './pages/auth/ForgotPasswordPage'
import ResetPasswordPage from './pages/auth/ResetPasswordPage'
import DashboardPage from './pages/dashboard/DashboardPage'
import WorkspacesPage from './pages/workspaces/WorkspacesPage'
import ProyectosPage from './pages/proyectos/ProyectosPage'
import ProyectoDetailPage from './pages/proyectos/ProyectoDetailPage'
import ClientesPage from './pages/clientes/ClientesPage'
import EtiquetasPage from './pages/etiquetas/EtiquetasPage'
import NotasPage from './pages/notas/NotasPage'
import PresupuestosPage from './pages/presupuestos/PresupuestosPage'
import PresupuestoDetailPage from './pages/presupuestos/PresupuestoDetailPage'
import ConfiguracionPage from './pages/configuracion/ConfiguracionPage'
import SuperadminPage from './pages/superadmin/SuperadminPage'
import PublicProjectPage from './pages/public/PublicProjectPage'
import InviteAcceptPage from './pages/workspaces/InviteAcceptPage'

const rootRoute = createRootRoute({ component: Outlet })

const authLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'auth',
  component: () => (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Outlet />
    </div>
  ),
})

const appLayoutRoute = createRoute({
  getParentRoute: () => rootRoute,
  id: 'app',
  beforeLoad: () => {
    const token = localStorage.getItem('access_token')
    if (!token) throw redirect({ to: '/login' })
  },
  component: AppLayout,
})

const loginRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/login',
  component: LoginPage,
})

const registerRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/registro',
  component: RegisterPage,
})

const forgotPasswordRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/forgot-password',
  component: ForgotPasswordPage,
})

const resetPasswordRoute = createRoute({
  getParentRoute: () => authLayoutRoute,
  path: '/reset-password',
  component: ResetPasswordPage,
})

const publicProjectRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/p/$publicUuid',
  component: PublicProjectPage,
})

const inviteRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/invites/$token',
  component: InviteAcceptPage,
})

const dashboardRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/',
  component: DashboardPage,
})

const workspacesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/workspaces',
  component: WorkspacesPage,
})

const proyectosRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/proyectos',
  component: ProyectosPage,
})

const proyectoDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/proyectos/$proyectoId',
  component: ProyectoDetailPage,
})

const clientesRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/clientes',
  component: ClientesPage,
})

const etiquetasRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/etiquetas',
  component: EtiquetasPage,
})

const notasRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/notas',
  component: NotasPage,
})

const presupuestosRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/presupuestos',
  component: PresupuestosPage,
})

const presupuestoDetailRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/presupuestos/$presupuestoId',
  component: PresupuestoDetailPage,
})

const configuracionRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/configuracion',
  component: ConfiguracionPage,
})

const superadminRoute = createRoute({
  getParentRoute: () => appLayoutRoute,
  path: '/superadmin',
  component: SuperadminPage,
  beforeLoad: () => {
    const user = useAuthStore.getState().user
    if (!user?.is_superadmin) throw redirect({ to: '/' })
  },
})

const notFoundRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '$',
  component: () => (
    <div className="min-h-screen flex items-center justify-center flex-col gap-4 bg-background">
      <h1 className="text-2xl font-bold">404 - Página no encontrada</h1>
      <a href="/" className="text-primary underline">Volver al inicio</a>
    </div>
  ),
})

const routeTree = rootRoute.addChildren([
  authLayoutRoute.addChildren([
    loginRoute,
    registerRoute,
    forgotPasswordRoute,
    resetPasswordRoute,
  ]),
  appLayoutRoute.addChildren([
    dashboardRoute,
    workspacesRoute,
    proyectosRoute,
    proyectoDetailRoute,
    clientesRoute,
    etiquetasRoute,
    notasRoute,
    presupuestosRoute,
    presupuestoDetailRoute,
    configuracionRoute,
    superadminRoute,
  ]),
  publicProjectRoute,
  inviteRoute,
  notFoundRoute,
])

export const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
