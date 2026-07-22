import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'

// Kartu "PO Proses - Isi Nomor IN": status PO + input No. IN per detail. Dipakai halaman
// Pengadaan dan panel inline di timeline. onChanged dipanggil setelah mutasi sukses supaya
// pemanggil bisa meng-invalidate query tambahan (mis. detail transaksi di timeline).
export default function PoInForm({ po, onChanged }: { po: PoItem; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<number, string>>({})
  const [statusPo, setStatusPo] = useState(po.status)
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')
  const [confirmIn, setConfirmIn] = useState(false)
  const [confirmBatal, setConfirmBatal] = useState(false)

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['po-list'] })
    onChanged?.()
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/in`, {
        items: po.po_detail
          .map((detail) => ({ po_detail_id: detail.id, no_in: (values[detail.id] ?? detail.no_in ?? '').trim() }))
          .filter((item) => item.no_in !== ''),
        no_spp: noSpp || undefined,
        status: statusPo,
      }),
    onSuccess: (res) => {
      setConfirmIn(false)
      setValues({})
      afterChange()
      const lengkap = (res.data as { data?: { status?: string } })?.data?.status === 'lengkap'
      toast.success(lengkap ? `PO ${po.no_po} lengkap, diteruskan ke Keuangan.` : `Data Pengadaan PO ${po.no_po} tersimpan.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan nomor IN.')),
  })

  const updatePo = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}`, { status: statusPo }),
    onSuccess: () => {
      setConfirmBatal(false)
      afterChange()
      toast.success(statusPo === 'dibatalkan' ? `PO ${po.no_po} dibatalkan.` : `PO ${po.no_po} diperbarui.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memperbarui PO.')),
  })

  const errorMessage =
    ((mutation.error || updatePo.error) as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const isiCount = Object.values(values).filter((v) => v.trim() !== '').length
  const lengkapCount = po.po_detail.filter((d) => d.no_in || values[d.id]?.trim()).length
  const statusOptions: { value: PoItem['status']; label: string }[] = [
    { value: 'proses', label: 'Proses' },
    { value: 'lengkap', label: 'Lengkap' },
    { value: 'kwitansi_belum_upload', label: 'Kwitansi belum upload' },
    { value: 'foto_belum_lengkap', label: 'Foto belum lengkap' },
    { value: 'dibatalkan', label: 'Dibatalkan' },
  ]
  const siapKeKeuangan = statusPo === 'lengkap' && lengkapCount === po.po_detail.length && noSpp.trim() !== ''
  const bisaSimpan = statusPo === 'lengkap' ? siapKeKeuangan : (isiCount > 0 || statusPo !== po.status || noSpp.trim() !== (po.no_spp ?? ''))

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); statusPo === 'dibatalkan' && po.status !== 'dibatalkan' ? setConfirmBatal(true) : setConfirmIn(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">{lengkapCount}/{po.po_detail.length} IN terisi</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="mb-4 rounded-lg border border-border bg-surface p-3">
        <div className="section-title mb-3">No. SPP & Status Sergab</div>
        <p className="page-subtitle mb-3">Status Lengkap akan mengirim PO ke Keuangan setelah semua nomor IN dan No. SPP terisi.</p>
        <div className="grid gap-4 @md:grid-cols-2">
          <label className="block"><span className="label">No. SPP</span><input className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" /></label>
          <label className="block"><span className="label">Status Sergab</span><select className="input" value={statusPo} onChange={(e) => setStatusPo(e.target.value as PoItem['status'])}>{statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
        </div>
        {statusPo === 'lengkap' && !siapKeKeuangan && <div className="alert-warning mt-3">Lengkapi seluruh nomor IN dan No. SPP sebelum status dibuat Lengkap.</div>}
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
      <div className="flex justify-end"><button type="submit" disabled={!bisaSimpan || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Data Pengadaan'}</button></div>

      <ConfirmDialog
        open={confirmIn}
        title="Simpan nomor IN?"
        description={<><strong>{lengkapCount} nomor IN</strong>, No. SPP, dan status Sergab akan disimpan. Jika status Lengkap, PO diteruskan ke tahap <strong>Keuangan</strong>. Lanjutkan?</>}
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
