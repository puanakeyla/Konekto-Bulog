import api from './api'

export async function uploadFoto(
  idTransaksi: string,
  jenisFoto: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const formData = new FormData()
  formData.append('jenis_foto', jenisFoto)
  formData.append('foto', file)

  await api.post(`/api/transaksi/${encodeURIComponent(idTransaksi)}/foto`, formData, {
    onUploadProgress: (event) => {
      if (onProgress && event.total) {
        onProgress(Math.round((event.loaded / event.total) * 100))
      }
    },
  })
}

/**
 * Upload tiap foto yang dipilih secara berurutan (bukan paralel) supaya progress
 * per-file jelas dan tidak membebani koneksi HP di lapangan (Bagian 7.2). Kegagalan
 * satu file tidak menghentikan yang lain -- dicatat di `gagal` supaya bisa di-retry
 * (lihat keputusan precondition upload vs locked_at).
 */
export async function uploadSemuaFoto(
  idTransaksi: string,
  fotos: Record<string, File | null>,
  onProgress: (jenisFoto: string, percent: number) => void,
): Promise<{ gagal: string[] }> {
  const gagal: string[] = []

  for (const [jenisFoto, file] of Object.entries(fotos)) {
    if (!file) continue

    try {
      onProgress(jenisFoto, 0)
      await uploadFoto(idTransaksi, jenisFoto, file, (percent) => onProgress(jenisFoto, percent))
      onProgress(jenisFoto, 100)
    } catch {
      gagal.push(jenisFoto)
    }
  }

  return { gagal }
}
