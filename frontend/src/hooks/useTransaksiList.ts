import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export type TransaksiListItem = {
  id_transaksi: string
  skema: 'TJP' | 'MPP'
  current_stage: string
  status_keseluruhan: string
  created_at: string
  data_makloon_mpp?: { id_pemasok: string; tanggal_bongkar: string; kuantum: string } | null
  data_makloon_tjp?: { tanggal_bongkar: string; kuantum_bongkar: string } | null
  data_jemput_pangan?: { id_pemasok: string; makloon_user_id: number } | null
}

export function useTransaksiList() {
  return useQuery({
    queryKey: ['transaksi-list'],
    queryFn: async () => {
      const { data } = await api.get<{ data: TransaksiListItem[] }>('/api/transaksi')
      return data.data
    },
  })
}
