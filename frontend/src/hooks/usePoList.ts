import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { PaginationMeta } from './useTransaksiList'

export type PoDetailItem = {
  id: number
  data_pengadaan_id: number
  transaksi_id: string
  kuantum_kontribusi: string
  no_in: string | null
  data_operasi: DataOperasi | null
}

export type DataKeuangan = {
  id: number
  data_pengadaan_id: number
  status_bayar: 'belum' | 'dibayarkan'
  tanggal_bayar: string | null
}

export type DataOperasi = {
  id: number
  po_detail_id: number
  no_mo: string
  no_tm: string
  hgl_kg: string | null
  broken_kg: string | null
  menir_kg: string | null
  katul_kg: string | null
  rendemen_persen: string | null
  data_gudang: DataGudang | null
}

export type DataGudang = {
  id: number
  data_operasi_id: number
  tanggal_masuk: string
  nama_gudang: string
  realisasi_hgl: string | null
  no_tm: string
}

export type PoItem = {
  id: number
  tanggal_bongkar: string
  id_pemasok: string
  makloon_user_id: number
  total_kuantum: string
  harga: string
  total_harga: string
  no_po: string
  no_spp: string | null
  status: 'proses' | 'lengkap' | 'dibatalkan'
  po_detail: PoDetailItem[]
  data_keuangan: DataKeuangan | null
}

export function usePoList(page = 1, perPage = 20) {
  return useQuery({
    queryKey: ['po-list', page, perPage],
    queryFn: async () => {
      // /api/po memakai ResourceCollection, sama seperti /api/transaksi:
      // item ada di `data`, metadata pagination di `meta`.
      const { data } = await api.get<{ data: PoItem[]; meta: PaginationMeta }>('/api/po', {
        params: { page, per_page: perPage },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}
