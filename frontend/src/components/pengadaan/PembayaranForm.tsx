import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'

// Kartu pembayaran PO (No. SPP + tanggal bayar). Dipakai halaman Keuangan dan panel inline
// di timeline. Prasyarat backend: PO harus sudah 'lengkap' DAN review_status = 'diterima'
// (Keuangan menerima data Pengadaan lebih dulu lewat PoReviewActions).
export default function PembayaranForm({ po, onChanged }: { po: PoItem; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const [tanggalBayar, setTanggalBayar] = useState('')
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')
  const [confirmBayar, setConfirmBayar] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}/pembayaran`, { status_bayar: 'dibayarkan', tanggal_bayar: tanggalBayar, no_spp: noSpp || undefined }),
    onSuccess: () => {
      setConfirmBayar(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      onChanged?.()
      toast.success(`PO ${po.no_po} ditandai dibayarkan dan transaksi selesai.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan pembayaran.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmBayar(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">Belum dibayar</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="data-table-wrap mb-4">
        <table className="data-table">
          <thead><tr><th>ID Transaksi</th><th className="text-right">Kuantum</th><th>Nomor IN</th></tr></thead>
          <tbody>
            {po.po_detail.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold text-primary-dark">{d.transaksi_id}</td>
                <td className="text-right">{formatNumber(d.kuantum_kontribusi)} kg</td>
                <td>{d.no_in ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-4 @md:grid-cols-2">
        <label className="block"><span className="label">No. SPP (berlaku untuk seluruh PO)</span><input className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" /></label>
        <label className="block"><span className="label">Tanggal Bayar (berlaku untuk seluruh PO)</span><input required type="date" className="input" value={tanggalBayar} onChange={(e) => setTanggalBayar(e.target.value)} /></label>
      </div>
      <div className="mt-4 flex justify-end"><button type="submit" disabled={!tanggalBayar || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Tandai Dibayarkan'}</button></div>

      <ConfirmDialog
        open={confirmBayar}
        title="Tandai PO sudah dibayarkan?"
        description={<>PO <strong>{po.no_po}</strong> akan ditandai sudah dibayarkan dan transaksi selesai. Status pembayaran tidak dapat dibatalkan. Lanjutkan?</>}
        confirmLabel="Tandai Dibayarkan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmBayar(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
