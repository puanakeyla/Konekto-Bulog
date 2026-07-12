import { useEffect, type ReactNode } from 'react'

type Props = {
  open: boolean
  title: string
  description: ReactNode
  confirmLabel: string
  confirmVariant?: 'primary' | 'danger'
  loading?: boolean
  confirmDisabled?: boolean
  error?: string | null
  onConfirm: () => void
  onCancel: () => void
  children?: ReactNode
}

/**
 * Dialog konfirmasi untuk aksi ireversibel (kunci/majukan state). Request API baru
 * dikirim lewat onConfirm -- SETELAH user menekan tombol konfirmasi di sini, bukan
 * saat menekan tombol aksi awal. Escape / klik backdrop = batal (kecuali saat loading).
 */
export default function ConfirmDialog({
  open, title, description, confirmLabel, confirmVariant = 'primary',
  loading = false, confirmDisabled = false, error, onConfirm, onCancel, children,
}: Props) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !loading) onCancel() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, loading, onCancel])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onCancel() }}
    >
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
        <h3 className="text-base font-bold text-primary-dark">{title}</h3>
        <div className="mt-2 text-sm leading-6 text-gray-600">{description}</div>
        {children}
        {error && <div className="alert-danger mt-3">{error}</div>}
        <div className="mt-5 flex justify-end gap-3">
          <button type="button" className="btn btn-ghost border border-border" onClick={onCancel} disabled={loading}>Batal</button>
          <button
            type="button"
            className={`btn ${confirmVariant === 'danger' ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={loading || confirmDisabled}
          >
            {loading ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
