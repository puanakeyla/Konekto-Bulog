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
  const [confirmIn, setConfirmIn] = useState(false)
  const [confirmBatal, setConfirmBatal] = useState(false)

  const afterChange = () => {
    queryClient.invalidateQueries({ queryKey: ['po-list'] })
    onChanged?.()
  }

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/in`, {
        items: Object.entries(values)
          .filter(([, no_in]) => no_in.trim() !== '')
          .map(([po_detail_id, no_in]) => ({ po_detail_id: Number(po_detail_id), no_in })),
      }),
    onSuccess: (res) => {
      setConfirmIn(false)
      setValues({})
      afterChange()
      const lengkap = (res.data as { data?: { status?: string } })?.data?.status === 'lengkap'
      toast.success(lengkap ? `PO ${po.no_po} lengkap, diteruskan ke Keuangan.` : `Nomor IN PO ${po.no_po} tersimpan.`)
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

  // Harga bisa diubah bebas (tanpa dialog); khusus perubahan status ke 'dibatalkan'
  // wajib konfirmasi karena membatalkan PO tidak bisa diurungkan lewat UI ini.
  const submitUpdatePo = () => {
    if (statusPo === 'dibatalkan' && po.status !== 'dibatalkan') {
      setConfirmBatal(true)
      return
    }
    updatePo.mutate()
  }

  const errorMessage =
    ((mutation.error || updatePo.error) as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const isiCount = Object.values(values).filter((v) => v.trim() !== '').length
  const lengkapCount = po.po_detail.filter((d) => d.no_in).length

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmIn(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">{lengkapCount}/{po.po_detail.length} IN terisi</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="mb-4 rounded-lg border border-border bg-surface p-3">
        <div className="section-title mb-3">Status PO</div>
        <p className="page-subtitle mb-3">Harga per kg hanya diatur saat menggabungkan transaksi menjadi PO.</p>
        <div className="grid gap-4 @md:grid-cols-2">
          <label className="block"><span className="label">Status</span><select className="input" value={statusPo} onChange={(e) => setStatusPo(e.target.value as PoItem['status'])}><option value="proses">Proses</option><option value="lengkap">Lengkap</option><option value="dibatalkan">Dibatalkan</option></select></label>
          <div className="@md:col-span-2 flex justify-end"><button type="button" disabled={updatePo.isPending} onClick={submitUpdatePo} className="btn btn-primary">{updatePo.isPending ? 'Menyimpan...' : 'Update Status'}</button></div>
        </div>
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
      <div className="flex justify-end"><button type="submit" disabled={isiCount === 0 || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Nomor IN'}</button></div>

      <ConfirmDialog
        open={confirmIn}
        title="Simpan nomor IN?"
        description={<><strong>{isiCount} nomor IN</strong> akan disimpan dan tidak bisa diubah lagi. Jika seluruh nomor IN pada PO ini sudah terisi, PO otomatis diteruskan ke tahap <strong>Keuangan</strong>. Lanjutkan?</>}
        confirmLabel="Simpan Nomor IN"
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
