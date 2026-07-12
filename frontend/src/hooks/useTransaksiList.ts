import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export type PaginationMeta = {
  current_page: number
  last_page: number
  per_page: number
  total: number
  from: number | null
  to: number | null
}

export type TransaksiListItem = {
  id_transaksi: string
  skema: 'TJP' | 'MPP'
  current_stage: string
  status_keseluruhan: string
  created_at: string
  nama_maklon: string | null
  makloon_kecamatan: string | null
  makloon_kabupaten: string | null
  data_makloon_mpp?: { id_pemasok: string; tanggal_bongkar: string; kuantum: string } | null
  data_makloon_tjp?: { tanggal_bongkar: string; kuantum_bongkar: string } | null
  data_jemput_pangan?: { id_pemasok: string; makloon_user_id: number } | null
}

export function useTransaksiList(page = 1, perPage = 20) {
  return useQuery({
    queryKey: ['transaksi-list', page, perPage],
    queryFn: async () => {
      const { data } = await api.get<{ data: TransaksiListItem[]; meta: PaginationMeta }>('/api/transaksi', {
        params: { page, per_page: perPage },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}
