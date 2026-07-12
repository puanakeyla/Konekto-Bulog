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
}

function muatGambar(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Gagal membaca gambar.'))
    }
    img.src = url
  })
}

async function kompresGambarBrowser(file: File): Promise<File> {
  const img = await muatGambar(file)
  const rasio = Math.min(1, OPSI_KOMPRESI.maxWidthOrHeight / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * rasio))
  const height = Math.max(1, Math.round(img.naturalHeight * rasio))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return file

  ctx.drawImage(img, 0, 0, width, height)

  const type = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, type, OPSI_KOMPRESI.initialQuality)
  })

  if (!blob || blob.size >= file.size) return file

  return new File([blob], file.name, { type })
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
    return await kompresGambarBrowser(file)
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
