import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

export type TransaksiListItem = {
  id_transaksi: string
  skema: 'TJP' | 'MPP'
  current_stage: string
  status_keseluruhan: string
  created_at: string
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
