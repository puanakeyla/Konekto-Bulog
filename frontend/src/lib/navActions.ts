export type NavAction = { to: string; label: string }

// Role yang bermain di rantai Pengolahan (GDG/UBJ). Makloon sengaja tidak termasuk --
// alur pengolahan adalah urusan internal BULOG.
const ROLE_PENGOLAHAN = ['gudang', 'ub_jastasma', 'operasi', 'pengadaan']

// Sub-menu utama per role. Dipakai header global agar akses antar bab konsisten
// di semua halaman, bukan hanya muncul sebagai tombol besar di dashboard.
export function buildActions(role: string): NavAction[] {
  const actions: NavAction[] = []

  if (role === 'admin') {
    return [
      { to: '/admin/users', label: 'Kelola User' },
      { to: '/admin/gudang', label: 'Master Gudang' },
      { to: '/monitoring', label: 'Monitoring' },
      { to: '/rekap', label: 'Rekap Data' },
      { to: '/pengolahan', label: 'Pengolahan' },
      { to: '/mo', label: 'MO' },
      { to: '/rekap-pengolahan', label: 'Rekap Pengolahan' },
      { to: '/admin/audit-logs', label: 'Audit Log' },
    ]
  }

  if (role === 'jemput_pangan') actions.push({ to: '/transaksi/baru', label: 'Buat Transaksi' })
  if (role === 'makloon') actions.push({ to: '/transaksi/baru-mpp', label: 'Buat MPP' })

  if (['jemput_pangan', 'makloon', 'ub_jastasma', 'pengadaan', 'keuangan'].includes(role)) {
    actions.push({ to: '/rekap', label: 'Rekap Data' })
  }

  if (ROLE_PENGOLAHAN.includes(role)) {
    actions.push(
      { to: '/pengolahan', label: 'Pengolahan' },
      { to: '/mo', label: 'MO' },
      { to: '/rekap-pengolahan', label: 'Rekap Pengolahan' },
    )
  }

  return actions
}
