// Matematika baris TOTAL tabel Neraca Gabah per Makloon. Dipisah dari komponennya supaya bisa
// diuji tanpa merender apa pun -- ini angka laporan yang dibaca orang untuk mengambil keputusan.

import type { BarisRekapMakloon } from '../hooks/useRekapMakloon'

/**
 * Kolom yang boleh dijumlah apa adanya. Dua kolom persen (rendemen & persentase_olah) SENGAJA
 * tidak ada di sini: keduanya dihitung ulang dari hasil penjumlahan, lihat hitungTotalNeraca().
 */
export const KOLOM_DIJUMLAH = [
  'gabah_diterima',
  'gabah_sudah_in',
  'gabah_belum_in',
  'gabah_spp',
  'gabah_belum_spp',
  'olah_rekap',
  'belum_adm_belum_olah',
  'olah_selesai',
  'stok_real',
  'hgl',
  'broken',
  'menir',
  'katul',
  'reject',
  'hgl_operasi',
  'hgl_belum_adm',
] as const satisfies readonly (keyof BarisRekapMakloon)[]

export type TotalNeraca = Record<string, number>

/** Dibulatkan 2 desimal, sama seperti yang dilakukan server untuk baris per-makloon. */
function persen(pembilang: number, penyebut: number) {
  return penyebut > 0 ? Math.round((pembilang / penyebut) * 10000) / 100 : 0
}

/**
 * Total dari baris yang SEDANG TAMPIL (mengikuti pencarian & filter).
 *
 * Kolom persen dihitung ULANG dari totalnya, BUKAN dirata-rata: merata-ratakan persen memberi
 * bobot sama pada mitra 1 ton dan mitra 100 ton, sehingga totalnya menyimpang dari kenyataan.
 * Aturan yang sama dipakai MonitoringController::ringkasanPengolahan untuk rendemen gabungan.
 */
export function hitungTotalNeraca(rows: BarisRekapMakloon[]): TotalNeraca {
  const total: TotalNeraca = Object.fromEntries(KOLOM_DIJUMLAH.map((key) => [key, 0]))

  for (const row of rows) {
    for (const key of KOLOM_DIJUMLAH) total[key] += Number(row[key]) || 0
  }

  total.rendemen = persen(total.hgl, total.olah_selesai)
  total.persentase_olah = persen(total.olah_selesai, total.gabah_sudah_in)

  return total
}
