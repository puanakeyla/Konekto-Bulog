export type NavAction = { to: string; label: string }

// Role yang bermain di rantai Pengolahan (GDG/UBJ). Makloon sengaja tidak termasuk --
// alur pengolahan adalah urusan internal BULOG.
const ROLE_PENGOLAHAN = ['gudang', 'ub_jastasma', 'operasi', 'pengadaan']

// Sub-menu utama per role. Dipakai header global agar akses antar bab konsisten
// di semua halaman, bukan hanya muncul sebagai tombol besar di dashboard.
//
// Dua menu rekap SELALU berdampingan di ujung kanan, apa pun rolenya: letaknya jadi sama di
// semua akun sehingga tidak perlu dicari ulang tiap ganti login.
export function buildActions(role: string): NavAction[] {
  // Admin tidak punya menu Pengolahan & MO: mengerjakan alurnya bukan pekerjaan admin
  // (backend pun sudah mencabut haknya, lihat routes/api.php). Yang tersisa untuk admin
  // adalah membaca & memperbaiki lewat Rekap Pengolahan.
  if (role === 'admin') {
    return [
      { to: '/admin/users', label: 'Kelola User' },
      { to: '/admin/gudang', label: 'Master Gudang' },
      { to: '/monitoring', label: 'Monitoring' },
      { to: '/admin/audit-logs', label: 'Audit Log' },
      { to: '/rekap', label: 'Rekap Sergab' },
      { to: '/rekap-pengolahan', label: 'Rekap Pengolahan' },
    ]
  }

  const actions: NavAction[] = []
  const rekap: NavAction[] = []
  const push = (list: NavAction[], action: NavAction) => {
    if (!list.some((item) => item.to === action.to)) list.push(action)
  }

  if (role === 'jemput_pangan') push(actions, { to: '/transaksi/baru', label: 'Buat Transaksi' })
  if (role === 'makloon') push(actions, { to: '/transaksi/baru-mpp', label: 'Buat MPP' })

  if (['jemput_pangan', 'makloon', 'ub_jastasma', 'pengadaan', 'keuangan'].includes(role)) {
    push(rekap, { to: '/rekap', label: 'Rekap Sergab' })
  }

  // Rekap Sergab TIDAK ditambahkan di sini: Gudang & Operasi tidak punya tahap di alur SerGab,
  // jadi rekapnya selalu kosong buat mereka. ub_jastasma & pengadaan tetap dapat lewat blok di atas.
  if (ROLE_PENGOLAHAN.includes(role)) {
    push(actions, { to: '/pengolahan', label: 'Pengolahan' })
    // Baca-saja: mereka memilih gudang saat mengisi, jadi perlu bisa melihat daftarnya
    // tanpa harus menunggu form terbuka. Yang mengubah isinya tetap Admin.
    push(actions, { to: '/gudang', label: 'Daftar Gudang' })
    push(rekap, { to: '/rekap-pengolahan', label: 'Rekap Pengolahan' })
  }

  return [...actions, ...rekap]
}
