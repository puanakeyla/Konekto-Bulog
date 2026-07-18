import { useState, type Dispatch, type SetStateAction } from 'react'
import { usePoList } from '../hooks/usePoList'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'
import { formatMoney } from '../lib/poFormat'
import PembayaranForm from '../components/pengadaan/PembayaranForm'
import PoReviewCard from '../components/pengadaan/PoReviewCard'

export default function KeuanganPage() {
  const [page, setPage] = useState(1)
  const { data: poResult, isLoading } = usePoList(page)
  const poList = poResult?.items ?? []
  const meta = poResult?.meta
  // Alur Keuangan: PO 'lengkap' dari Pengadaan lebih dulu ditinjau (Terima/Tolak). Setelah
  // diterima (review_status = 'diterima') baru bisa diisi pembayaran.
  const perluReview = poList.filter((po) => po.status === 'lengkap' && po.review_status === 'menunggu_review')
  const siapBayar = poList.filter((po) => po.status === 'lengkap' && po.review_status === 'diterima' && po.data_keuangan?.status_bayar !== 'dibayarkan')
  const sudahDibayar = poList.filter((po) => po.data_keuangan?.status_bayar === 'dibayarkan').length
  const totalTagihan = siapBayar.reduce((sum, po) => sum + Number(po.total_harga || 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Keuangan — Pembayaran PO"
        subtitle="Tinjau data Pengadaan, lalu input No. SPP dan tanggal bayar untuk PO yang diterima."
        badge="Role Keuangan"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Menunggu review</div><div className="stat-value">{perluReview.length}</div></div>
            <div className="stat-card"><div className="stat-label">Menunggu bayar</div><div className="stat-value">{siapBayar.length}</div></div>
            <div className="stat-card"><div className="stat-label">Sudah dibayar</div><div className="stat-value">{sudahDibayar}</div></div>
            <div className="stat-card"><div className="stat-label">Nilai antrean</div><div className="stat-value text-base leading-tight">{formatMoney(totalTagihan)}</div></div>
          </div>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Menunggu Persetujuan</h2><p className="page-subtitle">Terima untuk mengunci data Pengadaan, atau tolak untuk minta revisi.</p></div>
              <span className="badge badge-warning">{perluReview.length} antrean</span>
            </div>

            {isLoading && <SkeletonPoCards />}
            {!isLoading && perluReview.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu persetujuan</div><p className="empty-copy">PO muncul di sini setelah Pengadaan mengisi seluruh nomor IN.</p></div>
            )}

            <div className="space-y-4">{perluReview.map((po) => <PoReviewCard key={po.id} po={po} reviewLabel="Pengadaan" />)}</div>
          </section>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Siap Dibayar</h2><p className="page-subtitle">Data ini tersambung ke PATCH /api/po/:id/pembayaran.</p></div>
              <span className="badge badge-warning">{siapBayar.length} antrean</span>
            </div>

            {isLoading && <SkeletonPoCards />}
            {!isLoading && siapBayar.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu pembayaran</div><p className="empty-copy">PO siap dibayar setelah data Pengadaan diterima.</p></div>
            )}

            <div className="space-y-4">{siapBayar.map((po) => <PembayaranForm key={po.id} po={po} />)}</div>
            {meta && meta.last_page > 1 && <PaginationBar meta={meta} page={page} setPage={setPage} />}
          </section>
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
