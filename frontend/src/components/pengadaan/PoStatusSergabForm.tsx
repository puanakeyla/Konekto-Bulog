import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import { uploadSemuaPoFoto } from '../../lib/uploadFoto'
import { useDokumenTransaksi } from '../../hooks/useFotoTransaksi'
import { usePoFoto } from '../../hooks/usePoFoto'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'
import FotoPicker from '../FotoPicker'

const statusOptions: { value: PoItem['status']; label: string }[] = [
  { value: 'lengkap', label: 'Lengkap' },
  { value: 'kwitansi_belum_upload', label: 'Kwitansi belum upload' },
  { value: 'foto_belum_lengkap', label: 'Foto belum lengkap' },
]

const FOTO_SERGAB_FIELDS = [
  { key: 'foto_barang', label: 'Foto Barang' },
  { key: 'foto_serah_terima', label: 'Foto Serah Terima' },
  { key: 'foto_bukti_pembayaran', label: 'Foto Bukti Pembayaran' },
  { key: 'foto_surat_pernyataan_usia_panen', label: 'Foto Surat Pernyataan Usia Panen' },
]

const fotoLabels = Object.fromEntries(FOTO_SERGAB_FIELDS.map((field) => [field.key, field.label]))

function fallbackJenisFoto(key: string, skema: 'TJP' | 'MPP') {
  if (key === 'foto_barang') return 'foto_gabah'
  if (key === 'foto_serah_terima') return 'foto_serah_terima'
  if (key === 'foto_bukti_pembayaran') return skema === 'MPP' ? 'foto_pembayaran' : 'foto_kwitansi'
  if (key === 'foto_surat_pernyataan_usia_panen') return 'foto_surat_pernyataan'
  return key
}

export default function PoStatusSergabForm({
  po,
  transaksiId,
  skema,
  onChanged,
}: {
  po: PoItem
  transaksiId?: string
  skema?: 'TJP' | 'MPP'
  onChanged?: () => void
}) {
  const queryClient = useQueryClient()
  const [statusPo, setStatusPo] = useState<PoItem['status']>(po.status === 'proses' ? 'lengkap' : po.status)
  const [fotos, setFotos] = useState<Record<string, File | null>>({})
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [fotoGagal, setFotoGagal] = useState<string[]>([])
  const [confirmSimpan, setConfirmSimpan] = useState(false)

  const { data: poFoto = [] } = usePoFoto(po.id)
  const { data: dokumenTransaksi = [] } = useDokumenTransaksi(transaksiId)

  useEffect(() => setStatusPo(po.status === 'proses' ? 'lengkap' : po.status), [po.status])

  const savedSrc = useMemo(() => {
    const map = new Map<string, string>()
    for (const field of FOTO_SERGAB_FIELDS) {
      const poStored = poFoto.find((item) => item.jenis_foto === field.key)
      if (poStored) {
        map.set(field.key, poStored.thumb_url)
        continue
      }

      if (skema) {
        const fallback = dokumenTransaksi.find((item) => item.jenis_foto === fallbackJenisFoto(field.key, skema))
        if (fallback) map.set(field.key, fallback.thumb_url)
      }
    }
    return map
  }, [dokumenTransaksi, poFoto, skema])

  const mutation = useMutation({
    mutationFn: async () => {
      setFotoGagal([])
      const hasil = await uploadSemuaPoFoto(po.id, fotos, (jenisFoto, percent) => {
        setProgress((prev) => ({ ...prev, [jenisFoto]: percent }))
      })

      if (hasil.gagal.length > 0) {
        setFotoGagal(hasil.gagal)
        throw { response: { data: { message: `Foto gagal terupload: ${hasil.gagal.map((key) => fotoLabels[key] ?? key).join(', ')}.` } } }
      }

      return api.patch(`/api/po/${po.id}`, { status: statusPo })
    },
    onSuccess: () => {
      setConfirmSimpan(false)
      setFotos({})
      setProgress({})
      queryClient.invalidateQueries({ queryKey: ['po-foto', po.id] })
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['antrean-transaksi'] })
      onChanged?.()
      toast.success(statusPo === 'lengkap' ? `Data Pengadaan PO ${po.no_po} disimpan dan dikirim ke Keuangan.` : `Data Pengadaan PO ${po.no_po} tersimpan sebagai draft.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan data Pengadaan.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmSimpan(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">No. SPP {po.no_spp}</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      <div className="mb-5 border-b border-border pb-5">
        <div className="section-title mb-3">Bukti Foto</div>
        <div className="grid gap-4 @md:grid-cols-2">
          {FOTO_SERGAB_FIELDS.map((field) => (
            <FotoPicker
              key={field.key}
              label={field.label}
              file={fotos[field.key] ?? null}
              onChange={(file) => setFotos((prev) => ({ ...prev, [field.key]: file }))}
              progress={progress[field.key]}
              error={fotoGagal.includes(field.key) ? 'Gagal terupload' : undefined}
              savedSrc={savedSrc.get(field.key) ?? null}
            />
          ))}
        </div>
      </div>

      <label className="block">
        <span className="label">Status Sergab</span>
        <select className="input" value={statusPo} onChange={(e) => setStatusPo(e.target.value as PoItem['status'])}>
          {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button type="submit" disabled={mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : 'Simpan Data Pengadaan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmSimpan}
        title="Simpan data Pengadaan?"
        description={statusPo === 'lengkap'
          ? <>Foto yang diganti akan disimpan, lalu PO <strong>{po.no_po}</strong> dikirim ke tahap <strong>Keuangan</strong>.</>
          : <>Foto yang diganti dan Status Sergab PO <strong>{po.no_po}</strong> akan tersimpan sebagai draft.</>}
        confirmLabel="Simpan Data Pengadaan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmSimpan(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
