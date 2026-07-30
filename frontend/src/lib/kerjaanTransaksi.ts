import type { TransaksiListItem } from '../hooks/useTransaksiList'
import type { RekapTransaksi } from '../hooks/useRekapTransaksi'

/**
 * "Transaksi menunggu tindakan" adalah ANTREAN KERJA, bukan daftar status. Endpoint
 * /api/transaksi sudah menyaring ke `current_stage` milik role DAN `status_keseluruhan =
 * 'berjalan'` (TransaksiController@index), jadi transaksi selesai/dibatalkan tidak pernah
 * sampai ke sana. Yang perlu dijawab kolom status bukan "statusnya apa" melainkan "saya harus
 * ngapain" -- karena itu kategorinya kerjaan, dan hanya ada lima.
 *
 * Catatan alur (TransaksiStageService): `current_stage` maju saat SUBMIT, bukan saat diterima.
 * Jadi satu transaksi singgah di antrean sebuah role dua kali -- sekali menunggu diperiksa
 * (data tahap sebelumnya `menunggu_review`), lalu setelah diterima ia bertahan menunggu role
 * itu mengisi datanya sendiri. Begitu dikirim, transaksi keluar dari antrean.
 */
export type KerjaanId = 'periksa' | 'isi' | 'draft' | 'ditolak' | 'po'

/**
 * Satu badge = satu chip, tanpa kecuali. Draft sempat disembunyikan di balik chip "Perlu diisi"
 * sehingga angka chip tidak cocok dengan badge yang terlihat di tabel -- jangan diulang.
 */
export const KERJAAN_LABEL: Record<KerjaanId, string> = {
  periksa: 'Perlu dicek',
  isi: 'Perlu diisi',
  draft: 'Draft belum dikirim',
  ditolak: 'Perlu diperbaiki',
  po: 'Lanjut di halaman PO',
}

/** Kalimat di bawah chip aktif, supaya tidak perlu hover tooltip untuk tahu harus apa. */
export const KERJAAN_KETERANGAN: Record<KerjaanId, string> = {
  periksa: 'Buka transaksinya, cek data dari tahap sebelumnya, lalu tekan Terima atau Tolak.',
  isi: 'Lengkapi data tahap Anda, lalu kirim ke tahap berikutnya.',
  draft: 'Data sudah tersimpan tapi belum dikirim. Buka lalu tekan Kirim.',
  ditolak: 'Ditolak oleh tahap berikutnya. Perbaiki datanya lalu kirim ulang.',
  po: 'Tidak ada yang bisa dikerjakan dari daftar ini — lanjutkan dari halaman PO.',
}

export const KERJAAN_URUT: KerjaanId[] = ['periksa', 'isi', 'draft', 'ditolak', 'po']

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

/** Tahap yang datanya sedang menunggu diperiksa oleh `current_stage`. */
const TAHAP_SEBELUM: Record<string, string> = {
  makloon: 'Jemput Pangan',
  makloon_terima: 'Makloon Kirim',
  ub_jastasma: 'Makloon',
  pengadaan: 'UB Jastasma',
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

/** Data tahap yang jadi tanggung jawab `current_stage` untuk diisi sendiri. */
export function dataTahapSaatIni(row: TransaksiListItem) {
  if (row.current_stage === 'jemput_pangan') return row.data_jemput_pangan
  if (row.current_stage === 'makloon') return row.data_makloon_tjp
  if (row.current_stage === 'makloon_kirim') return row.data_makloon_mpp
  if (row.current_stage === 'ub_jastasma') return row.data_ub_jastasma
  return null
}

/** Data tahap sebelumnya, yaitu yang menunggu diterima/ditolak oleh tahap saat ini. */
export function dataMenungguReview(row: TransaksiListItem) {
  if (row.current_stage === 'makloon') return row.data_jemput_pangan
  if (row.current_stage === 'makloon_terima') return row.data_makloon_mpp
  if (row.current_stage === 'ub_jastasma') return row.skema === 'MPP' ? row.data_makloon_mpp : row.data_makloon_tjp
  if (row.current_stage === 'pengadaan') return row.data_ub_jastasma
  return null
}

/**
 * Cabang penolakan HARUS pertama: saat ditolak, transaksi dikembalikan ke tahap asal sehingga
 * `dataMenungguReview` bisa ikut terisi dan baris salah masuk kategori "Perlu dicek".
 */
export function kerjaan(row: TransaksiListItem): Kerjaan {
  const jadi = (id: KerjaanId, cls: string, judul: string): Kerjaan => ({ id, label: KERJAAN_LABEL[id], cls, judul })

  const ditolak = rejectedStages(row)
  if (ditolak.length > 0) {
    return jadi('ditolak', 'badge-danger', `Ditolak di tahap ${labelTahap(ditolak[0].stage)} — perbaiki lalu kirim ulang`)
  }

  // Makloon Terima tetap kategori "Perlu dicek": tugas khususnya (timbang, catat kuantum
  // bongkar, unggah surat jalan + nota timbang) sudah dijelaskan di kepala blok tahapnya di
  // dashboard, dan tombol Terima di halaman detail menahan sampai semuanya lengkap.
  if (dataMenungguReview(row)?.status === 'menunggu_review') {
    return jadi('periksa', 'badge-warning', `Cek data dari ${TAHAP_SEBELUM[row.current_stage] ?? 'tahap sebelumnya'} lalu tekan Terima atau Tolak`)
  }

  // Pengadaan & Keuangan bekerja di level PO (gabungan banyak transaksi) dan datanya tidak ikut
  // endpoint daftar ini, jadi tidak ada yang bisa dikerjakan dari baris per transaksi.
  if (row.current_stage === 'pengadaan' || row.current_stage === 'keuangan') {
    return jadi('po', 'badge', KERJAAN_KETERANGAN.po)
  }

  if (dataTahapSaatIni(row)?.status === 'draft') {
    return jadi('draft', 'badge', KERJAAN_KETERANGAN.draft)
  }

  return jadi('isi', 'badge', `Giliran ${labelTahap(row.current_stage)} mengisi data lalu mengirimnya`)
}
