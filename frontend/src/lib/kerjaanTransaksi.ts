import type { TransaksiListItem } from '../hooks/useTransaksiList'
import type { RekapTransaksi } from '../hooks/useRekapTransaksi'

/**
 * "Transaksi menunggu tindakan" adalah ANTREAN KERJA, bukan daftar status. Endpoint
 * /api/transaksi sudah menyaring ke `current_stage` milik role DAN `status_keseluruhan =
 * 'berjalan'` (TransaksiController@index), jadi transaksi selesai/dibatalkan tidak pernah
 * sampai ke sana. Yang perlu dijawab kolom status bukan "statusnya apa" melainkan "saya harus
 * ngapain" -- karena itu kategorinya kerjaan, dan hanya ada empat.
 *
 * Catatan alur (TransaksiStageService): `current_stage` maju saat SUBMIT, bukan saat diterima.
 * Jadi satu transaksi singgah di antrean sebuah role dua kali -- sekali menunggu diperiksa
 * (data tahap sebelumnya `menunggu_review`), lalu setelah diterima ia bertahan menunggu role
 * itu mengisi datanya sendiri. Begitu dikirim, transaksi keluar dari antrean.
 */
export type KerjaanId = 'periksa' | 'isi' | 'draft' | 'ditolak'

/**
 * Satu badge = satu chip, tanpa kecuali. Draft sempat disembunyikan di balik chip "Perlu diisi"
 * sehingga angka chip tidak cocok dengan badge yang terlihat di tabel -- jangan diulang.
 */
export const KERJAAN_LABEL: Record<KerjaanId, string> = {
  periksa: 'Perlu dicek',
  isi: 'Perlu diisi',
  draft: 'Draft belum dikirim',
  ditolak: 'Perlu diperbaiki',
}

/** Kalimat di bawah chip aktif, supaya tidak perlu hover tooltip untuk tahu harus apa. */
export const KERJAAN_KETERANGAN: Record<KerjaanId, string> = {
  periksa: 'Buka transaksinya, cek data dari tahap sebelumnya, lalu tekan Terima atau Tolak.',
  isi: 'Lengkapi data tahap Anda, lalu kirim ke tahap berikutnya.',
  draft: 'Data sudah tersimpan tapi belum dikirim. Buka lalu tekan Kirim.',
  ditolak: 'Ditolak oleh tahap berikutnya. Perbaiki datanya lalu kirim ulang.',
}

export const KERJAAN_URUT: KerjaanId[] = ['periksa', 'isi', 'draft', 'ditolak']

export type Kerjaan = { id: KerjaanId; label: string; cls: string; judul: string }

export type RejectInfo = { stage: string; catatan: string | null }

const STAGE_LABELS: Record<string, string> = {
  jemput_pangan: 'Jemput Pangan',
  makloon: 'Makloon',
  makloon_kirim: 'Makloon Kirim',
  makloon_terima: 'Makloon Terima',
  ub_jastasma: 'UB Jastasma',
  pengadaan: 'Pengadaan',
  keuangan: 'Keuangan',
}

export function labelTahap(stage: string) {
  return STAGE_LABELS[stage] ?? stage.replaceAll('_', ' ')
}

export function rejectedStages(row: TransaksiListItem | RekapTransaksi): RejectInfo[] {
  const items: RejectInfo[] = []
  if (row.data_jemput_pangan?.status === 'ditolak') items.push({ stage: 'jemput_pangan', catatan: row.data_jemput_pangan.catatan_penolakan ?? null })
  if (row.data_makloon_tjp?.status === 'ditolak' || row.data_makloon_mpp?.status === 'ditolak') {
    items.push({ stage: row.skema === 'MPP' ? 'makloon_kirim' : 'makloon', catatan: (row.data_makloon_tjp?.catatan_penolakan ?? row.data_makloon_mpp?.catatan_penolakan) ?? null })
  }
  if (row.data_ub_jastasma?.status === 'ditolak') items.push({ stage: 'ub_jastasma', catatan: row.data_ub_jastasma.catatan_penolakan ?? null })
  if (row.data_pengadaan?.review_status === 'ditolak') items.push({ stage: 'pengadaan', catatan: null })
  if (row.data_pengadaan?.data_keuangan?.review_status === 'ditolak') items.push({ stage: 'keuangan', catatan: null })
  return items
}

const KERJAAN_CLS: Record<KerjaanId, string> = {
  periksa: 'badge-warning',
  isi: 'badge',
  draft: 'badge',
  ditolak: 'badge-danger',
}

/**
 * Klasifikasinya SUDAH dihitung server (KerjaanTransaksi::ekspresi()) dan ikut tiap baris.
 * Dulu logika ini diduplikasi di sini, tapi endpoint daftar tidak memuat data PO sehingga
 * Pengadaan & Keuangan terpaksa dilempar ke satu kategori buntu. Fungsi ini kini hanya
 * memetakan kategori ke tampilannya -- jangan kembalikan percabangan klasifikasi ke sini.
 */
export function kerjaan(row: TransaksiListItem): Kerjaan {
  const id = row.kerjaan
  const ditolak = rejectedStages(row)

  const judul = id === 'ditolak' && ditolak.length > 0
    ? `Ditolak di tahap ${labelTahap(ditolak[0].stage)} — perbaiki lalu kirim ulang`
    : KERJAAN_KETERANGAN[id]

  return { id, label: KERJAAN_LABEL[id], cls: KERJAAN_CLS[id], judul }
}
