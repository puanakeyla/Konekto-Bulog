import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { PaginationMeta } from './useTransaksiList'

export type MoStage = 'pengadaan' | 'operasi' | 'gudang' | 'selesai'

export type MoDetailItem = {
  id: number
  pengolahan_id: number
  pengolahan?: { id: number; no_lhpk: string; kuantum_olah: string; tanggal: string } | null
}

export type Mo = {
  id: number
  no_mo: string
  no_tm: string
  makloon_user_id: number
  total_kuantum_olah: string
  no_out: string | null
  tujuan_gudang_user_id: number | null
  no_tm_gudang: string | null
  kuantum_total: string | null
  tanggal_terima_gudang: string | null
  current_stage: MoStage
  status: 'berjalan' | 'selesai' | 'dibatalkan'
  catatan_penolakan: string | null
  makloon?: { id: number; nama_maklon: string | null } | null
  tujuan_gudang?: { id: number; nama_gudang: string | null } | null
  mo_detail?: MoDetailItem[]
}

export type GudangOption = { id: number; nama_gudang: string | null }

export function useMoList(stage?: MoStage, page = 1, perPage = 50) {
  return useQuery({
    queryKey: ['mo', stage ?? 'all', page, perPage],
    queryFn: async () => {
      const { data } = await api.get<{ data: Mo[]; meta: PaginationMeta }>('/api/mo', {
        params: { page, per_page: perPage, ...(stage ? { stage } : {}) },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}

export function useGudangOptions() {
  return useQuery({
    queryKey: ['gudang-options'],
    queryFn: async () => {
      const { data } = await api.get<{ data: GudangOption[] }>('/api/gudang-options')
      return data.data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useTolakPengolahan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, catatan }: { id: number; catatan: string }) => {
      const { data } = await api.post(`/api/pengolahan/${id}/tolak`, { catatan })
      return data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pengolahan'] }),
  })
}

export function useGabungkanMo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: { pengolahan_ids: number[]; no_mo: string; no_tm: string }) => {
      const { data } = await api.post<{ data: Mo }>('/api/mo/gabungkan', body)
      return data.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pengolahan'] })
      queryClient.invalidateQueries({ queryKey: ['mo'] })
    },
  })
}

export function useKirimGudang() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: { tujuan_gudang_user_id: number; no_tm_gudang: string; kuantum_total: number } }) => {
      const { data } = await api.patch<{ data: Mo }>(`/api/mo/${id}/kirim-gudang`, body)
      return data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mo'] }),
  })
}

export function useKirimUlangPengadaan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.patch<{ data: Mo }>(`/api/mo/${id}/ulang-pengadaan`, {})
      return data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mo'] }),
  })
}

export function usePutuskanOut() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: { keputusan: 'diterima' | 'ditolak'; no_out?: string; catatan?: string } }) => {
      const { data } = await api.patch<{ data: Mo }>(`/api/mo/${id}/out`, body)
      return data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mo'] }),
  })
}

export function useTerimaMo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, tanggal }: { id: number; tanggal: string }) => {
      const { data } = await api.post<{ data: Mo }>(`/api/mo/${id}/terima`, { tanggal })
      return data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mo'] }),
  })
}

export function useTolakMo() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, catatan }: { id: number; catatan: string }) => {
      const { data } = await api.post<{ data: Mo }>(`/api/mo/${id}/tolak`, { catatan })
      return data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['mo'] }),
  })
}
