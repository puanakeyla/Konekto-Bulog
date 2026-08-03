import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

export type Gudang = {
  id: number
  kode: string
  nama: string
  aktif: boolean
}

/** Opsi dropdown: hanya gudang aktif. Dipakai form Gudang & UB Jastasma. */
export function useGudangOptions() {
  return useQuery({
    queryKey: ['gudang-options'],
    queryFn: async () => {
      const { data } = await api.get<{ data: Pick<Gudang, 'id' | 'kode' | 'nama'>[] }>('/api/gudang-options')
      return data.data
    },
  })
}

/** Daftar lengkap termasuk yang nonaktif -- hanya untuk layar Admin. */
export function useGudangList() {
  return useQuery({
    queryKey: ['gudang-list'],
    queryFn: async () => {
      const { data } = await api.get<{ data: Gudang[] }>('/api/admin/gudang')
      return data.data
    },
  })
}

export function useGudangMutations() {
  const queryClient = useQueryClient()
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['gudang-list'] })
    queryClient.invalidateQueries({ queryKey: ['gudang-options'] })
  }

  const simpan = useMutation({
    mutationFn: async ({ id, ...body }: Partial<Gudang> & { id?: number }) => {
      const { data } = id
        ? await api.patch<{ data: Gudang }>(`/api/admin/gudang/${id}`, body)
        : await api.post<{ data: Gudang }>('/api/admin/gudang', body)
      return data.data
    },
    onSuccess: invalidate,
  })

  const hapus = useMutation({
    mutationFn: async (id: number) => {
      await api.delete(`/api/admin/gudang/${id}`)
    },
    onSuccess: invalidate,
  })

  return { simpan, hapus }
}
