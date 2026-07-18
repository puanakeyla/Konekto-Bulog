import { BrowserRouter, Navigate, Route, Routes, useParams } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from './hooks/useAuth'
import LoginPage from './pages/LoginPage'
import LandingPage from './pages/LandingPage'
import AppLayout from './components/AppLayout'
import DashboardPage from './pages/DashboardPage'
import TransaksiJemputPanganPage from './pages/TransaksiJemputPanganPage'
import TransaksiDetailPage from './pages/TransaksiDetailPage'
import TransaksiMakloonBaruPage from './pages/TransaksiMakloonBaruPage'
import PengadaanPage from './pages/PengadaanPage'
import KeuanganPage from './pages/KeuanganPage'
import OperasiPage from './pages/OperasiPage'
import OperasiRekapPage from './pages/OperasiRekapPage'
import GudangPage from './pages/GudangPage'
import GudangRekapPage from './pages/GudangRekapPage'
import AdminMakloonPage from './pages/AdminMakloonPage'
import AdminUsersPage from './pages/AdminUsersPage'
import MonitoringPage from './pages/MonitoringPage'
import RekapTransaksiPage from './pages/RekapTransaksiPage'
import AdminAuditLogPage from './pages/AdminAuditLogPage'

const queryClient = new QueryClient()

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth()

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />

  return <>{children}</>
}

function RedirectToTransaksiDetail() {
  const { id } = useParams<{ id: string }>()
  return <Navigate to={`/transaksi/${encodeURIComponent(id ?? '')}`} replace />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<LandingPage />} />
      <Route
        element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/transaksi/baru" element={<TransaksiJemputPanganPage />} />
        <Route path="/transaksi/:id" element={<TransaksiDetailPage />} />
        <Route path="/transaksi/:id/ub-jastasma" element={<RedirectToTransaksiDetail />} />
        <Route path="/transaksi/:id/makloon" element={<RedirectToTransaksiDetail />} />
        <Route path="/transaksi/baru-mpp" element={<TransaksiMakloonBaruPage />} />
        <Route path="/pengadaan" element={<PengadaanPage />} />
        <Route path="/keuangan" element={<KeuanganPage />} />
        <Route path="/operasi" element={<OperasiPage />} />
        <Route path="/operasi/rekap" element={<OperasiRekapPage />} />
        <Route path="/gudang" element={<GudangPage />} />
        <Route path="/gudang/rekap" element={<GudangRekapPage />} />
        <Route path="/admin/makloon" element={<AdminMakloonPage />} />
        <Route path="/admin/users" element={<AdminUsersPage />} />
        <Route path="/admin/audit-logs" element={<AdminAuditLogPage />} />
        <Route path="/monitoring" element={<MonitoringPage />} />
        <Route path="/rekap" element={<RekapTransaksiPage />} />
      </Route>
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
        {/* Tema toast disesuaikan token SerGab Lampung (lihat .toast-sergab-* di index.css) */}
        <Toaster
          position="top-right"
          toastOptions={{ classNames: { success: 'toast-sergab-success', error: 'toast-sergab-error' } }}
        />
      </AuthProvider>
    </QueryClientProvider>
  )
}
