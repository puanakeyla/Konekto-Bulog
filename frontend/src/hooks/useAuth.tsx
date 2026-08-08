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
  /** Diisi admin lewat Kelola User saat user perlu memperbaiki datanya yang sudah terkunci. */
  akses_edit_dibuka_at: string | null
  role: Role
}

type AuthContextValue = {
  /** `null` = sudah logout secara eksplisit; `undefined` = belum/gagal dimuat. */
  user: User | null | undefined
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()

  const { data: user, isLoading } = useQuery<User | null>({
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
    // Ditulis DULUAN supaya layar langsung pindah ke /login, tidak menunggu request selesai.
    // Sebelumnya nilainya `undefined`, dan React Query memperlakukan `undefined` sebagai
    // "batalkan update" -- cache tidak pernah berubah, jadi UI baru sadar sudah logout ketika
    // ada query lain yang kena 401. Itu penyebab "keluar role lama banget".
    queryClient.setQueryData(['me'], null)

    try {
      await api.post('/api/logout')
    } finally {
      // Buang cache role lama; tanpa ini login berikutnya sempat menampilkan data akun sebelumnya.
      // Kunci 'me' dipertahankan supaya nilai null di atas tidak ikut terhapus dan memicu refetch.
      queryClient.removeQueries({ predicate: (query) => query.queryKey[0] !== 'me' })
    }
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
