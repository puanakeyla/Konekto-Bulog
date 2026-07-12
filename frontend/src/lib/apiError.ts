// Ambil pesan error dari response API Laravel (field `message`), dengan fallback.
export function apiErrorMessage(err: unknown, fallback = 'Terjadi kesalahan. Coba lagi.'): string {
  return (err as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ?? fallback
}
