import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { buildActions } from '../lib/navActions'
import logoSergab from '../assets/logo-sergab.png'

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
  const actions = user ? buildActions(user.role.nama_role) : []

  return (
    <header className="sticky top-0 z-30 border-b border-white/10 bg-primary-dark/90 backdrop-blur-md">
      <nav className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
        <Link to="/dashboard" className="flex shrink-0 items-center" aria-label="Ke dashboard">
          <img src={logoSergab} alt="SerGab Lampung" className="h-7 w-auto" />
        </Link>

        {actions.length > 0 && (
          <div className="hidden min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pl-8 xl:pl-12 lg:flex">
            {actions.map((action) => (
              <NavLink
                key={action.to}
                to={action.to}
                end={action.to === '/operasi' || action.to === '/gudang'}
                className={({ isActive }) =>
                  'inline-flex h-8 shrink-0 items-center rounded-md px-3 text-[0.72rem] font-bold leading-none transition-colors ' +
                  (isActive
                    ? 'bg-accent text-primary-dark shadow-sm'
                    : 'border border-white/10 bg-white/[0.04] text-white/75 hover:border-accent/70 hover:bg-white/10 hover:text-white')
                }
              >
                {action.label}
              </NavLink>
            ))}
          </div>
        )}

        <div className="ml-auto flex shrink-0 items-center gap-3">
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

      {actions.length > 0 && (
        <div className="border-t border-white/10 px-4 py-2 lg:hidden">
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
            {actions.map((action) => (
              <NavLink
                key={action.to}
                to={action.to}
                end={action.to === '/operasi' || action.to === '/gudang'}
                className={({ isActive }) =>
                  'inline-flex h-8 shrink-0 items-center rounded-md px-3 text-xs font-bold ' +
                  (isActive ? 'bg-accent text-primary-dark' : 'border border-white/10 bg-white/[0.04] text-white/75')
                }
              >
                {action.label}
              </NavLink>
            ))}
          </div>
        </div>
      )}
    </header>
  )
}
