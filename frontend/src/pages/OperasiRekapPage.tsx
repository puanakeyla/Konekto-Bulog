import { Link } from 'react-router-dom'
import FormHero from '../components/FormHero'
import DataSpreadsheet, { type SheetColumn } from '../components/DataSpreadsheet'
import { useOperasiList, sudahIsiHasil, type PermintaanOperasi } from '../hooks/useOperasiList'
import { pesanKegagalan } from '../lib/api'

function num(value: string | null) {
  if (value === null || value === '') return null
  return Number(value)
}

function tanggal(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('id-ID') : null
}

const columns: SheetColumn<PermintaanOperasi>[] = [
  { key: 'tanggal', label: 'Tanggal Ajuan', value: (r) => tanggal(r.created_at) },
  { key: 'pengaju', label: 'Diajukan Oleh', value: (r) => r.creator?.username ?? null },
  { key: 'gabah', label: 'Gabah Diolah (kg)', value: (r) => num(r.gabah_diolah_kg), align: 'right' },
  { key: 'no_out', label: 'No. OUT', value: (r) => r.no_out },
  { key: 'kuantum_out', label: 'Kuantum OUT (kg)', value: (r) => num(r.kuantum_out), align: 'right' },
  { key: 'no_mo', label: 'No. MO', value: (r) => r.no_mo },
  { key: 'no_tm', label: 'No. TM', value: (r) => r.no_tm },
  { key: 'hgl', label: 'HGL (kg)', value: (r) => num(r.hgl_kg), align: 'right' },
  { key: 'broken', label: 'Broken (kg)', value: (r) => num(r.broken_kg), align: 'right' },
  { key: 'menir', label: 'Menir (kg)', value: (r) => num(r.menir_kg), align: 'right' },
  { key: 'katul', label: 'Katul (kg)', value: (r) => num(r.katul_kg), align: 'right' },
  { key: 'rendemen', label: 'Rendemen (%)', value: (r) => num(r.rendemen_persen), align: 'right' },
  // Catatan Pengembalian dihapus: hanya terisi saat status_out === 'dikembalikan',
  // tapi baris di halaman ini selalu status_out === 'dikeluarkan' (lihat sudahIsiHasil),
  // jadi kolomnya selalu kosong.
  { key: 'gudang', label: 'Gudang Penerima', value: (r) => r.data_gudang?.nama_gudang ?? null, filterable: true },
  { key: 'tgl_masuk', label: 'Tanggal Masuk Gudang', value: (r) => tanggal(r.data_gudang?.tanggal_masuk) },
]

export default function OperasiRekapPage() {
  const { data, isLoading, isError, error } = useOperasiList(1, 200)
  // Hanya batch yang sudah dikeluarkan Pengadaan dan hasil produksinya sudah diisi —
  // datanya tidak berubah lagi. Disaring di frontend, bukan di OperasiController::index(),
  // karena endpoint yang sama dipakai halaman input OperasiPage.
  const rows = (data?.items ?? []).filter(sudahIsiHasil)

  const totalGabah = rows.reduce((s, r) => s + Number(r.gabah_diolah_kg || 0), 0)
  const totalHgl = rows.reduce((s, r) => s + Number(r.hgl_kg || 0), 0)
  const rerataRendemen = (() => {
    const withR = rows.filter((r) => r.rendemen_persen !== null)
    if (withR.length === 0) return 0
    return withR.reduce((s, r) => s + Number(r.rendemen_persen), 0) / withR.length
  })()

  const fmt = (v: number) => v.toLocaleString('id-ID', { maximumFractionDigits: 2 })

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Rekap Operasi"
        title="Rekap Hasil Operasi"
        subtitle="Batch yang sudah dikeluarkan dan hasil produksinya sudah diisi. Tabel dapat dicari, disaring per kolom, dan diekspor ke CSV (Excel/Google Sheets)."
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Batch selesai</div><div className="stat-value">{rows.length}</div></div>
          <div className="stat-card"><div className="stat-label">Gabah diolah (kg)</div><div className="stat-value">{fmt(totalGabah)}</div></div>
          <div className="stat-card"><div className="stat-label">Total HGL (kg)</div><div className="stat-value">{fmt(totalHgl)}</div></div>
          <div className="stat-card"><div className="stat-label">Rerata rendemen</div><div className="stat-value">{fmt(rerataRendemen)}%</div></div>
        </div>

        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">Tabel Rekap Operasi</h2>
              <p className="page-subtitle">Satu baris = satu permintaan pengeluaran stok.</p>
            </div>
            <Link to="/operasi" className="btn btn-ghost border border-border bg-white">Ke halaman input</Link>
          </div>

          <DataSpreadsheet
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id}
            namaFile="rekap-operasi"
            isLoading={isLoading}
            isError={isError}
            errorMessage={pesanKegagalan(error)}
            emptyTitle="Belum ada permintaan Operasi"
            emptyCopy="Data muncul setelah Operasi mengajukan pengeluaran stok."
          />
        </section>
      </div>
    </div>
  )
}
