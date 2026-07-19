import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { PaginationMeta } from './useTransaksiList'

/** Satu pencatatan penerimaan Gudang (modul mandiri, lepas dari Operasi). */
export type DataGudang = {
  id: number
  tanggal_masuk: string
  nama_gudang: string
  realisasi_hgl: string
  no_tm: string
  created_by: number
  creator?: { id: number; username: string } | null
  created_at: string
}

export function useGudangList(page = 1, perPage = 50) {
  return useQuery({
    queryKey: ['gudang-list', page, perPage],
    queryFn: async () => {
      const { data } = await api.get<{ data: DataGudang[]; meta: PaginationMeta }>('/api/gudang', {
        params: { page, per_page: perPage },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}
