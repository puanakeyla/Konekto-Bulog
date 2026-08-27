import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import { usePoFoto } from '../../hooks/usePoFoto'
import ConfirmDialog from '../ConfirmDialog'
import PoProgressInfo from './PoProgressInfo'
import PoTransaksiRows from './PoTransaksiRows'

const FOTO_SERGAB = [
  { key: 'foto_barang', label: 'Foto Barang', aliases: ['foto_barang', 'foto_gabah'] },
  { key: 'foto_serah_terima', label: 'Foto Serah Terima', aliases: ['foto_serah_terima'] },
  { key: 'foto_bukti_pembayaran', label: 'Foto Bukti Pembayaran', aliases: ['foto_bukti_pembayaran', 'foto_pembayaran', 'foto_kwitansi'] },
  { key: 'foto_surat_pernyataan_usia_panen', label: 'Foto Surat Pernyataan', aliases: ['foto_surat_pernyataan_usia_panen', 'foto_surat_pernyataan'] },
] as const

const statusOptions: { value: PoItem['status']; label: string }[] = [
  { value: 'lengkap', label: 'Lengkap' },
  { value: 'kwitansi_belum_upload', label: 'Kwitansi belum upload' },
  { value: 'foto_belum_lengkap', label: 'Foto belum lengkap' },
  { value: 'dibatalkan', label: 'Dibatalkan' },
]

/**
 * Langkah PENUTUP Pengadaan. PO sudah dikirim ke Keuangan saat No. SPP disimpan, jadi di sini
 * tinggal menetapkan Status Sergab: 'lengkap' menandai seluruh transaksi anggota PO selesai.
 * Panel Foto Sergab menampilkan preview foto yang sudah diinput sebelumnya.
 */
export default function PoStatusSergabForm({ po, onChanged }: { po: PoItem; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({})
  const { data: fotos = [], isError: fotoError } = usePoFoto(po.id)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [statusPo, setStatusPo] = useState<PoItem['status']>(po.status === 'proses' ? 'lengkap' : po.status)
  const [confirmSimpan, setConfirmSimpan] = useState(false)

  useEffect(() => setStatusPo(po.status === 'proses' ? 'lengkap' : po.status), [po.status])

  const invalidateFoto = () => {
    queryClient.invalidateQueries({ queryKey: ['po-foto', po.id] })
  }

  const uploadMutation = useMutation({
    mutationFn: async ({ jenisFoto, file }: { jenisFoto: string; file: File }) => {
      const formData = new FormData()
      formData.append('jenis_foto', jenisFoto)
      formData.append('foto', file)
      return api.post(`/api/po/${po.id}/foto`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
    },
    onSuccess: (_res, { jenisFoto }) => {
      invalidateFoto()
      toast.success(`${FOTO_SERGAB.find((f) => f.key === jenisFoto)?.label ?? jenisFoto} berhasil diunggah.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal mengunggah foto.')),
  })

  const deleteMutation = useMutation({
    mutationFn: (jenisFoto: string) => api.delete(`/api/po/${po.id}/foto/${jenisFoto}`),
    onSuccess: (_res, jenisFoto) => {
      invalidateFoto()
      toast.success(`${FOTO_SERGAB.find((f) => f.key === jenisFoto)?.label ?? jenisFoto} berhasil dihapus.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menghapus foto.')),
  })

  const handleUpload = (jenisFoto: string, file: File | undefined) => {
    if (!file) return
    uploadMutation.mutate({ jenisFoto, file })
  }

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}`, { status: statusPo }),
    // Tetap di halaman: daftar PO di-invalidate sehingga kartu ini hilang/berganti sendiri.
    onSuccess: () => {
      setConfirmSimpan(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['antrean-transaksi'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ringkasan'] })
      onChanged?.()
      toast.success(statusPo === 'dibatalkan'
        ? `PO ${po.no_po} dibatalkan dan transaksi kembali ke Pengadaan.`
        : statusPo === 'lengkap'
        ? `Status Sergab PO ${po.no_po} lengkap. ${po.po_detail.length} transaksi anggotanya ditandai selesai.`
        : `Status Sergab PO ${po.no_po} tersimpan. Transaksinya belum ditutup karena statusnya belum Lengkap.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan data Pengadaan.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmSimpan(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className={`badge ${statusPo === 'dibatalkan' ? 'badge-danger' : statusPo === 'lengkap' ? 'badge-success' : 'badge-warning'}`}>
          {statusPo === 'dibatalkan' ? 'Dibatalkan' : statusPo === 'lengkap' ? 'Siap ditutup' : 'Belum lengkap'}
        </span>
      </div>
      <PoProgressInfo
        posisi={po.no_spp ? 'Keuangan (sudah dikirim)' : 'Pengadaan'}
        status={statusPo === 'lengkap' ? 'Siap ditutup' : statusPo === 'dibatalkan' ? 'Dibatalkan' : 'Belum lengkap'}
        berikutnya={statusPo === 'lengkap' ? 'Transaksi selesai' : statusPo === 'dibatalkan' ? 'Kembali ke Pengadaan' : 'Tetap di Pengadaan'}
        keterangan={statusPo === 'dibatalkan'
          ? 'PO dibatalkan. Transaksi kembali ke Pengadaan dan bisa digabung ulang bila perlu.'
          : 'Status Sergab adalah langkah PENUTUP. PO sudah dikirim ke Keuangan saat No. SPP disimpan; memilih Lengkap di sini menandai seluruh transaksi anggotanya selesai.'}
      />
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <PoTransaksiRows po={po} />

      <section className="mt-4 border-t border-border pt-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <div className="section-title">Foto Sergab</div>
            <p className="page-subtitle">Lengkapi, ganti, atau hapus foto sebelum Status Sergab disimpan.</p>
          </div>
          <span className="badge">{fotos.length} foto</span>
        </div>
        {fotoError && <div className="alert-warning mb-3">Foto Sergab belum dapat dimuat.</div>}
        <div className="grid gap-3 @md:grid-cols-2">
          {FOTO_SERGAB.map((item) => {
            const foto = fotos.find((entry) => entry.jenis_foto === item.key)
            return (
              <div key={item.key} className="overflow-hidden rounded-lg border border-border bg-white">
                <div className="aspect-[4/3] bg-surface">
                  {foto
                    ? <img src={foto.thumb_url} alt={item.label} className="h-full w-full object-cover" />
                    : <div className="grid h-full place-items-center text-xs text-muted">Belum diunggah</div>}
                </div>
                <div className="flex items-center justify-between gap-2 px-3 py-2">
                  <span className="text-sm font-semibold text-primary-dark">{item.label}</span>
                  <span className="badge text-[0.6rem]">SERGAB</span>
                </div>
                <div className="flex flex-wrap gap-2 px-3 pb-3">
                  {foto && (
                    <>
                      <button type="button" onClick={() => setPreviewUrl(foto.view_url ?? foto.thumb_url)} className="btn btn-ghost border border-border bg-white px-3 py-1 text-xs">Lihat</button>
                      <a href={foto.download_url ?? foto.thumb_url} target="_blank" rel="noreferrer" className="btn btn-ghost border border-border bg-white px-3 py-1 text-xs">Download</a>
                    </>
                  )}
                  <input ref={(el) => { fileRefs.current[item.key] = el }} type="file" accept="image/jpeg,image/png" className="hidden" onChange={(e) => handleUpload(item.key, e.target.files?.[0])} />
                  <button type="button" onClick={() => fileRefs.current[item.key]?.click()} disabled={uploadMutation.isPending} className="btn btn-ghost border border-border bg-white px-3 py-1 text-xs">{foto ? 'Ganti' : 'Unggah'}</button>
                  {foto && (
                    <button type="button" onClick={() => { if (confirm(`Hapus ${item.label}?`)) deleteMutation.mutate(item.key) }} disabled={deleteMutation.isPending} className="btn btn-ghost border border-danger/30 bg-white px-3 py-1 text-xs text-danger">Hapus</button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {previewUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={() => setPreviewUrl(null)} role="dialog" aria-modal="true">
          <div className="relative max-h-[90vh] max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Preview foto Sergab" className="max-h-[80vh] max-w-full rounded-lg object-contain" />
            <button type="button" onClick={() => setPreviewUrl(null)} className="absolute right-2 top-2 rounded-full bg-black/60 px-3 py-1 text-lg text-white">×</button>
          </div>
        </div>
      )}

      <label className="mt-4 block">
        <span className="label">Status Sergab</span>
        <select className="input" value={statusPo} onChange={(e) => setStatusPo(e.target.value as PoItem['status'])}>
          {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button type="submit" disabled={mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : statusPo === 'dibatalkan' ? 'Batalkan PO' : 'Simpan Status Sergab'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmSimpan}
        title={statusPo === 'dibatalkan' ? 'Batalkan PO ini?' : 'Simpan Status Sergab?'}
        description={statusPo === 'dibatalkan'
          ? <>PO <strong>{po.no_po}</strong> akan dibatalkan dan transaksi dikembalikan ke tahap <strong>Pengadaan</strong>. Lanjutkan?</>
          : statusPo === 'lengkap'
          ? <><strong>{po.po_detail.length} transaksi</strong> anggota PO <strong>{po.no_po}</strong> akan ditandai <strong>selesai</strong>. Ini langkah terakhir dan tidak bisa dibatalkan lewat form ini.</>
          : <>Status Sergab PO <strong>{po.no_po}</strong> akan tersimpan. Transaksinya <strong>belum</strong> ditutup karena statusnya belum Lengkap.</>}
        confirmLabel={statusPo === 'dibatalkan' ? 'Batalkan PO' : 'Simpan Status Sergab'}
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmSimpan(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
