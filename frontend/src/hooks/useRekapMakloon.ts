import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

/**
 * Satu baris neraca gabah per makloon. Angka mentah DAN turunannya sama-sama datang dari server
 * (MonitoringController::barisRekapMakloon) supaya rumusnya cuma hidup di satu tempat -- tapi
 * komponen tabel tetap butuh angka mentahnya untuk menghitung ulang baris TOTAL saat difilter.
 */
export type BarisRekapMakloon = {
  makloon_user_id: number
  nama_maklon: string
  kecamatan: string | null
  kabupaten: string | null
  gabah_diterima: number
  gabah_sudah_in: number
  gabah_belum_in: number
  gabah_spp: number
  gabah_belum_spp: number
  olah_rekap: number
  belum_adm_belum_olah: number
  olah_selesai: number
  stok_real: number
  hgl: number
  broken: number
  menir: number
  katul: number
  reject: number
  rendemen: number
  hgl_operasi: number
  hgl_belum_adm: number
  persentase_olah: number
}

/** Admin-only di server. Satu baris per makloon (puluhan), jadi tidak dipaginasi. */
export function useRekapMakloon(enabled = true) {
  return useQuery({
    queryKey: ['monitoring-rekap-makloon'],
    enabled,
    retry: false,
    queryFn: async () => {
      const { data } = await api.get<{ data: BarisRekapMakloon[] }>('/api/monitoring/rekap-makloon')
      return data.data
    },
  })
}
