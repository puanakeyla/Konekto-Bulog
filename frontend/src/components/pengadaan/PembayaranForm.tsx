import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'
import PoTransaksiRows from './PoTransaksiRows'

// Kartu pembayaran PO (No. SPP + tanggal bayar). Dipakai halaman Keuangan dan panel inline
// di timeline. Prasyarat backend: review_status = 'diterima' (Keuangan menerima data Pengadaan
// lebih dulu lewat PoReviewActions). Pelunasan TIDAK menutup transaksi -- penutupnya Status
// Sergab dari Pengadaan, yang berjalan paralel dengan pembayaran ini.
export default function PembayaranForm({ po, onChanged }: { po: PoItem; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const [tanggalBayar, setTanggalBayar] = useState('')
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')
  const [confirmBayar, setConfirmBayar] = useState(false)

  useEffect(() => {
    setNoSpp(po.no_spp ?? '')
    // Hidrasi dari data tersimpan (draft) supaya "Simpan" dengan tanggal kosong tidak menimpa
    // tanggal_bayar yang sudah ada -- lihat PoLifecycleService::updatePembayaran() yang menulis
    // tanggal_bayar tanpa syarat dari payload ini.
    setTanggalBayar(po.data_keuangan?.tanggal_bayar?.slice(0, 10) ?? '')
  }, [po.no_spp, po.data_keuangan?.tanggal_bayar])

  const mutation = useMutation({
    mutationFn: (aksi: 'simpan' | 'bayar') => api.patch(`/api/po/${po.id}/pembayaran`, {
      status_bayar: aksi === 'bayar' ? 'dibayarkan' : 'belum',
      // Backend hanya mewajibkan tanggal saat dibayarkan, jadi draft boleh mengirim null.
      tanggal_bayar: tanggalBayar || null,
      no_spp: noSpp.trim(),
    }),
    onSuccess: (_data, aksi) => {
      setConfirmBayar(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      onChanged?.()
      toast.success(aksi === 'bayar'
        ? `PO ${po.no_po} ditandai dibayarkan.`
        : `Pembayaran PO ${po.no_po} tersimpan sebagai draft.`)
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
      <PoTransaksiRows po={po} />
      <div className="grid gap-4 @md:grid-cols-2">
        <label className="block"><span className="label">No. SPP (berlaku untuk seluruh PO)</span><input required className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" /></label>
        <label className="block"><span className="label">Tanggal Bayar (wajib untuk menandai dibayarkan)</span><input required type="date" className="input" value={tanggalBayar} onChange={(e) => setTanggalBayar(e.target.value)} /></label>
      </div>
      {/* Simpan menahan No. SPP & tanggal tanpa melunasi. "Tandai Dibayarkan" mengunci baris
          Keuangan dan tidak bisa dibatalkan, tapi TIDAK menutup transaksinya. */}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate('simpan')}
          disabled={!noSpp.trim() || mutation.isPending}
          className="btn btn-ghost border border-border bg-white"
        >
          {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button type="submit" disabled={!tanggalBayar || !noSpp.trim() || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : 'Tandai Dibayarkan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmBayar}
        title="Tandai PO sudah dibayarkan?"
        description={<>PO <strong>{po.no_po}</strong> akan ditandai sudah dibayarkan dan status pembayarannya tidak dapat dibatalkan. Transaksinya sendiri ditutup Pengadaan lewat Status Sergab. Lanjutkan?</>}
        confirmLabel="Tandai Dibayarkan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmBayar(false)}
        onConfirm={() => mutation.mutate('bayar')}
      />
    </form>
  )
}
