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
    kapasitas_per_hari_kg: number
    batas_hari: number
    /** kapasitas_per_hari x batas_hari — batas gabah yang boleh menumpuk belum diolah. */
    plafon_tunggakan_kg: number
    berlaku_mulai: string | null
    berlaku_sampai: string | null
    masih_berlaku: boolean
  }
  pantauan: {
    gabah_sudah_in: number
    olah_rekap: number
    olah_selesai: number
    /** Rumus sama persis dengan kolom "Stok Pengurang LHPK" di neraca — bisa minus. */
    tunggakan_kg: number
    terpakai_hari_ini_kg: number
    /** Yang paling dicari: berapa kg lagi yang masih boleh dikirim makloon hari ini. */
    sisa_dapat_diinput_kg: number
    melewati_batas: boolean
  }
}

export type SimpanJaminanMakloonPayload = {
  makloon_user_id: number
  bentuk_jaminan: string | null
  jaminan_rp: number
  kapasitas_per_hari_kg: number
  batas_hari: number
}

/** Aturan jaminan milik makloon yang sedang login — panel read-only di form tahap Makloon. */
export type JaminanSaya = {
  bentuk_jaminan: string | null
  jaminan_rp: number
  kapasitas_per_hari_kg: number
  batas_hari: number
  berlaku_mulai: string | null
  berlaku_sampai: string | null
  masih_berlaku: boolean
  tanggal: string
  terpakai_kg: number
  sisa_harian_kg: number
  tunggakan_kg: number
  plafon_tunggakan_kg: number
  sisa_dapat_diinput_kg: number
}

/**
 * `tanggal` mengikuti tanggal bongkar yang sedang diketik, supaya angka terpakai/sisa di layar
 * bergerak saat makloon mengubahnya. Dimatikan bila tanggalnya belum diisi.
 */
export function useJaminanSaya(tanggal: string | null, aktif = true) {
  return useQuery({
    queryKey: ['jaminan-saya', tanggal],
    enabled: aktif,
    queryFn: async () => {
      const { data } = await api.get<{ data: JaminanSaya | null }>('/api/jaminan-saya', {
        params: tanggal ? { tanggal } : undefined,
      })
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
