import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { PaginationMeta } from './useTransaksiList'

export type PengolahanStatus = 'menunggu_operasi' | 'ditolak' | 'digabung'

export type Pengolahan = {
  id: number
  makloon_user_id: number
  jumlah_kuantum: string
  kuantum_olah: string
  no_lhpk: string
  tanggal: string
  ka1: string | null
  ka2: string | null
  ka3: string | null
  hgl: string | null
  broken: string | null
  menir: string | null
  katul: string | null
  rendemen: string | null
  status: PengolahanStatus
  catatan_penolakan: string | null
  mo_id: number | null
  created_at: string
  makloon?: { id: number; nama_maklon: string | null } | null
}

export type PengolahanForm = {
  makloon_user_id: number
  kuantum_olah: number
  no_lhpk: string
  tanggal: string
  ka1?: number | null
  ka2?: number | null
  ka3?: number | null
  hgl?: number | null
  broken?: number | null
  menir?: number | null
  katul?: number | null
}

export function usePengolahanList(page = 1, perPage = 50) {
  return useQuery({
    queryKey: ['pengolahan', page, perPage],
    queryFn: async () => {
      const { data } = await api.get<{ data: Pengolahan[]; meta: PaginationMeta }>('/api/pengolahan', {
        params: { page, per_page: perPage },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}

export function useKuantumIn(makloonUserId: number | null) {
  return useQuery({
    queryKey: ['pengolahan-kuantum-in', makloonUserId],
    enabled: makloonUserId != null,
    queryFn: async () => {
      const { data } = await api.get<{ data: { total: number } }>('/api/pengolahan/kuantum-in', {
        params: { makloon_user_id: makloonUserId },
      })
      return data.data
    },
  })
}

export function useBuatPengolahan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (form: PengolahanForm) => {
      const { data } = await api.post<{ data: Pengolahan }>('/api/pengolahan', form)
      return data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pengolahan'] }),
  })
}

export function useAjukanUlangPengolahan() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, form }: { id: number; form: PengolahanForm }) => {
      const { data } = await api.patch<{ data: Pengolahan }>(`/api/pengolahan/${id}`, form)
      return data.data
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pengolahan'] }),
  })
}
