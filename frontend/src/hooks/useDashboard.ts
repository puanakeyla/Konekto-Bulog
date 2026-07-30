import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { KerjaanId } from '../lib/kerjaanTransaksi'

/**
 * Angka ringkasan dashboard datang jadi dari server (DashboardController).
 * Menghitungnya di browser dari baris yang ter-fetch hanya benar selama seluruh data muat
 * dalam satu halaman -- di atas itu angkanya diam-diam melaporkan sebagian saja.
 */
export type HitungKerjaan = Record<KerjaanId, number> & { total: number }

export type RingkasanRekap = {
  total: number
  selesai: number
  perlu_diproses: number
  ditolak: number
}

export type Ringkasan = {
  antrean: HitungKerjaan
  /** Hanya dikirim untuk role admin & keuangan. */
  rekap?: RingkasanRekap
}

export function useRingkasanDashboard(skema: 'semua' | 'TJP' | 'MPP') {
  return useQuery({
    queryKey: ['dashboard-ringkasan', skema],
    queryFn: async () => {
      const { data } = await api.get<{ data: Ringkasan }>('/api/dashboard/ringkasan', {
        params: skema === 'semua' ? {} : { skema },
      })
      return data.data
    },
  })
}

export type PantauanBaris = {
  nama: string
  gabah_diterima: number
  gabah_administrasi: number
}

export function usePantauan(aktif: boolean) {
  return useQuery({
    queryKey: ['dashboard-pantauan'],
    enabled: aktif,
    queryFn: async () => {
      const { data } = await api.get<{ data: PantauanBaris[] }>('/api/dashboard/pantauan')
      return data.data
    },
  })
}
