import type { TransaksiListItem } from '../hooks/useTransaksiList'

/**
 * Kunci bisnis satu transaksi: pemasok, tanggal bongkar, dan kuantum -- sumbernya beda per
 * skema (MPP dari data makloon MPP, TJP dari jemput pangan + bongkar TJP). Dipakai bersama
 * oleh daftar transaksi di dashboard dan panel penggabungan PO supaya keduanya menampilkan
 * dan mengurutkan angka yang sama persis dengan yang dipakai backend saat menggabungkan PO.
 */
export function kunciTransaksi(t: TransaksiListItem) {
  if (t.skema === 'MPP') {
    return {
      id_pemasok: t.data_makloon_mpp?.id_pemasok ?? null,
      tanggal_bongkar: t.data_makloon_mpp?.tanggal_bongkar ?? null,
      kuantum: t.data_makloon_mpp?.kuantum ?? null,
    }
  }
  return {
    id_pemasok: t.data_jemput_pangan?.id_pemasok ?? null,
    tanggal_bongkar: t.data_makloon_tjp?.tanggal_bongkar ?? null,
    kuantum: t.data_makloon_tjp?.kuantum_bongkar ?? null,
  }
}

/**
 * Tanggal yang ditampilkan di daftar: tanggal bongkar bila tahap Makloon sudah diisi, kalau
 * belum jatuh ke tanggal kirim (TJP) lalu tanggal transaksi dibuat. Urutannya sama dengan
 * COALESCE di TransaksiController::index() supaya kolom yang terlihat = kunci pengurutan.
 */
export function tanggalTransaksi(t: TransaksiListItem): string {
  return kunciTransaksi(t).tanggal_bongkar ?? t.data_jemput_pangan?.tanggal_kirim ?? t.created_at
}
