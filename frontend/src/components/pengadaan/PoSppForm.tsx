import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'
import PoInForm from './PoInForm'
import PoProgressInfo from './PoProgressInfo'
import PoTransaksiRows from './PoTransaksiRows'

/**
 * Langkah SPP. Menyimpan No. SPP ADALAH aksi mengirim PO ke Keuangan.
 *
 * Ini juga tempat mendarat PO yang DITOLAK Keuangan: nomor IN-nya sudah tersimpan, jadi yang
 * dibutuhkan hanya mengirim ulang -- bukan mengetik ulang seluruh IN. Kalau ternyata IN-nya yang
 * salah, tombol "Perbaiki nomor IN" membuka kembali langkah IN di tempat.
 */
export default function PoSppForm({ po, onChanged }: { po: PoItem; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')
  const [confirmKirim, setConfirmKirim] = useState(false)
  const [perbaikiIn, setPerbaikiIn] = useState(false)

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
        : `No. SPP PO ${po.no_po} tersimpan dan PO dikirim ke Keuangan. Sisa langkah Anda: Status Sergab.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan No. SPP.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  // Langkah IN dibuka kembali di tempat, bukan lewat navigasi: PoInForm sudah menangani simpan,
  // batal, dan penguncian IN-nya sendiri, jadi tidak ada yang perlu digandakan di sini.
  if (perbaikiIn) {
    return (
      <div>
        <button type="button" onClick={() => setPerbaikiIn(false)} className="btn btn-ghost mb-3 border border-border bg-white">
          &larr; Kembali ke No. SPP
        </button>
        <PoInForm po={po} onChanged={onChanged} />
      </div>
    )
  }

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
          ? 'Nomor IN tidak hilang saat ditolak. Periksa catatan Keuangan, lalu kirim ulang dari sini — atau buka kembali langkah IN kalau justru nomornya yang perlu dibetulkan.'
          : 'Seluruh IN sudah terisi. Menyimpan No. SPP langsung mengirim PO ini ke Keuangan supaya pembayaran bisa diproses. Status Sergab tetap tugas Anda dan dikerjakan setelahnya.'}
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
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <button type="button" onClick={() => setPerbaikiIn(true)} className="btn btn-ghost border border-border bg-white">
          Perbaiki nomor IN
        </button>
        <button type="submit" disabled={!noSpp.trim() || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Mengirim...' : ditolak ? 'Kirim ulang ke Keuangan' : 'Simpan & Kirim ke Keuangan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmKirim}
        title={ditolak ? 'Kirim ulang PO ke Keuangan?' : 'Kirim PO ke Keuangan?'}
        description={<>No. SPP akan disimpan dan PO <strong>{po.no_po}</strong> beserta <strong>{po.po_detail.length} transaksi</strong> anggotanya dikirim ke <strong>Keuangan</strong>. Setelah itu nomor dan harga PO terkunci; yang tersisa untuk Anda adalah menutup <strong>Status Sergab</strong>. Lanjutkan?</>}
        confirmLabel={ditolak ? 'Kirim ulang' : 'Kirim ke Keuangan'}
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmKirim(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
