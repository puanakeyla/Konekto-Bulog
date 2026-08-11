import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

export type JaminanMakloonItem = {
  makloon_user_id: number
  nama_maklon: string
  username: string
  kecamatan: string | null
  kabupaten: string | null
  jaminan: null | {
    id: number
    jaminan_rp: number
    kapasitas_per_hari_kg: number
    batas_hari: number
    kapasitas_total_kg: number
  }
  pantauan: {
    gabah_sudah_in: number
    olah_rekap: number
    olah_selesai: number
    belum_adm_belum_olah: number
    melewati_batas: boolean
  }
}

export type SimpanJaminanMakloonPayload = {
  makloon_user_id: number
  jaminan_rp: number
  kapasitas_per_hari_kg: number
  batas_hari: number
}

export function useJaminanMakloon(q = '') {
  return useQuery({
    queryKey: ['jaminan-makloon', q],
    queryFn: async () => {
      const { data } = await api.get<{ data: JaminanMakloonItem[] }>('/api/operasi/jaminan-makloon', {
        params: q.trim() ? { q } : undefined,
      })
      return data.data
    },
  })
}

export function useSimpanJaminanMakloon() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (payload: SimpanJaminanMakloonPayload) => {
      const { data } = await api.post<{ data: JaminanMakloonItem }>('/api/operasi/jaminan-makloon', payload)
      return data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['jaminan-makloon'] }),
  })
}
