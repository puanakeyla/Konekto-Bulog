import { createContext, useContext, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

type Role = { id: number; nama_role: string }
type User = {
  id: number
  username: string
  role_id: number
  nama_maklon: string | null
  kecamatan: string | null
  kabupaten: string | null
  role: Role
}

type AuthContextValue = {
  user: User | undefined
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data: user, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await api.get<{ user: User }>('/api/me')
      return data.user
    },
    retry: false,
  })

  const login = async (username: string, password: string) => {
    await api.get('/sanctum/csrf-cookie')
    await api.post('/api/login', { username, password })
    await queryClient.invalidateQueries({ queryKey: ['me'] })
  }

  const logout = async () => {
    await api.post('/api/logout')
    queryClient.setQueryData(['me'], undefined)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
