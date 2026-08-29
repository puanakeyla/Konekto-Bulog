// Taksiran gabah di balik beras HGL fisik yang masuk gudang. Dipisah supaya angka acuannya
// hidup di SATU tempat: form Gudang, Rekap Pengolahan, dan neraca admin harus sepakat.
//
// Padanan sisi server: PengolahanGudang::RENDEMEN_ESTIMASI. Keduanya WAJIB sama, dan
// estimasiGabah.test.ts gagal kalau salah satu diubah sendirian -- angkanya tidak bisa ditarik
// dari API karena form Gudang menghitungnya sambil diketik, sebelum ada yang tersimpan.

/** Rendemen acuan: berapa persen gabah yang jadi beras HGL. */
export const RENDEMEN_ESTIMASI = 0.51

/**
 * Estimasi gabah (kg) = kuantum HGL ÷ 51%, DIBULATKAN ke kilogram utuh.
 *
 * Pembulatannya di sini, bukan di tiap pemakai, supaya penjumlahan selalu benar: neraca admin
 * menjumlah estimasi per makloon sementara Rekap Pengolahan menampilkannya per pengolahan --
 * kalau keduanya membulatkan di titik yang berbeda, kolom yang dijumlah tangan tidak akan pernah
 * ketemu dengan totalnya. Sisi server membulatkan pada titik yang sama, per baris sebelum SUM().
 *
 * Taksiran, bukan timbangan -- tidak pernah disimpan ke kolom mana pun.
 */
export function estimasiGabah(kuantumHgl: number | string | null | undefined): number {
  const hgl = Number(kuantumHgl)
  return Number.isFinite(hgl) ? Math.round(hgl / RENDEMEN_ESTIMASI) : 0
}
