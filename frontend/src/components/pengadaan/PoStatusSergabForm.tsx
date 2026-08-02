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

const statusOptions: { value: PoItem['status']; label: string }[] = [
  { value: 'lengkap', label: 'Lengkap' },
  { value: 'kwitansi_belum_upload', label: 'Kwitansi belum upload' },
  { value: 'foto_belum_lengkap', label: 'Foto belum lengkap' },
  { value: 'dibatalkan', label: 'Dibatalkan' },
]

/**
 * Langkah PENUTUP Pengadaan. PO sudah dikirim ke Keuangan saat No. SPP disimpan, jadi di sini
 * tinggal menetapkan Status Sergab: 'lengkap' menandai seluruh transaksi anggota PO selesai.
 *
 * Tidak ada unggah foto di sini -- bukti foto sudah dikumpulkan di tahap-tahap transaksi
 * (Jemput Pangan / Makloon / UB Jastasma) dan bisa dilihat lewat baris transaksi di bawah.
 */
export default function PoStatusSergabForm({ po, onChanged }: { po: PoItem; onChanged?: () => void }) {
  const queryClient = useQueryClient()
  const [statusPo, setStatusPo] = useState<PoItem['status']>(po.status === 'proses' ? 'lengkap' : po.status)
  const [confirmSimpan, setConfirmSimpan] = useState(false)

  useEffect(() => setStatusPo(po.status === 'proses' ? 'lengkap' : po.status), [po.status])

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}`, { status: statusPo }),
    // Tetap di halaman: daftar PO di-invalidate sehingga kartu ini hilang/berganti sendiri.
    onSuccess: () => {
      setConfirmSimpan(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['antrean-transaksi'] })
      queryClient.invalidateQueries({ queryKey: ['dashboard-ringkasan'] })
      onChanged?.()
      toast.success(statusPo === 'dibatalkan'
        ? `PO ${po.no_po} dibatalkan dan transaksi kembali ke Pengadaan.`
        : statusPo === 'lengkap'
        ? `Status Sergab PO ${po.no_po} lengkap. ${po.po_detail.length} transaksi anggotanya ditandai selesai.`
        : `Status Sergab PO ${po.no_po} tersimpan. Transaksinya belum ditutup karena statusnya belum Lengkap.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan data Pengadaan.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmSimpan(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className={`badge ${statusPo === 'dibatalkan' ? 'badge-danger' : statusPo === 'lengkap' ? 'badge-success' : 'badge-warning'}`}>
          {statusPo === 'dibatalkan' ? 'Dibatalkan' : statusPo === 'lengkap' ? 'Siap ditutup' : 'Belum lengkap'}
        </span>
      </div>
      <PoProgressInfo
        posisi={po.no_spp ? 'Keuangan (sudah dikirim)' : 'Pengadaan'}
        status={statusPo === 'lengkap' ? 'Siap ditutup' : statusPo === 'dibatalkan' ? 'Dibatalkan' : 'Belum lengkap'}
        berikutnya={statusPo === 'lengkap' ? 'Transaksi selesai' : statusPo === 'dibatalkan' ? 'Kembali ke Pengadaan' : 'Tetap di Pengadaan'}
        keterangan={statusPo === 'dibatalkan'
          ? 'PO dibatalkan. Transaksi kembali ke Pengadaan dan bisa digabung ulang bila perlu.'
          : 'Status Sergab adalah langkah PENUTUP. PO sudah dikirim ke Keuangan saat No. SPP disimpan; memilih Lengkap di sini menandai seluruh transaksi anggotanya selesai.'}
      />
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <PoTransaksiRows po={po} />

      <label className="block">
        <span className="label">Status Sergab</span>
        <select className="input" value={statusPo} onChange={(e) => setStatusPo(e.target.value as PoItem['status'])}>
          {statusOptions.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
        </select>
      </label>
      <div className="mt-4 flex justify-end border-t border-border pt-4">
        <button type="submit" disabled={mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : statusPo === 'dibatalkan' ? 'Batalkan PO' : 'Simpan Status Sergab'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmSimpan}
        title={statusPo === 'dibatalkan' ? 'Batalkan PO ini?' : 'Simpan Status Sergab?'}
        description={statusPo === 'dibatalkan'
          ? <>PO <strong>{po.no_po}</strong> akan dibatalkan dan transaksi dikembalikan ke tahap <strong>Pengadaan</strong>. Lanjutkan?</>
          : statusPo === 'lengkap'
          ? <><strong>{po.po_detail.length} transaksi</strong> anggota PO <strong>{po.no_po}</strong> akan ditandai <strong>selesai</strong>. Ini langkah terakhir dan tidak bisa dibatalkan lewat form ini.</>
          : <>Status Sergab PO <strong>{po.no_po}</strong> akan tersimpan. Transaksinya <strong>belum</strong> ditutup karena statusnya belum Lengkap.</>}
        confirmLabel={statusPo === 'dibatalkan' ? 'Batalkan PO' : 'Simpan Status Sergab'}
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmSimpan(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
