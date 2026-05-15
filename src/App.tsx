import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './contexts/AuthProvider'
import { useAuth } from './contexts/useAuth'
import { useLoadingUiMountLog } from './lib/loadingUiMountLog'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'

function AppFullScreenLoading({ where }: { where: string }) {
  useLoadingUiMountLog(where)
  return (
    <div className="app-loading" role="status">
      불러오는 중…
    </div>
  )
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <AppFullScreenLoading where="App · PrivateRoute(/) · auth.loading===true" />
    )
  }
  if (!session) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicOnly({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth()

  if (loading) {
    return (
      <AppFullScreenLoading where="App · PublicOnly(/login) · auth.loading===true" />
    )
  }
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              <PublicOnly>
                <LoginPage />
              </PublicOnly>
            }
          />
          <Route
            path="/"
            element={
              <PrivateRoute>
                <HomePage />
              </PrivateRoute>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
