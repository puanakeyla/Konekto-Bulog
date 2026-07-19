import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { PaginationMeta } from './useTransaksiList'

export type StatusOut = 'menunggu_pengadaan' | 'dikeluarkan' | 'dikembalikan'

/** Satu permintaan pengeluaran stok dari Operasi (modul mandiri, lepas dari PO/IN). */
export type PermintaanOperasi = {
  id: number
  gabah_diolah_kg: string
  status_out: StatusOut
  no_out: string | null
  kuantum_out: string | null
  catatan_pengembalian: string | null
  no_mo: string | null
  no_tm: string | null
  hgl_kg: string | null
  broken_kg: string | null
  menir_kg: string | null
  katul_kg: string | null
  rendemen_persen: string | null
  created_by: number
  created_at: string
  creator?: { id: number; username: string } | null
  reviewer?: { id: number; username: string } | null
}

/** Hasil produksi sudah diisi Operasi (siap diterima Gudang). */
export function sudahIsiHasil(item: PermintaanOperasi) {
  return item.status_out === 'dikeluarkan' && !!item.no_mo
}

export function useOperasiList(page = 1, perPage = 50) {
  return useQuery({
    queryKey: ['operasi-list', page, perPage],
    queryFn: async () => {
      const { data } = await api.get<{ data: PermintaanOperasi[]; meta: PaginationMeta }>('/api/operasi', {
        params: { page, per_page: perPage },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}
