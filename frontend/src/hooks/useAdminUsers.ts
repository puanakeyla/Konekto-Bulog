import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import type { PaginationMeta } from './useTransaksiList'

export type Role = {
  id: number
  nama_role: string
}

export type AdminUser = {
  id: number
  username: string
  role_id: number
  role: Role
  nama_maklon: string | null
  nama_gudang: string | null
  kecamatan: string | null
  kabupaten: string | null
  is_active: boolean
  /** Non-null = akses edit rekap sementara sedang terbuka untuk user ini. */
  akses_edit_dibuka_at: string | null
  created_at: string
  updated_at: string
}

export function useAdminUsers(page = 1, perPage = 20) {
  return useQuery({
    queryKey: ['admin-users', page, perPage],
    queryFn: async () => {
      const { data } = await api.get<{ data: AdminUser[]; meta: PaginationMeta }>('/api/admin/users', {
        params: { page, per_page: perPage },
      })
      return { items: data.data, meta: data.meta }
    },
  })
}

export function useAdminRoles() {
  return useQuery({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const { data } = await api.get<{ data: Role[] }>('/api/admin/roles')
      return data.data
    },
  })
}
