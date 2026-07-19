import { Link } from 'react-router-dom'
import FormHero from '../components/FormHero'
import DataSpreadsheet, { type SheetColumn } from '../components/DataSpreadsheet'
import { useOperasiList, sudahIsiHasil, type PermintaanOperasi } from '../hooks/useOperasiList'

function num(value: string | null | undefined) {
  if (value === null || value === undefined || value === '') return null
  return Number(value)
}

function tanggal(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('id-ID') : null
}

const columns: SheetColumn<PermintaanOperasi>[] = [
  { key: 'tgl_masuk', label: 'Tanggal Masuk', value: (r) => tanggal(r.data_gudang?.tanggal_masuk) },
  { key: 'gudang', label: 'Nama Gudang', value: (r) => r.data_gudang?.nama_gudang ?? null, filterable: true },
  { key: 'no_out', label: 'No. OUT', value: (r) => r.no_out },
  { key: 'no_mo', label: 'No. MO', value: (r) => r.no_mo },
  { key: 'no_tm_gudang', label: 'No. TM', value: (r) => r.data_gudang?.no_tm ?? r.no_tm },
  { key: 'gabah', label: 'Gabah Diolah (kg)', value: (r) => num(r.gabah_diolah_kg), align: 'right' },
  { key: 'hgl', label: 'HGL Operasi (kg)', value: (r) => num(r.hgl_kg), align: 'right' },
  { key: 'realisasi', label: 'Realisasi HGL (kg)', value: (r) => num(r.data_gudang?.realisasi_hgl), align: 'right' },
  {
    key: 'selisih',
    label: 'Selisih (kg)',
    align: 'right',
    value: (r) => {
      const hgl = num(r.hgl_kg)
      const real = num(r.data_gudang?.realisasi_hgl)
      return hgl !== null && real !== null ? Number((real - hgl).toFixed(2)) : null
    },
  },
  { key: 'broken', label: 'Broken (kg)', value: (r) => num(r.broken_kg), align: 'right' },
  { key: 'menir', label: 'Menir (kg)', value: (r) => num(r.menir_kg), align: 'right' },
  { key: 'katul', label: 'Katul (kg)', value: (r) => num(r.katul_kg), align: 'right' },
  { key: 'rendemen', label: 'Rendemen (%)', value: (r) => num(r.rendemen_persen), align: 'right' },
]

export default function GudangRekapPage() {
  const { data, isLoading } = useOperasiList(1, 200)
  const semua = data?.items ?? []
  // Hanya batch yang sudah benar-benar diterima Gudang.
  const rows = semua.filter((r) => sudahIsiHasil(r) && r.data_gudang)
  const belumDiterima = semua.filter((r) => sudahIsiHasil(r) && !r.data_gudang).length

  const totalRealisasi = rows.reduce((s, r) => s + Number(r.data_gudang?.realisasi_hgl || 0), 0)
  const gudangUnik = new Set(rows.map((r) => r.data_gudang?.nama_gudang).filter(Boolean)).size
  const fmt = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 2 })

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Rekap Gudang"
        title="Rekap Penerimaan Gudang"
        subtitle="Seluruh batch hasil produksi yang sudah diterima gudang. Tabel dapat dicari, disaring per kolom, dan diekspor ke CSV (Excel/Google Sheets)."
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Batch diterima</div><div className="stat-value">{rows.length}</div></div>
          <div className="stat-card"><div className="stat-label">Realisasi HGL (kg)</div><div className="stat-value">{fmt(totalRealisasi)}</div></div>
          <div className="stat-card"><div className="stat-label">Gudang terpakai</div><div className="stat-value">{gudangUnik}</div></div>
          <div className="stat-card"><div className="stat-label">Belum diterima</div><div className="stat-value">{belumDiterima}</div></div>
        </div>

        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">Tabel Rekap Penerimaan</h2>
              <p className="page-subtitle">Satu baris = satu batch yang masuk gudang.</p>
            </div>
            <Link to="/gudang" className="btn btn-ghost border border-border bg-white">Ke halaman input</Link>
          </div>

          <DataSpreadsheet
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            namaFile="rekap-gudang"
            isLoading={isLoading}
            emptyTitle="Belum ada penerimaan gudang"
            emptyCopy="Data muncul setelah Gudang mencatat penerimaan batch hasil produksi."
          />
        </section>
      </div>
    </div>
  )
}
