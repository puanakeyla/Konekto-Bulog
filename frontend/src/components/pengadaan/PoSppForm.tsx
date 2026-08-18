import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from '../../lib/toast'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'
import PoProgressInfo from './PoProgressInfo'
import PoTransaksiRows from './PoTransaksiRows'

/** Langkah SPP. Menyimpan No. SPP langsung menyerahkan PO ke Keuangan. */
/**
 * `onKembali` membuka kembali langkah No. IN. Ia duduk di BARIS TOMBOL kartu ini, bukan
 * menggantung di bawah kartu: tautan yang melayang di luar bingkai terbaca seperti aksi lain
 * yang tidak berhubungan -- dan sempat tertukar dengan "Batalkan PO" yang letaknya mirip.
 */
export default function PoSppForm({ po, onChanged, onKembali }: { po: PoItem; onChanged?: () => void; onKembali?: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')
  const [confirmKirim, setConfirmKirim] = useState(false)

  useEffect(() => setNoSpp(po.no_spp ?? ''), [po.no_spp])

  const ditolak = po.review_status === 'ditolak'

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}/spp`, { no_spp: noSpp.trim() }),
    onSuccess: () => {
      setConfirmKirim(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['antrean-transaksi'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ringkasan'] })
      onChanged?.()
      toast.success(ditolak
        ? `PO ${po.no_po} dikirim ulang ke Keuangan.`
        : `No. SPP PO ${po.no_po} tersimpan dan PO dikirim ke Keuangan.`)
      navigate('/dashboard')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan No. SPP.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmKirim(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className={`badge ${ditolak ? 'badge-danger' : 'badge-warning'}`}>{ditolak ? 'Ditolak Keuangan' : 'Belum dikirim'}</span>
      </div>

      <PoProgressInfo
        posisi="Pengadaan"
        status={ditolak ? 'Perlu dikirim ulang' : 'Siap dikirim'}
        berikutnya="Keuangan"
        keterangan={ditolak
          ? 'Nomor IN tidak hilang saat ditolak. Periksa catatan Keuangan, lalu kirim ulang dari sini.'
          : 'Seluruh IN sudah terisi. Menyimpan No. SPP langsung mengirim PO ini ke Keuangan supaya pembayaran bisa diproses.'}
      />

      {ditolak && po.catatan_penolakan && (
        <div className="alert-danger mb-3">Ditolak Keuangan: {po.catatan_penolakan}</div>
      )}
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      <PoTransaksiRows po={po} />

      <label className="block">
        <span className="label">No. SPP</span>
        <input required className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" />
      </label>

      <div className="mt-4 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        {onKembali && (
          <button type="button" onClick={onKembali} className="mr-auto text-xs font-semibold text-slate-500 transition-colors hover:text-primary">
            &larr; Kembali ke isi No. IN
          </button>
        )}
        <button type="submit" disabled={!noSpp.trim() || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Mengirim...' : ditolak ? 'Kirim ulang ke Keuangan' : 'Simpan & Kirim ke Keuangan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmKirim}
        title={ditolak ? 'Kirim ulang PO ke Keuangan?' : 'Kirim PO ke Keuangan?'}
        description={<>No. SPP akan disimpan dan PO <strong>{po.no_po}</strong> beserta <strong>{po.po_detail.length} transaksi</strong> anggotanya dikirim ke <strong>Keuangan</strong>. Lanjutkan?</>}
        confirmLabel={ditolak ? 'Kirim ulang' : 'Kirim ke Keuangan'}
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmKirim(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
