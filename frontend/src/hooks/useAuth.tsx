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

  /**
   * JANGAN diganti kembali jadi `setQueryData(['me'], undefined)`.
   *
   * TanStack Query memperlakukan nilai `undefined` sebagai "batalkan update" -- lihat
   * queryClient.setQueryData(): `if (data === void 0) return`. Jadi baris itu TIDAK
   * menghapus apa pun: cache `me` tetap berisi user lama, ProtectedRoute masih melihat
   * user yang sudah logout, dan halaman baru berpindah ke /login jauh kemudian, saat ada
   * request lain yang kebetulan kena 401 lalu dipaksa reload penuh oleh interceptor axios.
   * Itulah penyebab "logout lama banget".
   *
   * clear() membuang seluruh cache, bukan cuma `me` -- sekaligus mencegah user berikutnya
   * yang login di browser sama melihat sisa data transaksi/dashboard milik user sebelumnya.
   */
  const logout = async () => {
    await api.post('/api/logout')
    queryClient.clear()
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
