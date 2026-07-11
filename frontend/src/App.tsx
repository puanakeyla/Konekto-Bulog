import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import TransaksiJemputPanganPage from './pages/TransaksiJemputPanganPage'
import TransaksiDetailPage from './pages/TransaksiDetailPage'
import TransaksiUbJastasmaPage from './pages/TransaksiUbJastasmaPage'
import TransaksiMakloonPage from './pages/TransaksiMakloonPage'
import TransaksiMakloonBaruPage from './pages/TransaksiMakloonBaruPage'
import PengadaanPage from './pages/PengadaanPage'
import KeuanganPage from './pages/KeuanganPage'
import OperasiPage from './pages/OperasiPage'
import GudangPage from './pages/GudangPage'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />

  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <DashboardPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transaksi/baru"
        element={
          <ProtectedRoute>
            <TransaksiJemputPanganPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transaksi/:id"
        element={
          <ProtectedRoute>
            <TransaksiDetailPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transaksi/:id/ub-jastasma"
        element={
          <ProtectedRoute>
            <TransaksiUbJastasmaPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transaksi/:id/makloon"
        element={
          <ProtectedRoute>
            <TransaksiMakloonPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/transaksi/baru-mpp"
        element={
          <ProtectedRoute>
            <TransaksiMakloonBaruPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/pengadaan"
        element={
          <ProtectedRoute>
            <PengadaanPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/keuangan"
        element={
          <ProtectedRoute>
            <KeuanganPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/operasi"
        element={
          <ProtectedRoute>
            <OperasiPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/gudang"
        element={
          <ProtectedRoute>
            <GudangPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
