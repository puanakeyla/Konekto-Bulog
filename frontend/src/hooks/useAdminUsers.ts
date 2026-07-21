import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'

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
  created_at: string
  updated_at: string
}

export function useAdminUsers() {
  return useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const { data } = await api.get<{ data: AdminUser[] }>('/api/admin/users')
      return data.data
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
