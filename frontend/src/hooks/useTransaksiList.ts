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
  data_makloon_mpp?: { id_pemasok: string; tanggal_bongkar: string; kuantum: string; status?: string; catatan_penolakan?: string | null } | null
  data_makloon_tjp?: { tanggal_bongkar: string; kuantum_bongkar: string; status?: string; catatan_penolakan?: string | null } | null
  data_jemput_pangan?: { id_pemasok: string; makloon_user_id: number; status?: string; catatan_penolakan?: string | null } | null
  data_ub_jastasma?: { status?: string; catatan_penolakan?: string | null } | null
  data_pengadaan?: { review_status?: string | null; data_keuangan?: { review_status?: string | null } | null } | null
}

export function useTransaksiList(page = 1, perPage = 20, siapPo = false) {
  return useQuery({
    queryKey: ['transaksi-list', page, perPage, siapPo],
    queryFn: async () => {
      const { data } = await api.get<{ data: TransaksiListItem[]; meta: PaginationMeta }>('/api/transaksi', {
        params: { page, per_page: perPage, ...(siapPo ? { siap_po: 1 } : {}) },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}
