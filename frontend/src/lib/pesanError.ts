/**
 * Pesan gagal dari respons API. Server sudah mengirim kalimat yang bisa dibaca orang lewat
 * abort(422, '...'), jadi yang perlu dilakukan hanya menampilkannya alih-alih "Request failed".
 */
export function pesanError(error: unknown, fallback = 'Terjadi kesalahan. Periksa isian lalu coba lagi.') {
  const response = (error as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } } | null)?.response

  const validasi = response?.data?.errors
  if (validasi) {
    const pertama = Object.values(validasi)[0]?.[0]
    if (pertama) return pertama
  }

  return response?.data?.message ?? fallback
}
