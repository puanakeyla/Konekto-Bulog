import { useEffect, useRef, useState } from 'react'

type Props = {
  label: string
  file: File | null
  onChange: (file: File | null) => void
  progress?: number
  error?: string
}

// Ikon foto/galeri (bukan kamera) untuk tile "Tambah foto".
function PhotoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M1 5.25A2.25 2.25 0 0 1 3.25 3h13.5A2.25 2.25 0 0 1 19 5.25v9.5A2.25 2.25 0 0 1 16.75 17H3.25A2.25 2.25 0 0 1 1 14.75v-9.5Zm1.5 5.81v3.69c0 .414.336.75.75.75h13.5a.75.75 0 0 0 .75-.75v-2.69l-2.22-2.219a.75.75 0 0 0-1.06 0l-1.91 1.909.47.47a.75.75 0 1 1-1.06 1.061l-6.03-6.03a.75.75 0 0 0-1.06 0l-2.97 2.97ZM12 7a1 1 0 1 1 2 0 1 1 0 0 1-2 0Z" clipRule="evenodd" />
    </svg>
  )
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path fillRule="evenodd" d="M1 8a2 2 0 0 1 2-2h.93a2 2 0 0 0 1.664-.89l.812-1.22A2 2 0 0 1 8.07 3h3.86a2 2 0 0 1 1.664.89l.812 1.22A2 2 0 0 0 16.07 6H17a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8Zm9.5 6a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" clipRule="evenodd" />
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

export default function FotoPicker({ label, file, onChange, progress, error }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const captureRef = useRef<HTMLInputElement>(null)
  const videoRef = useRef<HTMLVideoElement>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [zoom, setZoom] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [stream, setStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  useEffect(() => {
    if (!preview) setZoom(false)
  }, [preview])

  // Stop kamera saat stream berganti / komponen unmount.
  useEffect(() => {
    if (!stream) return
    return () => stream.getTracks().forEach((t) => t.stop())
  }, [stream])

  // Pasang stream ke elemen video saat modal kamera terbuka.
  useEffect(() => {
    if (cameraOpen && stream && videoRef.current) videoRef.current.srcObject = stream
  }, [cameraOpen, stream])

  // Tombol Escape menutup lightbox / menu / kamera.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setZoom(false)
      setMenuOpen(false)
      closeCamera()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Tutup menu saat klik di luar area komponen.
  useEffect(() => {
    if (!menuOpen) return
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpen])

  const uploading = progress !== undefined && progress < 100
  const done = progress === 100

  const closeCamera = () => {
    setStream(null)
    setCameraOpen(false)
  }

  // Kamera: coba webcam (desktop & HP via https/localhost); jika tak didukung, fallback input capture (HP via http).
  const pickCamera = async () => {
    setMenuOpen(false)
    if (!navigator.mediaDevices?.getUserMedia) {
      captureRef.current?.click()
      return
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      setStream(s)
      setCameraOpen(true)
    } catch {
      // izin ditolak / tidak ada kamera -> fallback ke input file bawaan.
      captureRef.current?.click()
    }
  }

  const pickFile = () => {
    setMenuOpen(false)
    galleryRef.current?.click()
  }

  const capturePhoto = () => {
    const video = videoRef.current
    if (!video || !video.videoWidth) return
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d')?.drawImage(video, 0, 0)
    canvas.toBlob(
      (blob) => {
        if (blob) onChange(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }))
        closeCamera()
      },
      'image/jpeg',
      0.9,
    )
  }

  return (
    <div ref={rootRef}>
      <span className="label">{label}</span>

      <div className="relative">
        {file ? (
          <div className="flex min-h-20 items-center gap-3 rounded-lg border border-border bg-white p-3">
            <button
              type="button"
              onClick={() => setZoom(true)}
              title="Klik untuk memperbesar"
              className="group relative h-16 w-16 flex-shrink-0 overflow-hidden rounded"
            >
              {preview && <img src={preview} alt={label} className="h-16 w-16 object-cover" />}
              <span className="absolute inset-0 flex items-center justify-center text-white opacity-0 transition-all group-hover:bg-black/40 group-hover:opacity-100">
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 1 0 3.472 9.77l3.879 3.88a.75.75 0 1 0 1.06-1.06l-3.879-3.88A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Zm4-2a.75.75 0 0 1 .75.75v.5h.5a.75.75 0 0 1 0 1.5h-.5v.5a.75.75 0 0 1-1.5 0v-.5h-.5a.75.75 0 0 1 0-1.5h.5v-.5A.75.75 0 0 1 9 7Z" clipRule="evenodd" />
                </svg>
              </span>
            </button>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-primary-dark">{file.name}</p>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  disabled={uploading}
                  className="text-sm font-semibold text-primary disabled:opacity-50"
                >
                  Ganti
                </button>
                {!uploading && (
                  <button type="button" onClick={() => onChange(null)} className="text-sm text-danger">
                    Hapus
                  </button>
                )}
              </div>

              {uploading && (
                <div className="mt-2">
                  <div className="h-1.5 overflow-hidden rounded-full bg-border">
                    <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                  </div>
                  <span className="text-xs text-gray-500">{progress}%</span>
                </div>
              )}
              {done && <p className="mt-1 text-xs text-success">Terupload</p>}
              {error && <p className="mt-1 text-xs text-danger">{error}</p>}
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            className="group flex min-h-[112px] w-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-white p-4 text-center transition-colors hover:border-primary hover:bg-primary-tint/40"
          >
            <span className="grid h-12 w-12 place-items-center rounded-full bg-primary-tint text-primary transition-colors group-hover:bg-primary group-hover:text-white">
              <PhotoIcon className="h-6 w-6" />
            </span>
            <span className="text-sm font-semibold text-primary-dark">Tambah foto</span>
            <span className="text-xs text-gray-400">Kamera atau file</span>
          </button>
        )}

        {/* Menu pilihan sumber foto. */}
        {menuOpen && (
          <div className="absolute left-1/2 top-full z-20 mt-2 w-56 -translate-x-1/2 overflow-hidden rounded-lg border border-border bg-white shadow-lg">
            <button
              type="button"
              onClick={pickCamera}
              className="flex w-full items-center gap-2.5 px-3.5 py-3 text-sm font-medium text-primary-dark transition-colors hover:bg-primary-tint"
            >
              <CameraIcon className="h-5 w-5 text-primary" />
              Tambah lewat kamera
            </button>
            <button
              type="button"
              onClick={pickFile}
              className="flex w-full items-center gap-2.5 border-t border-border px-3.5 py-3 text-sm font-medium text-primary-dark transition-colors hover:bg-primary-tint"
            >
              <UploadIcon className="h-5 w-5 text-primary" />
              Tambah lewat file
            </button>
          </div>
        )}
      </div>

      {/* Input tersembunyi. captureRef = fallback kamera HP di jaringan http. */}
      <input
        ref={captureRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/png"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />

      {/* Modal kamera (webcam) -- berfungsi di desktop & HP (https/localhost). */}
      {cameraOpen && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/90 p-4">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="max-h-[70vh] w-auto max-w-full rounded-lg bg-black shadow-2xl"
          />
          <div className="mt-5 flex items-center gap-3">
            <button
              type="button"
              onClick={capturePhoto}
              className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-primary-dark shadow-sm transition-colors hover:bg-white"
            >
              <CameraIcon className="h-5 w-5" />
              Ambil Foto
            </button>
            <button
              type="button"
              onClick={closeCamera}
              className="rounded-lg border border-white/25 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20"
            >
              Batal
            </button>
          </div>
        </div>
      )}

      {/* Lightbox -- lihat foto ukuran besar. */}
      {zoom && preview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setZoom(false)}
          role="dialog"
          aria-modal="true"
          aria-label={`Pratinjau ${label}`}
        >
          <figure className="flex max-h-full max-w-3xl flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <img src={preview} alt={label} className="max-h-[80vh] w-auto rounded-lg object-contain shadow-2xl" />
            <figcaption className="mt-3 text-sm font-medium text-white/80">{label}</figcaption>
          </figure>
          <button
            type="button"
            onClick={() => setZoom(false)}
            aria-label="Tutup"
            className="absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white transition-colors hover:bg-white/20"
          >
            <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
}
