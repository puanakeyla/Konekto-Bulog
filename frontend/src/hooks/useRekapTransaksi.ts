import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { PaginationMeta } from './useTransaksiList'

export type StageStatus = 'menunggu_review' | 'diterima' | 'ditolak'

type StageBase = { status: StageStatus; locked_at?: string | null; submitted_at?: string | null; catatan_penolakan?: string | null }

export type RekapJemputPangan = StageBase & {
  id_pemasok: string
  nama_poktan_gapoktan: string | null
  supir: string | null
  plat_mobil: string | null
  desa: string | null
  kecamatan: string | null
  kabupaten: string | null
  makloon_user_id?: number | null
  tanggal_kirim: string | null
  /** Disembunyikan untuk role tertentu (FieldVisibility) -> bisa undefined. */
  kuantum?: string | null
  jarak_ke_makloon_km?: string | null
}

export type RekapMakloonMpp = StageBase & {
  id_pemasok: string
  supir: string | null
  plat_mobil: string | null
  desa: string | null
  kecamatan: string | null
  kabupaten: string | null
  tanggal_bongkar: string | null
  kuantum: string | null
  kuantum_bongkar: string | null
  jarak_ke_makloon_km: string | null
}

export type RekapMakloonTjp = StageBase & {
  tanggal_bongkar: string | null
  kuantum_bongkar: string | null
}

export type RekapUb = StageBase & {
  ka1: string | null
  ka2: string | null
  ka3: string | null
  hampa: string | null
  butir_hijau: string | null
}

export type RekapPengadaan = {
  id: number
  no_po: string
  no_spp: string | null
  // Status Sergab. Read-only di Rekap -- yang mengubahnya cuma Pengadaan lewat PoStatusSergabForm.
  status: string
  harga: string | null
  total_kuantum: string | null
  total_harga: string | null
  review_status?: string | null
  po_detail?: { transaksi_id: string; no_in: string | null; kuantum_kontribusi: string }[]
  data_keuangan?: {
    status_bayar: 'belum' | 'dibayarkan'
    tanggal_bayar: string | null
    review_status?: string | null
  } | null
}

export type RekapTransaksi = {
  id_transaksi: string
  skema: 'TJP' | 'MPP'
  current_stage: string
  status_keseluruhan: string
  created_by: number | null
  created_at: string
  nama_maklon: string | null
  makloon_kecamatan: string | null
  makloon_kabupaten: string | null
  data_jemput_pangan: RekapJemputPangan | null
  data_makloon_mpp: RekapMakloonMpp | null
  /** Hasil timbang tahap Makloon Terima (MPP). Terpisah dari data kirim di atas. */
  data_makloon_terima: { kuantum_bongkar: string | null; status?: string | null } | null
  data_makloon_tjp: RekapMakloonTjp | null
  data_ub_jastasma: RekapUb | null
  data_pengadaan: RekapPengadaan | null
}

/**
 * Kartu angka Rekap: dihitung backend atas SELURUH data yang berhak dilihat pemanggil.
 *
 * Sengaja terpisah dari daftar berhalaman. Menjumlahkannya dari baris yang sedang dimuat cuma
 * benar selama datanya muat dalam satu halaman -- lewat dari itu angkanya berkurang diam-diam.
 */
export type RingkasanRekap = {
  bongkar_tjp: number
  bongkar_mpp: number
  jumlah_tjp: number
  jumlah_mpp: number
  total_po: number
}

export function useRingkasanRekap() {
  return useQuery({
    queryKey: ['rekap-transaksi-ringkasan'],
    queryFn: async () => {
      const { data } = await api.get<{ data: RingkasanRekap }>('/api/transaksi/rekap/ringkasan')
      return data.data
    },
  })
}

export function useRekapTransaksi(page = 1, perPage = 200) {
  return useQuery({
    queryKey: ['rekap-transaksi', page, perPage],
    queryFn: async () => {
      const { data } = await api.get<{ data: RekapTransaksi[]; meta: PaginationMeta }>('/api/transaksi/rekap', {
        params: { page, per_page: perPage },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}
