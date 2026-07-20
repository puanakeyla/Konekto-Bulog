export type NavAction = { to: string; label: string }

// Sub-menu utama per role. Dipakai header global agar akses antar bab konsisten
// di semua halaman, bukan hanya muncul sebagai tombol besar di dashboard.
export function buildActions(role: string): NavAction[] {
  const actions: NavAction[] = []

  if (role === 'admin') {
    return [
      { to: '/admin/users', label: 'Kelola User' },
      { to: '/monitoring', label: 'Monitoring' },
      { to: '/rekap', label: 'Rekap Data' },
      { to: '/admin/audit-logs', label: 'Audit Log' },
    ]
  }

  if (role === 'jemput_pangan') actions.push({ to: '/transaksi/baru', label: 'Buat Transaksi' })
  if (role === 'makloon') actions.push({ to: '/transaksi/baru-mpp', label: 'Buat MPP' })

  if (['jemput_pangan', 'makloon', 'ub_jastasma', 'pengadaan', 'keuangan'].includes(role)) {
    actions.push({ to: '/rekap', label: 'Rekap Data' })
  }

  if (role === 'keuangan') actions.push({ to: '/keuangan', label: 'Pembayaran PO' })
  // Menu modul Pengolahan (ub_jastasma/operasi/pengadaan/gudang) ditambahkan di Task 9-11.

  return actions
}
