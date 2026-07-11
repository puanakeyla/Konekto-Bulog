import { useEffect, useRef, useState } from 'react'

type Props = {
  label: string
  file: File | null
  onChange: (file: File | null) => void
  progress?: number
  error?: string
}

export default function FotoPicker({ label, file, onChange, progress, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!file) {
      setPreview(null)
      return
    }
    const url = URL.createObjectURL(file)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  const uploading = progress !== undefined && progress < 100
  const done = progress === 100

  return (
    <div>
      <span className="block text-sm text-primary-dark mb-1">{label}</span>
      <div className="border border-dashed border-border rounded-md p-3 flex items-center gap-3">
        {preview ? (
          <img src={preview} alt={label} className="w-16 h-16 object-cover rounded flex-shrink-0" />
        ) : (
          <div className="w-16 h-16 rounded bg-primary-tint flex items-center justify-center text-gray-400 text-[10px] text-center flex-shrink-0">
            Belum ada
          </div>
        )}

        <div className="flex-1 min-w-0">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png"
            capture="environment"
            className="hidden"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              className="text-sm text-primary font-medium disabled:opacity-50"
            >
              {file ? 'Ganti Foto' : 'Ambil/Pilih Foto'}
            </button>
            {file && !uploading && (
              <button
                type="button"
                onClick={() => onChange(null)}
                className="text-sm text-danger"
              >
                Hapus
              </button>
            )}
          </div>

          {uploading && (
            <div className="mt-2">
              <div className="h-1.5 bg-border rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="text-xs text-gray-500">{progress}%</span>
            </div>
          )}
          {done && <p className="text-xs text-success mt-1">Terupload</p>}
          {error && <p className="text-xs text-danger mt-1">{error}</p>}
        </div>
      </div>
    </div>
  )
}
