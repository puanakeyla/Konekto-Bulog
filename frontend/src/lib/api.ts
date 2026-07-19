import axios from 'axios'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8000',
  withCredentials: true,
  withXSRFToken: true,
  headers: {
    Accept: 'application/json',
  },
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isMeCheck = error.config?.url?.includes('/api/me')
    if (error.response?.status === 401 && !isMeCheck && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)

/**
 * Pesan yang bisa dibaca pengguna dari kegagalan permintaan. Status 403 dipisahkan
 * karena gejalanya paling membingungkan: server menjawab normal, hanya menolak, dan
 * tanpa penjelasan tabel kosong akan terbaca sebagai "datanya memang belum ada".
 */
export function pesanKegagalan(error: unknown): string | null {
  if (!error) return null

  const status = (error as { response?: { status?: number } }).response?.status

  if (status === 403) {
    return 'Akun Anda tidak punya akses ke data ini. Hubungi admin bila seharusnya punya.'
  }
  if (status === 401) {
    return 'Sesi Anda sudah berakhir. Silakan masuk kembali.'
  }
  if (status && status >= 500) {
    return 'Server sedang bermasalah. Coba lagi beberapa saat lagi.'
  }

  return null
}

export default api
