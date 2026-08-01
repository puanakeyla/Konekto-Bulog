import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

export type NotifikasiItem = {
  id: number
  tipe: 'dikirim' | 'diterima' | 'ditolak' | string
  judul: string
  pesan: string
  transaksi_id: string | null
  data: Record<string, unknown> | null
  read_at: string | null
  created_at: string
  actor: { id: number; username: string; role: string | null; nama_maklon: string | null; nama_gudang: string | null } | null
}

export function useNotifikasi(enabled = true) {
  return useQuery({
    queryKey: ['notifikasi'],
    enabled,
    refetchInterval: 30000,
    queryFn: async () => {
      const { data } = await api.get<{ data: NotifikasiItem[]; unread_count: number }>('/api/notifikasi')
      return data
    },
  })
}

export function useMarkNotifikasiRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.patch(`/api/notifikasi/${id}/read`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifikasi'] }),
  })
}

export function useMarkAllNotifikasiRead() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => api.patch('/api/notifikasi/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifikasi'] }),
  })
}
