import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { PaginationMeta } from './useTransaksiList'

export type PoDetailItem = {
  id: number
  data_pengadaan_id: number
  transaksi_id: string
  kuantum_kontribusi: string
  no_in: string | null
}

export type ReviewStatus = 'menunggu_review' | 'diterima' | 'ditolak'

export type DataKeuangan = {
  id: number
  data_pengadaan_id: number
  status_bayar: 'belum' | 'dibayarkan'
  tanggal_bayar: string | null
  review_status?: ReviewStatus | null
  catatan_penolakan?: string | null
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
  review_status?: ReviewStatus | null
  catatan_penolakan?: string | null
  po_detail: PoDetailItem[]
  data_keuangan: DataKeuangan | null
}

export function usePoList(page = 1, perPage = 20, search = '', enabled = true) {
  return useQuery({
    queryKey: ['po-list', page, perPage, search],
    enabled,
    queryFn: async () => {
      // /api/po memakai ResourceCollection, sama seperti /api/transaksi:
      // item ada di `data`, metadata pagination di `meta`.
      const { data } = await api.get<{ data: PoItem[]; meta: PaginationMeta }>('/api/po', {
        params: { page, per_page: perPage, q: search || undefined },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}
