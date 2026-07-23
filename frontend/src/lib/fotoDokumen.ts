// Peta label & urutan tampil foto dokumen, dipakai bersama oleh galeri dokumen Rekap.
// Nama jenis_foto mengikuti collection_name Spatie MediaLibrary di backend.

export const FOTO_LABELS: Record<string, string> = {
  foto_petani: 'Foto Petani',
  foto_gabah: 'Foto Gabah',
  foto_serah_terima: 'Foto Serah Terima',
  foto_kwitansi: 'Foto Kwitansi',
  foto_pembayaran: 'Foto Pembayaran',
  foto_surat_pernyataan: 'Foto Surat Pernyataan',
  foto_surat_jalan: 'Foto Surat Jalan',
  foto_surat_jalan_paraf: 'Surat Jalan Diparaf',
  foto_nota_timbang: 'Foto Nota Timbang',
  foto_lhpk_hpk: 'Foto LHPK/HPK',
}

export function labelFoto(jenis: string): string {
  return FOTO_LABELS[jenis] ?? jenis.replaceAll('_', ' ')
}

// Role pemilik foto -> label ramah untuk badge.
const ROLE_LABELS: Record<string, string> = {
  jemput_pangan: 'Jemput Pangan',
  makloon: 'Makloon',
  ub_jastasma: 'UB Jastasma',
}

export function labelRoleFoto(role: string): string {
  return ROLE_LABELS[role] ?? role.replaceAll('_', ' ')
}
