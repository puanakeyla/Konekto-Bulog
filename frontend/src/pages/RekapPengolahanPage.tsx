import { useState } from 'react'
import { useAuth } from '../hooks/useAuth'
import { LABEL_TAHAP, tahapTerlihat, usePengolahanRekap, type PengolahanItem, type SkemaPengolahan, type TahapPengolahan } from '../hooks/usePengolahan'
import DataSpreadsheet, { type SheetColumn } from '../components/DataSpreadsheet'
import DokumenPengolahanModal, { type SlotDokumen } from '../components/DokumenPengolahanModal'

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

type Kolom = SheetColumn<PengolahanItem>

const COLS_UMUM: Kolom[] = [
  { key: 'id', label: 'ID Pengolahan', value: (r) => r.id_pengolahan, searchable: true },
  { key: 'skema', label: 'Skema', value: (r) => r.skema, filterable: true },
  { key: 'makloon', label: 'Makloon', value: (r) => r.makloon?.nama_maklon ?? '-', filterable: true, searchable: true },
  // Satu gudang per pengolahan, dipilih saat dibuat -- dulu terpecah jadi "asal" & "tujuan"
  // di dua tabel tahap, padahal keduanya selalu gudang yang sama.
  { key: 'gudang', label: 'Gudang', value: (r) => r.gudang?.nama ?? '-', filterable: true, searchable: true },
  {
    key: 'status',
    label: 'Status',
    value: (r) => (r.status_keseluruhan === 'selesai' ? 'Selesai' : `Tahap ${LABEL_TAHAP[r.current_stage]}`),
    filterable: true,
  },
]

const COLS_GUDANG: Kolom[] = [
  { key: 'tgl_masuk', label: 'Tgl Masuk Gudang', value: (r) => tanggal(r.data_gudang?.tanggal_masuk_gudang) },
  { key: 'hgl_fisik', label: 'Kuantum HGL (fisik)', value: (r) => fmt(num(r.data_gudang?.kuantum_hgl)), align: 'right' },
  { key: 'plat', label: 'Plat', value: (r) => r.data_gudang?.plat_mobil ?? '-' },
  { key: 'supir', label: 'Supir', value: (r) => r.data_gudang?.supir ?? '-' },
]

// Angka mutu (broken s/d reject) BUKAN persen -- ditampilkan apa adanya. Hanya rendemen yang persen.
const COLS_LHPK: Kolom[] = [
  { key: 'no_lhpk', label: 'No. LHPK', value: (r) => r.data_lhpk?.no_lhpk ?? '-', searchable: true },
  { key: 'tgl_lhpk', label: 'Tgl LHPK', value: (r) => tanggal(r.data_lhpk?.tanggal_lhpk) },
  { key: 'stok_gudang', label: 'Stok Gudang saat LHPK', value: (r) => fmt(num(r.data_lhpk?.kuantum_stok_gudang)), align: 'right' },
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
]

// Selisih HGL fisik (timbangan gudang) dengan beras HGL menurut LHPK. Dua angka itu memang
// sengaja tidak dipaksa sama; selisihnya inilah yang mau dipantau. Hanya bermakna kalau kolom
// Gudang DAN LHPK dua-duanya tampil, jadi ia berdiri di luar kedua blok.
const COL_SUSUT: Kolom = {
  key: 'susut',
  label: 'Susut',
  value: (r) => fmt(num(r.data_gudang?.kuantum_hgl) - num(r.data_lhpk?.kuantum_beras_hgl)),
  align: 'right',
}

const COLS_OPERASI: Kolom[] = [
  { key: 'no_mo', label: 'No. MO', value: (r) => r.mo_detail?.mo?.no_mo ?? '-', searchable: true },
  { key: 'no_tm_ada', label: 'No. TM ADA', value: (r) => r.mo_detail?.mo?.no_tm_ada ?? '-' },
  { key: 'no_tm_gudang', label: 'No. TM Gudang', value: (r) => r.mo_detail?.mo?.no_tm_gudang ?? '-' },
]

const COLS_PENGADAAN: Kolom[] = [
  { key: 'no_out', label: 'No. OUT', value: (r) => r.mo_detail?.mo?.no_out ?? '-', searchable: true },
  { key: 'tgl_out', label: 'Tgl OUT', value: (r) => tanggal(r.mo_detail?.mo?.tanggal_out) },
]

const KOLOM_TAHAP: Record<TahapPengolahan, Kolom[]> = {
  gudang: COLS_GUDANG,
  ub_jastasma: COLS_LHPK,
  operasi: COLS_OPERASI,
  pengadaan: COLS_PENGADAAN,
}

function kolomUntukRole(role: string, skema: SkemaPengolahan): Kolom[] {
  const tahap = tahapTerlihat(role, skema)
  const stageCols = tahap.flatMap((item) => KOLOM_TAHAP[item])
  const lengkap = tahap.includes('gudang') && tahap.includes('ub_jastasma')

  return [...COLS_UMUM, ...stageCols, ...(lengkap ? [COL_SUSUT] : [])]
}

export default function RekapPengolahanPage() {
  const { user } = useAuth()
  const role = user?.role.nama_role ?? ''
  const { data, isLoading, isError, error } = usePengolahanRekap()
  const [dokumenRow, setDokumenRow] = useState<PengolahanItem | null>(null)

  const rows = data ?? []
  const rowsGdg = rows.filter((row) => row.skema === 'GDG')
  const rowsUbj = rows.filter((row) => row.skema === 'UBJ')
  const totalHglGdg = rowsGdg.reduce((sum, row) => sum + num(row.data_lhpk?.kuantum_beras_hgl), 0)
  const totalHglUbj = rowsUbj.reduce((sum, row) => sum + num(row.data_lhpk?.kuantum_beras_hgl), 0)
  const errorMessage = (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ?? null

  // Slot foto ikut aturan kolom: hanya tahap yang boleh dilihat role ini yang punya kartu.
  const slotDokumen = (row: PengolahanItem): SlotDokumen[] => {
    const terlihat = tahapTerlihat(role, row.skema)
    const slots: SlotDokumen[] = []
    if (terlihat.includes('gudang')) {
      slots.push({ jenisFoto: 'foto_notim', tahap: LABEL_TAHAP.gudang, ada: !!row.data_gudang })
    }
    if (terlihat.includes('ub_jastasma')) {
      slots.push({ jenisFoto: 'foto_lhpk', tahap: LABEL_TAHAP.ub_jastasma, ada: !!row.data_lhpk })
    }
    return slots
  }

  const aksiBaris = (row: PengolahanItem) => (
    <div className="flex justify-center">
      <button
        type="button"
        onClick={() => setDokumenRow(row)}
        className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-bold text-primary-dark transition-colors hover:border-primary hover:bg-primary-tint"
      >
        Dokumen
      </button>
    </div>
  )

  const tabel = (skema: SkemaPengolahan, rowsSkema: PengolahanItem[], total: number) => {
    const columns = kolomUntukRole(role, skema)

    return (
      <section className="panel panel-pad mb-6" key={skema}>
        <div className="toolbar-card mb-4">
          <div>
            <h2 className="section-title">Tabel Rekap Pengolahan - {skema}</h2>
            <p className="page-subtitle">Satu baris = satu pengolahan {skema} - {columns.length} kolom - {rowsSkema.length} baris</p>
          </div>
          <span className="badge">Beras HGL: {fmt(total)} kg</span>
        </div>
        <DataSpreadsheet
          rows={rowsSkema}
          columns={columns}
          rowKey={(row) => row.id_pengolahan}
          namaFile={`rekap-pengolahan-${role || 'semua'}-${skema.toLowerCase()}`}
          isLoading={isLoading}
          isError={isError}
          errorMessage={errorMessage}
          renderRowActions={aksiBaris}
          emptyTitle={`Belum ada pengolahan ${skema}`}
          emptyCopy={`Data muncul setelah data tahap Anda pada alur ${skema} diterima tahap berikutnya.`}
        />
      </section>
    )
  }

  return (
    <div className="mx-auto max-w-[96rem] px-4 py-8 sm:px-6 2xl:max-w-[104rem]">
      <section className="panel panel-pad mb-6">
        <div className="toolbar-card mb-4">
          <div>
            <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent">Rekap</p>
            <h1 className="section-title mt-1">Rekap Pengolahan</h1>
            <p className="page-subtitle">
              Dipisah per skema GDG dan UBJ, seperti Rekap Sergab. Kolomnya kumulatif sampai tahap Anda saja,
              dan sebuah baris baru masuk rekap setelah data tahap Anda <strong>diterima</strong>.
            </p>
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

      {tabel('GDG', rowsGdg, totalHglGdg)}
      {tabel('UBJ', rowsUbj, totalHglUbj)}

      {dokumenRow && (
        <DokumenPengolahanModal
          idPengolahan={dokumenRow.id_pengolahan}
          slots={slotDokumen(dokumenRow)}
          onClose={() => setDokumenRow(null)}
        />
      )}
    </div>
  )
}
