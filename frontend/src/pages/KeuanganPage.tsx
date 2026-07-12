import { useState, type Dispatch, type SetStateAction } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem } from '../hooks/usePoList'
import ConfirmDialog from '../components/ConfirmDialog'
import { toast } from 'sonner'
import { apiErrorMessage } from '../lib/apiError'
import { SkeletonPoCards } from '../components/Skeleton'

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function formatMoney(value: string | number) {
  return Number(value).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
}

export default function KeuanganPage() {
  const [page, setPage] = useState(1)
  const { data: poResult, isLoading } = usePoList(page)
  const poList = poResult?.items ?? []
  const meta = poResult?.meta
  const belumDibayar = poList.filter((po) => po.status === 'lengkap' && po.data_keuangan?.status_bayar !== 'dibayarkan')
  const sudahDibayar = poList.filter((po) => po.data_keuangan?.status_bayar === 'dibayarkan').length
  const totalTagihan = belumDibayar.reduce((sum, po) => sum + Number(po.total_harga || 0), 0)

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Keuangan - Pembayaran PO</h1>
            <p className="page-subtitle">Input No. SPP dan tanggal bayar untuk PO yang sudah lengkap nomor IN.</p>
          </div>
          <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
        </div>

        <div className="work-layout">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Menunggu bayar</div><div className="stat-value">{belumDibayar.length}</div></div>
            <div className="stat-card"><div className="stat-label">Sudah dibayar</div><div className="stat-value">{sudahDibayar}</div></div>
            <div className="stat-card"><div className="stat-label">Nilai antrean</div><div className="stat-value text-base leading-tight">{formatMoney(totalTagihan)}</div></div>
            <div className="stat-card"><div className="stat-label">Total PO</div><div className="stat-value">{poResult?.meta.total ?? poList.length}</div></div>
          </div>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Siap Dibayar</h2><p className="page-subtitle">Data ini tersambung ke PATCH /api/po/:id/pembayaran.</p></div>
              <span className="badge badge-warning">{belumDibayar.length} antrean</span>
            </div>

            {isLoading && <SkeletonPoCards />}
            {!isLoading && belumDibayar.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu pembayaran</div><p className="empty-copy">PO baru muncul setelah Pengadaan mengisi seluruh nomor IN.</p></div>
            )}

            <div className="space-y-4">{belumDibayar.map((po) => <PembayaranForm key={po.id} po={po} />)}</div>
            {meta && meta.last_page > 1 && <PaginationBar meta={meta} page={page} setPage={setPage} />}
          </section>
        </div>
      </div>
    </div>
  )
}

function PaginationBar({ meta, page, setPage }: { meta: { current_page: number; last_page: number; total: number; from: number | null; to: number | null }; page: number; setPage: Dispatch<SetStateAction<number>> }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>Menampilkan {meta.from ?? 0}-{meta.to ?? 0} dari {meta.total} PO</span>
      <div className="flex gap-2">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</button>
        <span className="badge">Halaman {meta.current_page}/{meta.last_page}</span>
        <button className="btn btn-ghost" disabled={page >= meta.last_page} onClick={() => setPage((prev) => prev + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}

function PembayaranForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [tanggalBayar, setTanggalBayar] = useState('')
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')
  const [confirmBayar, setConfirmBayar] = useState(false)

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}/pembayaran`, { status_bayar: 'dibayarkan', tanggal_bayar: tanggalBayar, no_spp: noSpp || undefined }),
    onSuccess: () => {
      setConfirmBayar(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      toast.success(`PO ${po.no_po} ditandai dibayarkan, diteruskan ke Operasi.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan pembayaran.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card" onSubmit={(e) => { e.preventDefault(); setConfirmBayar(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">Belum dibayar</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="form-grid">
        <label className="block"><span className="label">No. SPP</span><input className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" /></label>
        <label className="block"><span className="label">Tanggal Bayar</span><input required type="date" className="input" value={tanggalBayar} onChange={(e) => setTanggalBayar(e.target.value)} /></label>
      </div>
      <div className="mt-4 flex justify-end"><button type="submit" disabled={!tanggalBayar || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Tandai Dibayarkan'}</button></div>

      <ConfirmDialog
        open={confirmBayar}
        title="Tandai PO sudah dibayarkan?"
        description={<>PO <strong>{po.no_po}</strong> akan ditandai sudah dibayarkan dan diteruskan ke tahap <strong>Operasi</strong>. Status pembayaran tidak dapat dibatalkan. Lanjutkan?</>}
        confirmLabel="Tandai Dibayarkan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmBayar(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
