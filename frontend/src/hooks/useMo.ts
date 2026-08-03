import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { PengolahanItem } from './usePengolahan'

export type StatusMo = 'proses' | 'lengkap' | 'dibatalkan'
export type ReviewStatusMo = 'draft' | 'menunggu_review' | 'diterima' | 'ditolak'

export type MoItem = {
  id: number
  no_mo: string
  no_tm_ada: string | null
  no_tm_gudang: string | null
  makloon_user_id: number
  makloon?: { id: number; nama_maklon: string | null } | null
  total_kuantum_hgl: string
  total_kuantum_gabah_diolah: string
  no_out: string | null
  tanggal_out: string | null
  status: StatusMo
  review_status: ReviewStatusMo
  catatan_penolakan: string | null
  created_at: string
  mo_detail?: { id: number; transaksi_pengolahan?: PengolahanItem | null }[]
}

type Halaman = { data: MoItem[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null }

export function useMoList(params: { page?: number; status?: StatusMo | 'semua'; search?: string } = {}) {
  const { page = 1, status = 'semua', search = '' } = params

  return useQuery({
    queryKey: ['mo-list', page, status, search],
    queryFn: async () => {
      const { data } = await api.get<Halaman>('/api/mo', {
        params: { page, ...(status !== 'semua' ? { status } : {}), ...(search ? { search } : {}) },
      })
      return data
    },
  })
}

export function useMoDetail(id: number | undefined) {
  return useQuery({
    queryKey: ['mo-detail', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<{ data: MoItem }>(`/api/mo/${id}`)
      return data.data
    },
  })
}

export function useMoMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['mo-list'] })
    queryClient.invalidateQueries({ queryKey: ['mo-detail'] })
    queryClient.invalidateQueries({ queryKey: ['pengolahan-list'] })
    queryClient.invalidateQueries({ queryKey: ['pengolahan-kandidat-mo'] })
    queryClient.invalidateQueries({ queryKey: ['pengolahan-rekap'] })
  }

  const gabungkan = useMutation({
    mutationFn: async (body: { pengolahan_ids: string[]; no_mo: string; no_tm_ada?: string | null; no_tm_gudang?: string | null }) => {
      const { data } = await api.post<{ data: MoItem }>('/api/mo/gabungkan', body)
      return data.data
    },
    onSuccess: invalidate,
  })

  const ubahNomor = useMutation({
    mutationFn: async ({ id, ...body }: { id: number; no_mo?: string; no_tm_ada?: string | null; no_tm_gudang?: string | null }) =>
      (await api.patch(`/api/mo/${id}`, body)).data,
    onSuccess: invalidate,
  })

  const ubahAnggota = useMutation({
    mutationFn: async ({ id, pengolahan_ids }: { id: number; pengolahan_ids: string[] }) =>
      (await api.patch(`/api/mo/${id}/anggota`, { pengolahan_ids })).data,
    onSuccess: invalidate,
  })

  const kirim = useMutation({
    mutationFn: async (id: number) => (await api.post(`/api/mo/${id}/kirim`)).data,
    onSuccess: invalidate,
  })

  const batalkan = useMutation({
    mutationFn: async (id: number) => (await api.post(`/api/mo/${id}/batalkan`)).data,
    onSuccess: invalidate,
  })

  const terima = useMutation({
    mutationFn: async (id: number) => (await api.post(`/api/mo/${id}/terima`)).data,
    onSuccess: invalidate,
  })

  const tolak = useMutation({
    mutationFn: async ({ id, catatan }: { id: number; catatan: string }) =>
      (await api.post(`/api/mo/${id}/tolak`, { catatan })).data,
    onSuccess: invalidate,
  })

  const isiOut = useMutation({
    mutationFn: async ({ id, no_out, tanggal_out }: { id: number; no_out: string; tanggal_out: string }) =>
      (await api.patch(`/api/mo/${id}/out`, { no_out, tanggal_out })).data,
    onSuccess: invalidate,
  })

  return { gabungkan, ubahNomor, ubahAnggota, kirim, batalkan, terima, tolak, isiOut }
}
