import { Link } from 'react-router-dom'

/**
 * Tautan pulang ke dashboard.
 *
 * Dipakai dua tempat dengan latar berbeda: FormHero (pita navy, perlu teks terang) dan
 * halaman-halaman berlatar putih yang tidak memakai hero. Bentuk dan letaknya sengaja sama
 * di mana pun supaya pengguna tidak perlu menebak cara keluar dari sebuah halaman.
 */
export default function TautanDashboard({
  to = '/dashboard',
  label = 'Kembali ke dashboard',
  terang = false,
  className = '',
}: {
  to?: string
  label?: string
  /** true kalau dipasang di atas latar gelap (hero). */
  terang?: boolean
  className?: string
}) {
  const warna = terang ? 'text-white/70 hover:text-white' : 'text-slate-500 hover:text-primary'

  return (
    <Link to={to} className={`flex w-fit items-center gap-1.5 text-xs font-semibold transition-colors ${warna} ${className}`}>
      <span aria-hidden className="text-base leading-none">&larr;</span>
      {label}
    </Link>
  )
}
