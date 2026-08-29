import { useState } from 'react'
import { usePoList, useRingkasanKeuangan } from '../hooks/usePoList'
import PaginationBar from '../components/PaginationBar'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'
import { formatMoney } from '../lib/poFormat'
import { pesanKegagalan } from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import PembayaranForm from '../components/pengadaan/PembayaranForm'
import PoReviewCard from '../components/pengadaan/PoReviewCard'

export default function KeuanganPage() {
  const [page, setPage] = useState(1)
  const { data: poResult, isLoading, isError, error } = usePoList(page)
  const poList = poResult?.items ?? []
  const meta = poResult?.meta
  // Keuangan hanya boleh memproses PO yang transaksi anggotanya memang sedang di tahap
  // keuangan. Tanpa guard ini, data lama yang sudah maju ke Operasi tetapi review_status
  // PO-nya tertinggal "menunggu_review" masih muncul sebagai antrean palsu.
  const poTahapKeuangan = poList.filter((po) => po.current_stage?.includes('keuangan'))
  const perluReview = poTahapKeuangan.filter((po) => po.review_status === 'menunggu_review')
  const siapBayar = poTahapKeuangan.filter((po) => po.review_status === 'diterima' && po.data_keuangan?.status_bayar !== 'dibayarkan')
  // Kartu memakai angka dari backend, bukan hitungan atas poList: poList cuma berisi 20 PO
  // halaman yang sedang terbuka, jadi keempat angkanya dulu berubah tiap ganti halaman.
  const { data: ringkasan } = useRingkasanKeuangan()

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Keuangan — Pembayaran PO"
        subtitle="Tinjau data Pengadaan, lalu input tanggal bayar untuk PO yang diterima."
        badge="Role Keuangan"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Menunggu review</div><div className="stat-value">{ringkasan?.perlu_review ?? '-'}</div></div>
            <div className="stat-card"><div className="stat-label">Menunggu bayar</div><div className="stat-value">{ringkasan?.siap_bayar ?? '-'}</div></div>
            <div className="stat-card"><div className="stat-label">Sudah dibayar</div><div className="stat-value">{ringkasan?.sudah_dibayar ?? '-'}</div></div>
            <div className="stat-card"><div className="stat-label">Nilai antrean</div><div className="stat-value text-base leading-tight">{ringkasan ? formatMoney(ringkasan.nilai_antrean) : '-'}</div></div>
          </div>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Menunggu Persetujuan</h2><p className="page-subtitle">Terima untuk mengunci data Pengadaan, atau tolak untuk minta revisi.</p></div>
              <span className="badge badge-warning">{ringkasan?.perlu_review ?? perluReview.length} antrean</span>
            </div>

            {isLoading && <SkeletonPoCards />}
            {isError && <LoadError error={error} fallback="Gagal memuat PO yang menunggu persetujuan." />}
            {!isLoading && !isError && perluReview.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu persetujuan</div><p className="empty-copy">PO muncul di sini setelah Pengadaan mengisi seluruh nomor IN.</p></div>
            )}

            {!isError && <div className="space-y-4">{perluReview.map((po) => <PoReviewCard key={po.id} po={po} reviewLabel="Pengadaan" />)}</div>}
          </section>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Siap Dibayar</h2><p className="page-subtitle">No. SPP dan status Sergab berasal dari Pengadaan; Keuangan melanjutkan pembayaran.</p></div>
              <span className="badge badge-warning">{ringkasan?.siap_bayar ?? siapBayar.length} antrean</span>
            </div>

            {isLoading && <SkeletonPoCards />}
            {isError && <LoadError error={error} fallback="Gagal memuat PO yang siap dibayar." />}
            {!isLoading && !isError && siapBayar.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu pembayaran</div><p className="empty-copy">PO siap dibayar setelah data Pengadaan diterima.</p></div>
            )}

            {!isError && <div className="space-y-4">{siapBayar.map((po) => <PembayaranForm key={po.id} po={po} />)}</div>}
            {!isError && meta && meta.last_page > 1 && <PaginationBar meta={meta} page={page} setPage={setPage} satuan="PO" />}
          </section>
      </div>
    </div>
  )
}

function LoadError({ error, fallback }: { error: unknown; fallback: string }) {
  return (
    <div className="alert-danger">
      {pesanKegagalan(error) ?? apiErrorMessage(error, fallback)}
    </div>
  )
}
