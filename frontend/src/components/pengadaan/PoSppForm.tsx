import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'
import PoProgressInfo from './PoProgressInfo'
import PoTransaksiRows from './PoTransaksiRows'

export default function PoSppForm({ po, onChanged }: { po: PoItem; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')
  const [confirmKirim, setConfirmKirim] = useState(false)

  useEffect(() => setNoSpp(po.no_spp ?? ''), [po.no_spp])

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}/spp`, { no_spp: noSpp.trim() }),
    onSuccess: () => {
      setConfirmKirim(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      queryClient.invalidateQueries({ queryKey: ['antrean-transaksi'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ringkasan'] })
      onChanged?.()
      toast.success(`No. SPP PO ${po.no_po} tersimpan dan PO dikirim ke Keuangan. Sisa langkah Anda: Status Sergab.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan No. SPP.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmKirim(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">Belum dikirim</span>
      </div>
      <PoProgressInfo
        posisi="Pengadaan"
        status="Siap dikirim"
        berikutnya="Keuangan"
        keterangan="Seluruh IN sudah terisi. Menyimpan No. SPP langsung mengirim PO ini ke Keuangan supaya pembayaran bisa diproses. Status Sergab tetap tugas Anda dan dikerjakan setelahnya."
      />
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <PoTransaksiRows po={po} />
      <label className="block">
        <span className="label">No. SPP</span>
        <input required className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" />
      </label>
      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button type="submit" disabled={!noSpp.trim() || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Mengirim...' : 'Simpan & Kirim ke Keuangan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmKirim}
        title="Kirim PO ke Keuangan?"
        description={<>No. SPP akan disimpan dan PO <strong>{po.no_po}</strong> beserta <strong>{po.po_detail.length} transaksi</strong> anggotanya langsung dikirim ke <strong>Keuangan</strong>. Setelah itu nomor dan harga PO terkunci; yang tersisa untuk Anda adalah menutup <strong>Status Sergab</strong>. Lanjutkan?</>}
        confirmLabel="Kirim ke Keuangan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmKirim(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
