import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import api, { pesanKegagalan } from '../lib/api'
import { bukaTabBaru } from '../lib/bukaTabBaru'
import { useDokumenTransaksi, type FotoTersimpan } from '../hooks/useFotoTransaksi'
import { labelFoto, labelRoleFoto } from '../lib/fotoDokumen'
import ModalPortal from './ModalPortal'

/**
 * Galeri dokumen read-only per transaksi: thumbnail + tombol Lihat/Download tiap foto.
 * Dibuka dari tabel Rekap untuk semua role. Otorisasi sepenuhnya di backend -- daftar
 * yang dikembalikan sudah disaring per izin (mis. foto surat jalan JP disembunyikan).
 */
export default function DokumenGaleriModal({ transaksiId, onClose }: { transaksiId: string; onClose: () => void }) {
  const { data: items = [], isLoading, isError, error } = useDokumenTransaksi(transaksiId)

  // Tutup dengan Escape.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-white/40 bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-border bg-gradient-to-r from-primary-dark via-primary to-primary-dark px-6 py-5 text-white">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-accent">Dokumen Transaksi</p>
            <h2 className="mt-1 text-2xl font-extrabold">{transaksiId}</h2>
            <p className="mt-1 text-sm text-white/70">Lihat atau unduh foto yang sudah dikirim, kapan saja.</p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-bold transition-colors hover:bg-white/20">
            Tutup
          </button>
        </div>

        <div className="overflow-y-auto bg-surface px-6 py-5">
          {isLoading && <div className="panel px-4 py-3 text-sm text-muted">Memuat dokumen...</div>}

          {!isLoading && isError && (
            <div className="empty-state">
              <div className="empty-title">Gagal memuat dokumen</div>
              <p className="empty-copy">{pesanKegagalan(error) ?? 'Dokumen tidak dapat diambil dari server. Coba lagi.'}</p>
            </div>
          )}

          {!isLoading && !isError && items.length === 0 && (
            <div className="empty-state">
              <div className="empty-title">Belum ada dokumen</div>
              <p className="empty-copy">Transaksi ini belum memiliki foto yang dapat Anda lihat.</p>
            </div>
          )}

          {!isLoading && !isError && items.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((item) => (
                <FotoKartu key={`${item.role}:${item.jenis_foto}`} transaksiId={transaksiId} item={item} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
    </ModalPortal>
  )
}

function FotoKartu({ transaksiId, item }: { transaksiId: string; item: FotoTersimpan }) {
  // thumb_url sudah ikut di response daftar -- kartu tidak lagi menembak endpoint link
  // sendiri saat dirender (dulu galeri 7 foto = 8 request).
  const [src, setSrc] = useState<string | null>(item.thumb_url)
  // Thumbnail digenerate lewat queue; di dev tanpa worker file 'thumb' bisa belum ada.
  // Karena itu kalau img gagal termuat -> fallback ke gambar full-size.
  const [pakaiFull, setPakaiFull] = useState(false)
  const [gagalTampil, setGagalTampil] = useState(false)
  const [busy, setBusy] = useState<null | 'lihat' | 'download'>(null)

  const urlFoto = (opts: { download?: boolean } = {}) =>
    `/api/transaksi/${encodeURIComponent(transaksiId)}/foto/${item.jenis_foto}${opts.download ? '?download=1' : ''}`

  const handleImgError = async () => {
    if (pakaiFull) { setGagalTampil(true); return }
    setPakaiFull(true)
    try {
      const { data } = await api.get<{ url: string }>(urlFoto())
      setSrc(data.url)
    } catch {
      setGagalTampil(true)
    }
  }

  // Unduhan tidak kena popup blocker: <a download> yang diklik programatis bukan popup.
  const unduh = async () => {
    setBusy('download')
    try {
      const { data } = await api.get<{ url: string }>(urlFoto({ download: true }))
      const a = document.createElement('a')
      a.href = data.url
      a.rel = 'noopener'
      document.body.appendChild(a)
      a.click()
      a.remove()
    } catch (err) {
      toast.error(pesanKegagalan(err) ?? 'Dokumen tidak dapat dibuka.')
    } finally {
      setBusy(null)
    }
  }

  const lihat = () => {
    setBusy('lihat')
    return bukaTabBaru(async () => {
      const { data } = await api.get<{ url: string }>(urlFoto({ download: false }))
      return data.url
    })
      .catch((err: unknown) => toast.error(pesanKegagalan(err) ?? 'Dokumen tidak dapat dibuka.'))
      .finally(() => setBusy(null))
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm">
      <div className="flex aspect-[4/3] items-center justify-center bg-slate-100">
        {gagalTampil || !src ? (
          <span className="px-3 text-center text-xs font-semibold text-slate-400">
            {gagalTampil ? 'Pratinjau tidak tersedia' : 'Memuat...'}
          </span>
        ) : (
          <img src={src} alt={labelFoto(item.jenis_foto)} loading="lazy" className="h-full w-full object-cover" onError={handleImgError} />
        )}
      </div>
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <span className="text-sm font-bold text-primary-dark">{labelFoto(item.jenis_foto)}</span>
          <span className="shrink-0 rounded bg-primary-tint px-2 py-0.5 text-[0.6rem] font-bold uppercase text-primary">{labelRoleFoto(item.role)}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={lihat} disabled={busy === 'lihat'} className="btn btn-ghost flex-1 border border-border bg-white px-3 py-1.5 text-xs">
            {busy === 'lihat' ? 'Membuka...' : 'Lihat'}
          </button>
          <button type="button" onClick={unduh} disabled={busy === 'download'} className="btn btn-ghost flex-1 border border-primary/20 bg-primary-tint px-3 py-1.5 text-xs text-primary">
            {busy === 'download' ? 'Mengunduh...' : 'Download'}
          </button>
        </div>
      </div>
    </div>
  )
}
