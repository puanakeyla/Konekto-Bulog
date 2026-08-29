/**
 * Nama yang ditampilkan untuk seorang user. Mitra makloon dikenal lewat nama perusahaannya
 * (mis. "PT. JAYA MANUNGGAL PANGAN") -- username hanya kredensial login, bukan identitas yang
 * dipakai orang saat bicara soal transaksi. Role lain memang tidak punya nama lain, jadi tetap
 * memakai username.
 *
 * Akun gudang TIDAK lagi punya nama sendiri: gudang A/B/C/D kini data master (tabel `gudang`),
 * dan yang login cuma satu akun gudang pusat.
 */
export function namaTampilan(user: { username: string; nama_maklon?: string | null } | null | undefined): string {
  if (!user) return ''
  return user.nama_maklon?.trim() || user.username
}
