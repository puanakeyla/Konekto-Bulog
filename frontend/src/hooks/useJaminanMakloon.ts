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
    bentuk_jaminan: string | null
    jaminan_rp: number
    kapasitas_total_kg: number
  }
  pantauan: {
    gabah_masuk: number
    gabah_kembali: number
    gabah_ditangan: number
    sisa_dapat_diinput_kg: number
    melewati_batas: boolean
  }
}

export type SimpanJaminanMakloonPayload = {
  makloon_user_id: number
  bentuk_jaminan: string | null
  jaminan_rp: number
  kapasitas_total_kg: number
}

/** Aturan jaminan milik makloon yang sedang login — panel read-only di form tahap Makloon. */
export type JaminanSaya = {
  bentuk_jaminan: string | null
  jaminan_rp: number
  kapasitas_total_kg: number
  gabah_masuk_kg: number
  gabah_kembali_kg: number
  gabah_ditangan_kg: number
  sisa_dapat_diinput_kg: number
}

/**
 * Aturannya murni kg, tanpa dimensi waktu -- jadi tidak ada parameter tanggal: angkanya sama
 * saja kapan pun makloon membukanya.
 */
export function useJaminanSaya() {
  return useQuery({
    queryKey: ['jaminan-saya'],
    queryFn: async () => {
      const { data } = await api.get<{ data: JaminanSaya | null }>('/api/jaminan-saya')
      return data.data
    },
  })
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
