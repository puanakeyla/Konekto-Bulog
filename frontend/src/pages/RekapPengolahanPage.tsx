import { usePengolahanRekap, type PengolahanItem } from '../hooks/usePengolahan'
import DataSpreadsheet, { type SheetColumn } from '../components/DataSpreadsheet'

function num(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 0
  return Number(value) || 0
}

function fmt(value: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value)
}

function tanggal(value: string | null | undefined) {
  return value ? value.slice(0, 10) : '-'
}

const columns: SheetColumn<PengolahanItem>[] = [
  { key: 'id', label: 'ID Pengolahan', value: (r) => r.id_pengolahan, searchable: true },
  { key: 'skema', label: 'Skema', value: (r) => r.skema, filterable: true },
  { key: 'makloon', label: 'Makloon', value: (r) => r.makloon?.nama_maklon ?? '-', filterable: true, searchable: true },

  { key: 'gudang_asal', label: 'Gudang Asal', value: (r) => r.data_gudang?.gudang?.nama ?? '-', filterable: true },
  { key: 'tgl_masuk', label: 'Tgl Masuk Gudang', value: (r) => tanggal(r.data_gudang?.tanggal_masuk_gudang) },
  { key: 'hgl_fisik', label: 'Kuantum HGL (fisik)', value: (r) => fmt(num(r.data_gudang?.kuantum_hgl)), align: 'right' },
  { key: 'plat', label: 'Plat', value: (r) => r.data_gudang?.plat_mobil ?? '-' },
  { key: 'supir', label: 'Supir', value: (r) => r.data_gudang?.supir ?? '-' },

  { key: 'no_lhpk', label: 'No. LHPK', value: (r) => r.data_lhpk?.no_lhpk ?? '-', searchable: true },
  { key: 'tgl_lhpk', label: 'Tgl LHPK', value: (r) => tanggal(r.data_lhpk?.tanggal_lhpk) },
  { key: 'gudang_tujuan', label: 'Gudang Tujuan', value: (r) => r.data_lhpk?.gudang_tujuan?.nama ?? '-', filterable: true },
  { key: 'stok_gudang', label: 'Stok Gudang', value: (r) => fmt(num(r.data_lhpk?.kuantum_stok_gudang)), align: 'right' },
  { key: 'gabah_diolah', label: 'Gabah Diolah', value: (r) => fmt(num(r.data_lhpk?.kuantum_gabah_diolah)), align: 'right' },
  { key: 'beras_hgl', label: 'Beras HGL', value: (r) => fmt(num(r.data_lhpk?.kuantum_beras_hgl)), align: 'right' },
  { key: 'kualitas', label: 'Kualitas', value: (r) => r.data_lhpk?.kualitas ?? '-', filterable: true },
  { key: 'broken', label: 'Broken', value: (r) => fmt(num(r.data_lhpk?.broken)), align: 'right' },
  { key: 'menir', label: 'Menir', value: (r) => fmt(num(r.data_lhpk?.menir)), align: 'right' },
  { key: 'katul', label: 'Katul', value: (r) => fmt(num(r.data_lhpk?.katul)), align: 'right' },
  { key: 'ka1', label: 'KA1', value: (r) => fmt(num(r.data_lhpk?.ka1)), align: 'right' },
  { key: 'ka2', label: 'KA2', value: (r) => fmt(num(r.data_lhpk?.ka2)), align: 'right' },
  { key: 'ka3', label: 'KA3', value: (r) => fmt(num(r.data_lhpk?.ka3)), align: 'right' },
  { key: 'reject', label: 'Reject', value: (r) => fmt(num(r.data_lhpk?.reject)), align: 'right' },
  { key: 'rendemen', label: 'Rendemen', value: (r) => `${fmt(r.data_lhpk?.rendemen ?? 0)}%`, align: 'right' },

  // Selisih HGL fisik (timbangan gudang) dengan beras HGL menurut LHPK. Dua angka itu memang
  // sengaja tidak dipaksa sama; selisihnya inilah yang mau dipantau.
  {
    key: 'susut',
    label: 'Susut',
    value: (r) => fmt(num(r.data_gudang?.kuantum_hgl) - num(r.data_lhpk?.kuantum_beras_hgl)),
    align: 'right',
  },

  { key: 'no_mo', label: 'No. MO', value: (r) => r.mo_detail?.mo?.no_mo ?? '-', searchable: true },
  { key: 'no_out', label: 'No. OUT', value: (r) => r.mo_detail?.mo?.no_out ?? '-', searchable: true },
  { key: 'tgl_out', label: 'Tgl OUT', value: (r) => tanggal(r.mo_detail?.mo?.tanggal_out) },
  {
    key: 'status',
    label: 'Status',
    value: (r) => (r.status_keseluruhan === 'selesai' ? 'Selesai' : `Tahap ${r.current_stage}`),
    filterable: true,
  },
]

export default function RekapPengolahanPage() {
  const { data, isLoading, isError, error } = usePengolahanRekap()
  const rows = data ?? []
  const rowsGdg = rows.filter((row) => row.skema === 'GDG')
  const rowsUbj = rows.filter((row) => row.skema === 'UBJ')
  const totalHglGdg = rowsGdg.reduce((sum, row) => sum + num(row.data_lhpk?.kuantum_beras_hgl), 0)
  const totalHglUbj = rowsUbj.reduce((sum, row) => sum + num(row.data_lhpk?.kuantum_beras_hgl), 0)

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 2xl:max-w-[104rem]">
      <section className="panel panel-pad mb-6">
        <div className="toolbar-card mb-4">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent">Rekap</p>
            <h1 className="section-title mt-1">Rekap Pengolahan</h1>
            <p className="page-subtitle">Data dipisah per skema GDG dan UBJ agar mudah dicek seperti Rekap Data.</p>
          </div>
          <span className="badge">{rows.length} baris</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total GDG</div>
            <div className="mt-1 text-2xl font-extrabold text-primary-dark">{rowsGdg.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total UBJ</div>
            <div className="mt-1 text-2xl font-extrabold text-primary-dark">{rowsUbj.length}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total Beras HGL</div>
            <div className="mt-1 text-2xl font-extrabold text-primary-dark">{fmt(totalHglGdg + totalHglUbj)} kg</div>
          </div>
        </div>
      </section>

      <section className="panel panel-pad mb-6">
        <div className="toolbar-card mb-4">
          <div>
            <h2 className="section-title">Tabel Rekap Pengolahan - GDG</h2>
            <p className="page-subtitle">Satu baris = satu pengolahan GDG - {columns.length} kolom - {rowsGdg.length} baris</p>
          </div>
          <span className="badge">Beras HGL: {fmt(totalHglGdg)} kg</span>
        </div>
        <DataSpreadsheet
          rows={rowsGdg}
          columns={columns}
          rowKey={(row) => row.id_pengolahan}
          namaFile="rekap-pengolahan-gdg"
          isLoading={isLoading}
          isError={isError}
          errorMessage={(error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ?? null}
          emptyTitle="Belum ada pengolahan GDG"
          emptyCopy="Data muncul setelah Gudang memulai alur pengolahan GDG."
        />
      </section>

      <section className="panel panel-pad">
        <div className="toolbar-card mb-4">
          <div>
            <h2 className="section-title">Tabel Rekap Pengolahan - UBJ</h2>
            <p className="page-subtitle">Satu baris = satu pengolahan UBJ - {columns.length} kolom - {rowsUbj.length} baris</p>
          </div>
          <span className="badge">Beras HGL: {fmt(totalHglUbj)} kg</span>
        </div>
        <DataSpreadsheet
          rows={rowsUbj}
          columns={columns}
          rowKey={(row) => row.id_pengolahan}
          namaFile="rekap-pengolahan-ubj"
          isLoading={isLoading}
          isError={isError}
          errorMessage={(error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ?? null}
          emptyTitle="Belum ada pengolahan UBJ"
          emptyCopy="Data muncul setelah UB Jastasma memulai alur pengolahan UBJ."
        />
      </section>
    </div>
  )
}
