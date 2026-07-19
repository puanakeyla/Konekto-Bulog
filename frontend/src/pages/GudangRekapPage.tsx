import { Link } from 'react-router-dom'
import FormHero from '../components/FormHero'
import DataSpreadsheet, { type SheetColumn } from '../components/DataSpreadsheet'
import { useGudangList, type DataGudang } from '../hooks/useGudang'
import { pesanKegagalan } from '../lib/api'

function num(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  return Number(value)
}

function tanggal(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('id-ID') : null
}

const columns: SheetColumn<DataGudang>[] = [
  { key: 'tgl_masuk', label: 'Tanggal Masuk', value: (r) => tanggal(r.tanggal_masuk) },
  { key: 'gudang', label: 'Nama Gudang', value: (r) => r.nama_gudang, filterable: true },
  { key: 'realisasi', label: 'Kuantum Realisasi HGL (kg)', value: (r) => num(r.realisasi_hgl), align: 'right' },
  { key: 'no_tm', label: 'No. TM', value: (r) => r.no_tm },
]

export default function GudangRekapPage() {
  const { data, isLoading, isError, error } = useGudangList(1, 500)
  const rows = data?.items ?? []

  const totalRealisasi = rows.reduce((s, r) => s + Number(r.realisasi_hgl || 0), 0)
  const gudangUnik = new Set(rows.map((r) => r.nama_gudang).filter(Boolean)).size
  const fmt = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 2 })

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Rekap Gudang"
        title="Rekap Penerimaan Gudang"
        subtitle="Seluruh pencatatan penerimaan gudang. Tabel dapat dicari, disaring per kolom, dan diekspor ke CSV (Excel/Google Sheets)."
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Total entri</div><div className="stat-value">{rows.length}</div></div>
          <div className="stat-card"><div className="stat-label">Realisasi HGL (kg)</div><div className="stat-value">{fmt(totalRealisasi)}</div></div>
          <div className="stat-card"><div className="stat-label">Gudang tercatat</div><div className="stat-value">{gudangUnik}</div></div>
        </div>

        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">Tabel Rekap Penerimaan</h2>
              <p className="page-subtitle">Satu baris = satu catatan penerimaan gudang.</p>
            </div>
            <Link to="/gudang" className="btn btn-ghost border border-border bg-white">Ke halaman input</Link>
          </div>

          <DataSpreadsheet
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            namaFile="rekap-gudang"
            isLoading={isLoading}
            isError={isError}
            errorMessage={pesanKegagalan(error)}
            emptyTitle="Belum ada penerimaan gudang"
            emptyCopy="Data muncul setelah Gudang mencatat penerimaan lewat halaman input."
          />
        </section>
      </div>
    </div>
  )
}
