import { useMemo, useState, type ReactNode } from 'react'
import FormHero from '../components/FormHero'
import { SkeletonPoCards } from '../components/Skeleton'
import GabungPoForm from '../components/pengadaan/GabungPoForm'
import PoInForm from '../components/pengadaan/PoInForm'
import PoSppForm from '../components/pengadaan/PoSppForm'
import PoStatusSergabForm from '../components/pengadaan/PoStatusSergabForm'
import { usePoList, type PoItem } from '../hooks/usePoList'
import { useTransaksiList } from '../hooks/useTransaksiList'
import { pesanKegagalan } from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'

type StepId = 'po' | 'in' | 'spp' | 'status'

const stepLabels: Record<StepId, string> = {
  po: 'Buat PO',
  in: 'Isi IN',
  spp: 'Kirim ke SPP',
  status: 'Status Sergab',
}

function semuaInTerisi(po: PoItem) {
  return po.po_detail.length > 0 && po.po_detail.every((detail) => !!detail.no_in)
}

function masihDiPengadaan(po: PoItem) {
  return po.current_stage?.includes('pengadaan') && po.status !== 'dibatalkan' && po.review_status !== 'menunggu_review' && po.review_status !== 'diterima'
}

export default function PengadaanPage() {
  const [active, setActive] = useState<StepId>('po')
  const { data: transaksiResult, isLoading: loadingTransaksi, isError: transaksiError, error: transaksiLoadError } = useTransaksiList(1, 100, true)
  const { data: poResult, isLoading: loadingPo, isError: poError, error: poLoadError } = usePoList(1, 100)

  const kandidatPo = transaksiResult?.items ?? []
  const poList = poResult?.items ?? []

  const antrean = useMemo(() => {
    const poPengadaan = poList.filter(masihDiPengadaan)
    return {
      in: poPengadaan.filter((po) => !semuaInTerisi(po)),
      spp: poPengadaan.filter((po) => semuaInTerisi(po) && !po.no_spp),
      status: poPengadaan.filter((po) => semuaInTerisi(po) && !!po.no_spp),
    }
  }, [poList])

  const counts: Record<StepId, number> = {
    po: kandidatPo.length,
    in: antrean.in.length,
    spp: antrean.spp.length,
    status: antrean.status.length,
  }

  const tampilkanInSetelahPo = () => setActive('in')

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Pengadaan"
        subtitle="Pantau posisi PO, lengkapi nomor IN, lalu kirim ke SPP hanya saat data sudah benar. Data yang belum dikirim masih bisa diedit."
        badge="Role Pengadaan"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          {(Object.keys(stepLabels) as StepId[]).map((step) => (
            <button key={step} type="button" onClick={() => setActive(step)} className={`stat-card text-left transition-colors ${active === step ? 'ring-2 ring-accent' : ''}`}>
              <div className="stat-label">{stepLabels[step]}</div>
              <div className="stat-value">{counts[step]}</div>
            </button>
          ))}
        </div>

        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">{stepLabels[active]}</h2>
              <p className="page-subtitle">{copyFor(active)}</p>
            </div>
            <span className="badge badge-warning">{counts[active]} antrean</span>
          </div>

          {active === 'po' && (
            <>
              {loadingTransaksi && <SkeletonPoCards />}
              {transaksiError && <LoadError error={transaksiLoadError} fallback="Gagal memuat transaksi siap PO." />}
              {!loadingTransaksi && !transaksiError && <GabungPoForm transaksiList={kandidatPo} onChanged={tampilkanInSetelahPo} kembaliKeDashboard={false} />}
            </>
          )}

          {active === 'in' && <PoList loading={loadingPo} error={poError ? poLoadError : null} empty="Tidak ada PO yang menunggu nomor IN." rows={antrean.in} render={(po) => <PoInForm key={po.id} po={po} />} />}
          {active === 'spp' && <PoList loading={loadingPo} error={poError ? poLoadError : null} empty="Tidak ada PO yang menunggu No. SPP." rows={antrean.spp} render={(po) => <PoSppForm key={po.id} po={po} />} />}
          {active === 'status' && <PoList loading={loadingPo} error={poError ? poLoadError : null} empty="Tidak ada PO yang menunggu Status Sergab." rows={antrean.status} render={(po) => <PoStatusSergabForm key={po.id} po={po} transaksiId={po.po_detail[0]?.transaksi_id} skema={po.po_detail[0]?.skema ?? undefined} />} />}
        </section>
      </div>
    </div>
  )
}

function copyFor(step: StepId) {
  if (step === 'po') return 'Gabungkan transaksi menjadi PO. Setelah PO dibuat, form IN langsung tampil karena PO dan IN satu rangkaian kerja.'
  if (step === 'in') return 'Isi seluruh nomor IN. Setelah disimpan, IN langsung dikunci dan status berubah ke Menunggu SPP.'
  if (step === 'spp') return 'Masukkan No. SPP berdasarkan IN yang sudah dikunci.'
  return 'Pilih Status Sergab. Status Lengkap mengirim data ke Keuangan; Dibatalkan mengembalikan transaksi ke Pengadaan.'
}

function PoList({ loading, error, empty, rows, render }: { loading: boolean; error: unknown | null; empty: string; rows: PoItem[]; render: (po: PoItem) => ReactNode }) {
  if (loading) return <SkeletonPoCards />
  if (error) return <LoadError error={error} fallback="Gagal memuat daftar PO." />
  if (rows.length === 0) return <div className="empty-state"><div className="empty-title">{empty}</div><p className="empty-copy">Data akan muncul otomatis saat tahap sebelumnya tersimpan.</p></div>
  return <div className="space-y-4">{rows.map(render)}</div>
}

function LoadError({ error, fallback }: { error: unknown; fallback: string }) {
  return <div className="alert-danger">{pesanKegagalan(error) ?? apiErrorMessage(error, fallback)}</div>
}
