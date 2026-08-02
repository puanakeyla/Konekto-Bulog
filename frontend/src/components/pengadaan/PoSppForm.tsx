import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'
import PoProgressInfo from './PoProgressInfo'

export default function PoSppForm({ po, onChanged }: { po: PoItem; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
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
      toast.success(`No. SPP PO ${po.no_po} tersimpan. Kembali ke dashboard untuk cek status berikutnya.`)
      navigate('/dashboard')
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
        status="Belum dikirim"
        berikutnya="Tentukan Status Sergab"
        keterangan="Seluruh IN sudah terisi. No. SPP disimpan di Pengadaan, lalu Status Sergab menentukan apakah data siap dikirim ke tahap berikutnya."
      />
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <label className="block">
        <span className="label">No. SPP</span>
        <input required className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" />
      </label>
      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button type="submit" disabled={!noSpp.trim() || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : 'Simpan No. SPP'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmKirim}
        title="Simpan No. SPP?"
        description={<>No. SPP akan disimpan untuk PO <strong>{po.no_po}</strong>. Status tetap <strong>Belum dikirim</strong> sampai Status Sergab dipilih dan disimpan.</>}
        confirmLabel="Simpan No. SPP"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmKirim(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
