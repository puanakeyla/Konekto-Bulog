import imageCompression from 'browser-image-compression'
import api from './api'

// Target ~1-2MB per foto sebelum upload (Bagian 6). Resolusi sisi terpanjang dijaga
// tetap tinggi (2048px) supaya teks pada dokumen seperti nota timbang / surat jalan
// tetap terbaca -- sengaja tidak dikompres agresif. Kualitas awal 0.8 (bukan 0.5-0.6)
// menjaga ketajaman teks; library menurunkan kualitas bertahap hanya jika perlu untuk
// mencapai maxSizeMB.
const OPSI_KOMPRESI = {
  maxSizeMB: 1.5,
  maxWidthOrHeight: 2048,
  initialQuality: 0.8,
  useWebWorker: true,
}

/**
 * Kompres foto di sisi client sebelum upload. Foto yang sudah <= target dilewati
 * (tidak dikompres ulang supaya dokumen kecil yang sudah tajam tidak ikut turun
 * kualitasnya). Kalau kompresi gagal (format tak terduga dll), fallback ke file asli --
 * server tetap memvalidasi mime & batas 5MB, jadi tetap aman.
 */
async function kompresFoto(file: File): Promise<File> {
  if (!file.type.startsWith('image/')) return file
  if (file.size <= OPSI_KOMPRESI.maxSizeMB * 1024 * 1024) return file

  try {
    const compressed = await imageCompression(file, OPSI_KOMPRESI)
    // Bungkus ulang jadi File dengan nama & tipe yang dikenali server (jpeg/png).
    return new File([compressed], file.name, { type: compressed.type || file.type })
  } catch {
    return file
  }
}

export async function uploadFoto(
  idTransaksi: string,
  jenisFoto: string,
  file: File,
  onProgress?: (percent: number) => void,
): Promise<void> {
  const fotoTerkompres = await kompresFoto(file)

  const formData = new FormData()
  formData.append('jenis_foto', jenisFoto)
  formData.append('foto', fotoTerkompres)

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
