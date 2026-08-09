import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../../lib/api'
import { apiErrorMessage } from '../../lib/apiError'
import { labelFoto } from '../../lib/fotoDokumen'
import { formatMoney, formatNumber } from '../../lib/poFormat'
import { ambilFotoPo, ambilFotoTransaksi, useDokumenPo, useDokumenTransaksi } from '../../hooks/useFotoTransaksi'
import type { PoItem } from '../../hooks/usePoList'
import ConfirmDialog from '../ConfirmDialog'
import KartuFoto from '../KartuFoto'
import PoProgressInfo from './PoProgressInfo'
import PoTransaksiRows from './PoTransaksiRows'

const statusOptions: { value: PoItem['status']; label: string }[] = [
  { value: 'lengkap', label: 'Lengkap' },
  { value: 'kwitansi_belum_upload', label: 'Kwitansi belum upload' },
  { value: 'foto_belum_lengkap', label: 'Foto belum lengkap' },
  { value: 'dibatalkan', label: 'Dibatalkan' },
]

const fotoSergab = [
  'foto_barang',
  'foto_serah_terima',
  'foto_bukti_pembayaran',
  'foto_surat_pernyataan_usia_panen',
] as const

const fotoSergabTransaksi = [
  { jenisFoto: 'foto_gabah', label: 'Foto Barang' },
  { jenisFoto: 'foto_serah_terima', label: 'Foto Serah Terima' },
  { jenisFoto: 'foto_pembayaran', label: 'Foto Bukti Pembayaran' },
  { jenisFoto: 'foto_surat_pernyataan', label: 'Foto Surat Pernyataan' },
] as const

/**
 * Langkah PENUTUP Pengadaan. PO sudah dikirim ke Keuangan saat No. SPP disimpan, jadi di sini
 * tinggal menetapkan Status Sergab: 'lengkap' menandai seluruh transaksi anggota PO selesai.
 *
 * Tidak ada unggah foto di sini -- bukti foto sudah dikumpulkan di tahap-tahap transaksi
 * (Jemput Pangan / Makloon / UB Jastasma) dan bisa dilihat lewat baris transaksi di bawah.
 */
export default function PoStatusSergabForm({ po, transaksiIdDokumen, onChanged }: { po: PoItem; transaksiIdDokumen?: string; onChanged?: () => void }) {
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

      <PanelFotoSergab po={po} transaksiIdDokumen={transaksiIdDokumen} />

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

function PanelFotoSergab({ po, transaksiIdDokumen }: { po: PoItem; transaksiIdDokumen?: string }) {
  const queryClient = useQueryClient()
  const { data: dokumenPo = [] } = useDokumenPo(po.id)
  const { data: dokumenTransaksi = [] } = useDokumenTransaksi(transaksiIdDokumen)
  const path = `/api/po/${po.id}/foto`
  const thumbPoByJenis = new Map(dokumenPo.map((item) => [item.jenis_foto, item.thumb_url]))
  const thumbTransaksiByJenis = new Map(dokumenTransaksi.map((item) => [item.jenis_foto, item.thumb_url]))
  const segarkanPo = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dokumen-po', po.id] })
    await queryClient.invalidateQueries({ queryKey: ['po-list'] })
  }

  const segarkanTransaksi = async () => {
    await queryClient.invalidateQueries({ queryKey: ['dokumen-transaksi', transaksiIdDokumen] })
    await queryClient.invalidateQueries({ queryKey: ['transaksi-detail', transaksiIdDokumen] })
    await queryClient.invalidateQueries({ queryKey: ['po-list'] })
  }

  const memakaiDokumenTransaksi = !!transaksiIdDokumen

  return (
    <section className="my-4 border-y border-border py-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-primary-dark">Foto Sergab</h3>
          <p className="mt-1 text-xs text-slate-500">Lengkapi, ganti, atau hapus foto sebelum Status Sergab disimpan.</p>
        </div>
        <span className="rounded-full bg-primary-tint px-3 py-1 text-[0.68rem] font-bold text-primary">4 foto</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {memakaiDokumenTransaksi ? fotoSergabTransaksi.map(({ jenisFoto, label }) => (
          <KartuFoto
            key={jenisFoto}
            label={label}
            badge="Sergab"
            thumbUrl={thumbTransaksiByJenis.get(jenisFoto) ?? null}
            ambilAsli={(opts) => ambilFotoTransaksi(transaksiIdDokumen, jenisFoto, opts)}
            onGanti={async (file) => {
              const body = new FormData()
              body.append('jenis_foto', jenisFoto)
              body.append('role', 'makloon')
              body.append('foto', file)
              await api.post(`/api/transaksi/${encodeURIComponent(transaksiIdDokumen)}/foto`, body, { headers: { 'Content-Type': 'multipart/form-data' } })
              await segarkanTransaksi()
            }}
            onHapus={async () => {
              await api.delete(`/api/transaksi/${encodeURIComponent(transaksiIdDokumen)}/foto/${jenisFoto}`)
              await segarkanTransaksi()
            }}
          />
        )) : fotoSergab.map((jenisFoto) => (
          <KartuFoto
            key={jenisFoto}
            label={labelFoto(jenisFoto)}
            badge="Sergab"
            thumbUrl={thumbPoByJenis.get(jenisFoto) ?? null}
            ambilAsli={(opts) => ambilFotoPo(po.id, jenisFoto, opts)}
            onGanti={async (file) => {
              const body = new FormData()
              body.append('jenis_foto', jenisFoto)
              body.append('foto', file)
              await api.post(path, body, { headers: { 'Content-Type': 'multipart/form-data' } })
              await segarkanPo()
            }}
            onHapus={async () => {
              await api.delete(`${path}/${jenisFoto}`)
              await segarkanPo()
            }}
          />
        ))}
      </div>
    </section>
  )
}
