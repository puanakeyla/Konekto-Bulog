/**
 * Nama yang ditampilkan untuk seorang user. Mitra makloon dikenal lewat nama perusahaannya
 * (mis. "PT. JAYA MANUNGGAL PANGAN"), gudang lewat nama gudangnya -- username hanya kredensial
 * login, bukan identitas yang dipakai orang saat bicara soal transaksi. Role lain memang tidak
 * punya nama lain, jadi tetap memakai username.
 */
export function namaTampilan(user: { username: string; nama_maklon?: string | null; nama_gudang?: string | null } | null | undefined): string {
  if (!user) return ''
  return user.nama_maklon?.trim() || user.nama_gudang?.trim() || user.username
}
