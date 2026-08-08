import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import type { Gudang } from './useGudang'

export type SkemaPengolahan = 'GDG' | 'UBJ'
export type TahapPengolahan = 'gudang' | 'ub_jastasma' | 'operasi' | 'pengadaan'
export type StatusTahap = 'draft' | 'menunggu_review' | 'diterima' | 'ditolak'

export type DataGudang = {
  id: number
  gudang_id: number | null
  gudang?: Gudang | null
  tanggal_masuk_gudang: string | null
  kuantum_hgl: string | null
  plat_mobil: string | null
  supir: string | null
  status: StatusTahap
  catatan_penolakan: string | null
  locked_at: string | null
}

export type DataLhpk = {
  id: number
  gudang_tujuan_id: number | null
  gudang_tujuan?: Gudang | null
  no_lhpk: string | null
  tanggal_lhpk: string | null
  kuantum_stok_gudang: string | null
  kuantum_gabah_diolah: string | null
  kuantum_beras_hgl: string | null
  kualitas: string | null
  broken: string | null
  menir: string | null
  katul: string | null
  ka1: string | null
  ka2: string | null
  ka3: string | null
  reject: string | null
  rendemen: number
  status: StatusTahap
  catatan_penolakan: string | null
  locked_at: string | null
}

export type PengolahanItem = {
  id_pengolahan: string
  skema: SkemaPengolahan
  makloon_user_id: number
  makloon?: { id: number; nama_maklon: string | null } | null
  current_stage: TahapPengolahan
  status_keseluruhan: 'berjalan' | 'selesai'
  created_at: string
  data_gudang?: DataGudang | null
  data_lhpk?: DataLhpk | null
  mo_detail?: {
    id: number
    mo?: {
      id: number
      no_mo: string
      no_tm_ada: string | null
      no_tm_gudang: string | null
      total_kuantum_hgl: string | null
      total_kuantum_gabah_diolah: string | null
      no_out: string | null
      tanggal_out: string | null
      status: string
      review_status: 'draft' | 'menunggu_review' | 'diterima' | 'ditolak'
    } | null
  } | null
  riwayat_penolakan?: { id: number; tahap: string; catatan: string; ditolak_pada: string; penolak?: { name?: string } | null }[]
}

/** Urutan tahap per skema -- cerminan App\Services\Pengolahan\PengolahanStages. */
export const URUTAN_TAHAP: Record<SkemaPengolahan, TahapPengolahan[]> = {
  GDG: ['gudang', 'ub_jastasma', 'operasi', 'pengadaan'],
  UBJ: ['ub_jastasma', 'gudang', 'operasi', 'pengadaan'],
}

export const LABEL_TAHAP: Record<TahapPengolahan, string> = {
  gudang: 'Gudang',
  ub_jastasma: 'UB Jastasma',
  operasi: 'Operasi',
  pengadaan: 'Pengadaan',
}

type Halaman = { data: PengolahanItem[]; current_page: number; last_page: number; total: number; from: number | null; to: number | null }

export function usePengolahanList(params: { page?: number; skema?: SkemaPengolahan | 'semua'; antrean?: boolean; search?: string } = {}) {
  const { page = 1, skema = 'semua', antrean = false, search = '' } = params

  return useQuery({
    queryKey: ['pengolahan-list', page, skema, antrean, search],
    queryFn: async () => {
      const { data } = await api.get<Halaman>('/api/pengolahan', {
        params: {
          page,
          ...(skema !== 'semua' ? { skema } : {}),
          ...(antrean ? { antrean: 1 } : {}),
          ...(search ? { search } : {}),
        },
      })
      return data
    },
  })
}

export function usePengolahanDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['pengolahan-detail', id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<{ data: PengolahanItem }>(`/api/pengolahan/${encodeURIComponent(id!)}`)
      return data.data
    },
  })
}

export function usePengolahanRekap() {
  return useQuery({
    queryKey: ['pengolahan-rekap'],
    queryFn: async () => {
      const { data } = await api.get<{ data: PengolahanItem[] }>('/api/pengolahan/rekap')
      return data.data
    },
  })
}

/** Kandidat penggabungan MO: sudah lolos review Operasi & belum masuk MO mana pun. */
export function useKandidatMo(makloonUserId?: number) {
  return useQuery({
    queryKey: ['pengolahan-kandidat-mo', makloonUserId ?? null],
    queryFn: async () => {
      const { data } = await api.get<{ data: PengolahanItem[] }>('/api/pengolahan/kandidat-mo', {
        params: makloonUserId ? { makloon_user_id: makloonUserId } : {},
      })
      return data.data
    },
  })
}

export function usePengolahanMutations(id?: string) {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['pengolahan-list'] })
    queryClient.invalidateQueries({ queryKey: ['pengolahan-detail'] })
    queryClient.invalidateQueries({ queryKey: ['pengolahan-rekap'] })
    queryClient.invalidateQueries({ queryKey: ['pengolahan-kandidat-mo'] })
  }

  const path = (suffix: string) => `/api/pengolahan/${encodeURIComponent(id ?? '')}${suffix}`

  const buat = useMutation({
    mutationFn: async (body: { skema: SkemaPengolahan; makloon_user_id: number }) => {
      const { data } = await api.post<{ data: PengolahanItem }>('/api/pengolahan', body)
      return data.data
    },
    onSuccess: invalidate,
  })

  const simpanGudang = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.patch(path('/gudang'), body)).data,
    onSuccess: invalidate,
  })

  const simpanLhpk = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.patch(path('/lhpk'), body)).data,
    onSuccess: invalidate,
  })

  const terima = useMutation({
    mutationFn: async () => (await api.post(path('/terima'))).data,
    onSuccess: invalidate,
  })

  const tolak = useMutation({
    mutationFn: async (catatan: string) => (await api.post(path('/tolak'), { catatan })).data,
    onSuccess: invalidate,
  })

  const unggahFoto = useMutation({
    mutationFn: async ({ jenisFoto, file }: { jenisFoto: string; file: File }) => {
      const form = new FormData()
      form.append('jenis_foto', jenisFoto)
      form.append('foto', file)
      return (await api.post(path('/foto'), form)).data
    },
    onSuccess: invalidate,
  })

  return { buat, simpanGudang, simpanLhpk, terima, tolak, unggahFoto }
}
