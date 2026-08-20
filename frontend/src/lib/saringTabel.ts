import type { ExportColumn } from './exportCsv'

/** Bagian SheetColumn yang dibutuhkan penyaring. DataSpreadsheet mengoper kolom lengkapnya. */
export type KolomSaring<T> = ExportColumn<T> & {
  /** Ikut dicari saat user mengetik di kotak pencarian. Default: ikut. */
  searchable?: boolean
}

/**
 * Pencarian bebas + filter per kolom untuk tabel DataSpreadsheet.
 *
 * Tinggal di sini, bukan di dalam komponen, karena dipakai DUA kali: untuk baris yang tampil di
 * layar, dan untuk himpunan penuh yang ditarik saat ekspor CSV. Kalau logikanya hidup di dalam
 * useMemo komponen, ekspor penuh akan menyaring dengan aturan yang berbeda dari yang sedang
 * dilihat pengguna -- dan bedanya tidak akan kelihatan sampai ada yang membandingkan berkas
 * hasil ekspor dengan layarnya.
 *
 * Aturannya: AND antar kolom filter, OR antar nilai dalam satu kolom, lalu pencarian bebas
 * yang cocok bila SALAH SATU kolom searchable memuat teksnya.
 */
export function saringTabel<T>(
  rows: T[],
  columns: KolomSaring<T>[],
  q: string,
  filters: Record<string, string[]>,
): T[] {
  const key = q.trim().toLowerCase()
  const cariCols = columns.filter((c) => c.searchable !== false)
  const aktif = Object.entries(filters).filter(([, v]) => v.length > 0)

  if (aktif.length === 0 && !key) return rows

  return rows.filter((row) => {
    for (const [colKey, dipilih] of aktif) {
      const col = columns.find((c) => c.key === colKey)
      // Filter atas kolom yang tidak ada diabaikan, bukan mengosongkan tabel: kolom bisa
      // berubah mengikuti role/skema sementara pilihan filter user tetap tersimpan.
      if (!col) continue
      if (!dipilih.includes(String(col.value(row) ?? ''))) return false
    }
    if (!key) return true
    return cariCols.some((c) => String(c.value(row) ?? '').toLowerCase().includes(key))
  })
}
