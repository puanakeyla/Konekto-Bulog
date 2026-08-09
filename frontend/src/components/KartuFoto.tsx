import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { pesanKegagalan } from '../lib/api'
import { bukaTabBaru } from '../lib/bukaTabBaru'
import ModalPortal from './ModalPortal'

/**
 * Satu kartu foto: pratinjau + tombol aksinya. SATU bentuk untuk semua tempat foto tampil --
 * galeri Rekap Sergab, galeri Rekap Pengolahan, dan panel dokumen di dalam kedua modal edit.
 * Dulu tiap tempat punya kartunya sendiri, dan panel edit malah tanpa pratinjau sama sekali,
 * sehingga mengganti foto berarti menebak file mana yang sedang dilihat.
 *
 * Kartu ini TIDAK tahu endpoint mana pun: pemanggil yang mengoper cara mengambil URL aslinya dan
 * (kalau boleh) cara mengganti/menghapus, karena rantai Sergab dan Pengolahan memakai jalur API
 * yang berbeda. Tombol Ganti & Hapus muncul hanya kalau callback-nya diberikan.
 */
type Props = {
  label: string
  /** Penanda kecil di kanan label, mis. tahap pemilik foto. */
  badge?: string
  /** URL pratinjau (biasanya konversi 'thumb'). Null berarti fotonya belum ada. */
  thumbUrl?: string | null
  /** URL bertanda tangan untuk ukuran penuh -- dipakai Lihat, Download, dan cadangan pratinjau. */
  ambilAsli: (opts?: { download?: boolean }) => Promise<string | undefined>
  onGanti?: (file: File) => Promise<void>
  onHapus?: () => Promise<void>
}

type Busy = 'lihat' | 'download' | 'ganti' | 'hapus' | null

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm9 7a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" clipRule="evenodd" />
    </svg>
  )
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M9.25 13.25a.75.75 0 0 0 1.5 0V4.66l1.95 2.1a.75.75 0 1 0 1.1-1.02l-3.25-3.5a.75.75 0 0 0-1.1 0L6.2 5.74a.75.75 0 1 0 1.1 1.02l1.95-2.1v8.59Z" />
      <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
    </svg>
  )
}

export default function KartuFoto({ label, badge, thumbUrl, ambilAsli, onGanti, onHapus }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const captureRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Thumbnail digenerate lewat queue; di dev tanpa worker berkas 'thumb' bisa belum ada. Karena
  // itu kalau <img> gagal termuat, pratinjaunya jatuh ke gambar ukuran penuh.
  const [urlAsli, setUrlAsli] = useState<string | null>(null)
  const [gagalTampil, setGagalTampil] = useState(false)
  const [busy, setBusy] = useState<Busy>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)
  const src = urlAsli ?? thumbUrl ?? null

  // Foto baru (setelah Ganti/Hapus, thumbUrl-nya berganti) berhak dicoba dari nol: tanpa ini
  // kartu yang tadinya gagal termuat akan terus menampilkan "Pratinjau tidak tersedia".
  useEffect(() => {
    setUrlAsli(null)
    setGagalTampil(false)
  }, [thumbUrl])

  useEffect(() => {
    if (!stream) return
    return () => stream.getTracks().forEach((track) => track.stop())
  }, [stream])

  useEffect(() => {
    if (cameraOpen && stream && videoRef.current) videoRef.current.srcObject = stream
  }, [cameraOpen, stream])

  useEffect(() => {
    if (!menuOpen) return
    const onDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setMenuOpen(false)
      closeCamera()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const jalankan = async (tanda: Exclude<Busy, null>, aksi: () => Promise<unknown>, gagal: string) => {
    setBusy(tanda)
    try {
      await aksi()
    } catch (err) {
      toast.error(pesanKegagalan(err) ?? gagal)
    } finally {
      setBusy(null)
    }
  }

  const pratinjauGagal = async () => {
    if (urlAsli) {
      setGagalTampil(true)
      return
    }
    try {
      const url = await ambilAsli()
      if (url) setUrlAsli(url)
      else setGagalTampil(true)
    } catch {
      setGagalTampil(true)
    }
  }

  // Unduhan tidak kena popup blocker: <a download> yang diklik programatis bukan popup.
  const unduh = () => jalankan('download', async () => {
    const url = await ambilAsli({ download: true })
    if (!url) throw new Error('kosong')
    const a = document.createElement('a')
    a.href = url
    a.rel = 'noopener'
    document.body.appendChild(a)
    a.click()
    a.remove()
  }, 'Dokumen tidak dapat diunduh.')

  const lihat = () => jalankan('lihat', () => bukaTabBaru(() => ambilAsli()), 'Dokumen tidak dapat dibuka.')

  const closeCamera = () => {
    setStream(null)
    setCameraOpen(false)
  }

  const pilihKamera = async () => {
    setMenuOpen(false)
    if (!navigator.mediaDevices?.getUserMedia) {
      captureRef.current?.click()
      return
    }
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      setStream(mediaStream)
      setCameraOpen(true)
    } catch {
      captureRef.current?.click()
    }
  }

  const pilihFile = () => {
    setMenuOpen(false)
    fileRef.current?.click()
  }

  const ambilDariKamera = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob((blob) => {
      if (blob) ganti(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }))
      closeCamera()
    }, 'image/jpeg', 0.9)
  }

  const ganti = (file: File | null) => {
    if (!file || !onGanti) return
    return jalankan('ganti', async () => {
      await onGanti(file)
      toast.success(`${label} diperbarui.`)
    }, 'Gagal mengganti dokumen.')
  }

  const hapus = () => {
    if (!onHapus || !window.confirm(`Hapus ${label}?`)) return
    return jalankan('hapus', async () => {
      await onHapus()
      toast.success(`${label} dihapus.`)
    }, 'Gagal menghapus dokumen.')
  }

  const ada = !!thumbUrl || !!urlAsli

  return (
    <div ref={rootRef} className="overflow-visible rounded-xl border border-border bg-white shadow-sm">
      {/* Tinggi TETAP, bukan rasio: kartu ini dipakai di grid selebar 2 kolom sampai 3 kolom, dan
          dengan aspect-ratio kartu di grid 2 kolom membengkak sampai menelan seluruh modal edit.
          object-cover tetap membuat gambarnya terisi penuh berapa pun lebar kolomnya. */}
      <div className="flex h-40 items-center justify-center overflow-hidden rounded-t-xl bg-slate-100">
        {!src || gagalTampil ? (
          <span className="px-3 text-center text-xs font-semibold text-slate-400">
            {gagalTampil ? 'Pratinjau tidak tersedia' : 'Belum diunggah'}
          </span>
        ) : (
          <img src={src} alt={label} loading="lazy" className="h-full w-full object-cover" onError={pratinjauGagal} />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-bold text-primary-dark">{label}</span>
          {badge && <span className="shrink-0 rounded bg-primary-tint px-2 py-0.5 text-[0.6rem] font-bold uppercase text-primary">{badge}</span>}
        </div>
        {/* Grid 2 kolom, bukan flex-wrap: jumlah tombolnya berubah-ubah (2 di galeri baca-saja,
            3 untuk pemegang jatah, 4 untuk admin) dan flex-wrap membuat sisanya jatuh sebagai
            baris ragged selebar penuh. Grid selalu rapi berapa pun jumlahnya. */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          {/* Tombol yang butuh fotonya ada dimatikan saat slotnya masih kosong -- kalau tidak,
              satu-satunya jawaban server adalah 404 yang muncul sebagai toast gagal. */}
          <button type="button" onClick={lihat} disabled={!ada || busy === 'lihat'} className="btn btn-ghost border border-border bg-white px-3 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-50">
            {busy === 'lihat' ? 'Membuka...' : 'Lihat'}
          </button>
          <button type="button" onClick={unduh} disabled={!ada || busy === 'download'} className="btn btn-ghost border border-primary/20 bg-primary-tint px-3 py-1.5 text-xs text-primary disabled:cursor-not-allowed disabled:opacity-50">
            {busy === 'download' ? 'Mengunduh...' : 'Download'}
          </button>
          {onGanti && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setMenuOpen((value) => !value)}
                disabled={busy === 'ganti'}
                className="btn btn-ghost w-full justify-center border border-primary/20 bg-primary-tint px-3 py-1.5 text-xs text-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy === 'ganti' ? 'Mengunggah...' : ada ? 'Ganti' : 'Unggah'}
              </button>
              {menuOpen && (
                <div className="absolute left-1/2 top-full z-30 mt-2 w-48 -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-white text-left shadow-lg">
                  <button type="button" onClick={pilihKamera} className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-semibold text-primary-dark hover:bg-primary-tint">
                    <CameraIcon className="h-4 w-4 text-primary" />
                    Ambil dari kamera
                  </button>
                  <button type="button" onClick={pilihFile} className="flex w-full items-center gap-2 border-t border-border px-3 py-2.5 text-xs font-semibold text-primary-dark hover:bg-primary-tint">
                    <UploadIcon className="h-4 w-4 text-primary" />
                    Pilih file
                  </button>
                </div>
              )}
              <input
                ref={captureRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={busy === 'ganti'}
                onChange={(event) => {
                  ganti(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
              />
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png"
                className="hidden"
                disabled={busy === 'ganti'}
                onChange={(event) => {
                  ganti(event.target.files?.[0] ?? null)
                  event.target.value = ''
                }}
              />
            </div>
          )}
          {onHapus && (
            <button type="button" onClick={hapus} disabled={!ada || busy === 'hapus'} className="btn btn-ghost border border-danger/20 bg-danger-bg px-3 py-1.5 text-xs text-danger disabled:cursor-not-allowed disabled:opacity-50">
              {busy === 'hapus' ? 'Menghapus...' : 'Hapus'}
            </button>
          )}
        </div>
      </div>

      {cameraOpen && (
        <ModalPortal>
          <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
            <video ref={videoRef} autoPlay playsInline muted className="max-h-[75vh] w-full max-w-3xl rounded-lg bg-black object-contain" />
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              <button type="button" onClick={closeCamera} className="btn btn-secondary bg-white text-primary-dark">Batal</button>
              <button type="button" onClick={ambilDariKamera} className="btn btn-primary">Ambil Foto</button>
            </div>
          </div>
        </ModalPortal>
      )}
    </div>
  )
}
