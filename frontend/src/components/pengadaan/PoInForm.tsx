import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'

// Kartu "PO Proses": isi Nomor IN per detail + No. SPP. Status Sergab baru muncul setelah semua
// nomor IN terisi, dan status 'lengkap' itulah yang meneruskan PO ke Keuangan.
//
// Anggota PO, No. PO, dan harga ditetapkan sekali saat penggabungan (GabungPoForm) dan tidak
// bisa diubah dari sini -- langkah "Kembali ke PO" sudah dihapus. Kalau ada yang keliru,
// jalannya lewat "Batalkan PO": transaksinya dilepas kembali ke tahap Pengadaan dan bisa
// digabung ulang. Endpoint PATCH /api/po/{id}/anggota masih ada tapi tidak lagi punya pemicu UI.
export default function PoInForm({
  po,
  onChanged,
}: {
  po: PoItem
  onChanged?: () => void
}) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<number, string>>({})
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')
  const [statusPo, setStatusPo] = useState<PoItem['status']>(po.status)
  const [confirmIn, setConfirmIn] = useState(false)
  const [confirmBatal, setConfirmBatal] = useState(false)

  useEffect(() => {
    setNoSpp(po.no_spp ?? '')
    setStatusPo(po.status)
  }, [po.no_spp, po.status])

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['po-list'] })
    queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
    onChanged?.()
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/in`, {
        items: po.po_detail
          .map((detail) => ({ po_detail_id: detail.id, no_in: (values[detail.id] ?? detail.no_in ?? '').trim() }))
          .filter((item) => item.no_in !== ''),
        no_spp: noSpp.trim() || undefined,
        status: statusMuncul ? statusPo : undefined,
      }),
    onSuccess: (res) => {
      setConfirmIn(false)
      setValues({})
      afterChange()
      const lengkap = (res.data as { data?: { status?: string } })?.data?.status === 'lengkap'
      setNoSpp((res.data as { data?: { no_spp?: string | null } })?.data?.no_spp ?? noSpp)
      setStatusPo((res.data as { data?: { status?: PoItem['status'] } })?.data?.status ?? statusPo)
      toast.success(lengkap ? `PO ${po.no_po} lengkap, diteruskan ke Keuangan.` : `Data Pengadaan PO ${po.no_po} tersimpan.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan nomor IN.')),
  })

  const updatePo = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}`, { status: 'dibatalkan' }),
    onSuccess: () => {
      setConfirmBatal(false)
      afterChange()
      toast.success(`PO ${po.no_po} dibatalkan.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memperbarui PO.')),
  })

  const errorMessage =
    ((mutation.error || updatePo.error) as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const isiCount = Object.values(values).filter((v) => v.trim() !== '').length
  const lengkapCount = po.po_detail.filter((d) => d.no_in || values[d.id]?.trim()).length
  const statusMuncul = lengkapCount === po.po_detail.length
  const statusOptions: { value: PoItem['status']; label: string }[] = [
    { value: 'proses', label: 'Proses' },
    { value: 'lengkap', label: 'Lengkap' },
    { value: 'kwitansi_belum_upload', label: 'Kwitansi belum upload' },
    { value: 'foto_belum_lengkap', label: 'Foto belum lengkap' },
    { value: 'dibatalkan', label: 'Dibatalkan' },
  ]
  const siapKeKeuangan = statusPo === 'lengkap' && statusMuncul && noSpp.trim() !== ''
  const bisaSimpan = isiCount > 0 || noSpp.trim() !== (po.no_spp ?? '') || (statusMuncul && statusPo !== po.status)

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmIn(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">{lengkapCount}/{po.po_detail.length} IN terisi</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="mb-4 rounded-lg border border-border bg-surface p-3">
        <div className="section-title mb-3">No. SPP</div>
        <p className="page-subtitle mb-3">No. SPP tetap diisi oleh Pengadaan. Status Sergab akan muncul setelah semua nomor IN terisi.</p>
        <label className="block"><span className="label">No. SPP</span><input className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" /></label>
        {statusMuncul ? (
          <div className="mt-4">
            <label className="block"><span className="label">Status Sergab</span><select className="input" value={statusPo} onChange={(e) => setStatusPo(e.target.value as PoItem['status'])}>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
            {statusPo === 'lengkap' && !siapKeKeuangan && <div className="alert-warning mt-3">No. SPP wajib diisi sebelum status dibuat Lengkap.</div>}
          </div>
        ) : (
          <div className="alert-warning mt-3">Status Sergab akan muncul setelah semua nomor IN terisi.</div>
        )}
      </div>
      <div className="data-table-wrap mb-3">
        <table className="data-table">
          <thead><tr><th>ID Transaksi</th><th className="text-right">Kuantum</th><th>Nomor IN</th></tr></thead>
          <tbody>
            {po.po_detail.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold text-primary-dark">{d.transaksi_id}</td>
                <td className="text-right">{formatNumber(d.kuantum_kontribusi)} kg</td>
                <td><input className="input" placeholder={d.no_in ?? 'Masukkan nomor IN'} disabled={!!d.no_in} value={values[d.id] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [d.id]: e.target.value }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button type="button" className="btn btn-outline-danger" onClick={() => setConfirmBatal(true)}>Batalkan PO</button>
        <button type="submit" disabled={!bisaSimpan || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Data Pengadaan'}</button>
      </div>

      <ConfirmDialog
        open={confirmIn}
        title="Simpan data Pengadaan?"
        description={<><strong>{lengkapCount} dari {po.po_detail.length} nomor IN</strong> dan No. SPP akan disimpan. Jika status Sergab dibuat Lengkap, PO diteruskan ke tahap <strong>Keuangan</strong>. Lanjutkan?</>}
        confirmLabel="Simpan Data"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmIn(false)}
        onConfirm={() => mutation.mutate()}
      />

      <ConfirmDialog
        open={confirmBatal}
        title="Batalkan PO ini?"
        description={<>PO <strong>{po.no_po}</strong> akan <strong>dibatalkan</strong>. Seluruh transaksi di dalamnya dikembalikan ke tahap <strong>Pengadaan</strong> dan bisa digabung ulang ke PO lain. Lanjutkan?</>}
        confirmLabel="Batalkan PO"
        confirmVariant="danger"
        loading={updatePo.isPending}
        onCancel={() => setConfirmBatal(false)}
        onConfirm={() => updatePo.mutate()}
      />
    </form>
  )
}
