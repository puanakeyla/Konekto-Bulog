import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import logoKonekto from '../assets/logo-konekto.png'

// Nama role internal -> label ramah untuk ditampilkan di navbar.
const roleLabels: Record<string, string> = {
  admin: 'Administrator',
  jemput_pangan: 'Jemput Pangan',
  ub_jastasma: 'UB Jastasma',
  pengadaan: 'Pengadaan',
  keuangan: 'Keuangan',
  operasi: 'Operasi',
  gudang: 'Gudang',
  makloon: 'Makloon',
}

// Top bar global untuk seluruh halaman terproteksi (per-role).
// Gaya mengikuti header landing page: navy gelap, blur, aksen emas.
export default function AppNav() {
  const { user, logout } = useAuth()
  const roleLabel = user ? (roleLabels[user.role.nama_role] ?? user.role.nama_role.replaceAll('_', ' ')) : ''

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-primary-dark/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
        <Link to="/dashboard" className="flex items-center" aria-label="Ke dashboard">
          <img src={logoKonekto} alt="Konekto" className="h-7 w-auto" />
        </Link>

        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden text-right sm:block">
              <p className="text-xs font-semibold leading-tight text-white">{user.username}</p>
              <p className="text-[0.6875rem] capitalize leading-tight text-white/50">{roleLabel}</p>
            </div>
          )}
          <span aria-hidden className="hidden h-8 w-px bg-white/10 sm:block" />
          <button
            onClick={() => logout()}
            className="rounded-lg border border-white/15 bg-white/5 px-4 py-1.5 text-xs font-bold text-white transition-colors hover:border-accent hover:bg-accent hover:text-primary-dark"
          >
            Keluar
          </button>
        </div>
      </nav>
    </header>
  )
}
