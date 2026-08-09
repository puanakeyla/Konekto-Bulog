import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { LABEL_TAHAP, tahapTerlihat, usePengolahanRekap, type PengolahanItem, type SkemaPengolahan, type TahapPengolahan } from '../hooks/usePengolahan'
import DataSpreadsheet, { type SheetColumn } from '../components/DataSpreadsheet'
import DokumenPengolahanModal, { type SlotDokumen } from '../components/DokumenPengolahanModal'
import KartuFoto from '../components/KartuFoto'
import ModalPortal from '../components/ModalPortal'
import { ambilFotoPengolahan, useFotoPengolahanUrl } from '../hooks/useFotoTransaksi'
import api from '../lib/api'
import { labelFoto } from '../lib/fotoDokumen'
import { pesanError } from '../lib/pesanError'

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

/**
 * Kunci penggabungan sel untuk kolom yang nilainya milik MO GABUNGAN, bukan satu pengolahan:
 * No. MO, No. TM ADA, No. TM Gudang, No. OUT, dan Tgl OUT. Satu MO menampung beberapa pengolahan,
 * jadi kelima nomor itu sama persis untuk seluruh anggotanya -- mengulangnya per baris membuat
 * orang menyangka tiap baris punya nomor TM sendiri, lalu heran kenapa memperbaiki satu baris
 * "ikut mengubah" baris lain. Sel gabungan menunjukkan apa yang sebenarnya terjadi: satu nomor
 * untuk satu gabungan. Padanan poMerge() di Rekap Sergab.
 *
 * Memakai id MO, bukan no_mo yang teks bebas: dua MO bisa saja bernomor sama karena salah ketik,
 * dan menggabungkannya jadi satu sel justru menyembunyikan kesalahan itu.
 *
 * Penggabungan hanya benar kalau baris satu MO berdampingan, dan itu dijamin backend --
 * PengolahanController::rekap() mengurutkan grup MO lebih dulu. Kalau urutan di sana diubah,
 * penggabungan di sini ikut pecah.
 */
function moMerge(r: PengolahanItem) {
  return r.mo_detail?.mo ? String(r.mo_detail.mo.id) : null
}

const COLS_OPERASI: Kolom[] = [
  { key: 'no_mo', label: 'No. MO', value: (r) => r.mo_detail?.mo?.no_mo ?? '-', mergeKey: moMerge, searchable: true },
  { key: 'no_tm_ada', label: 'No. TM ADA', value: (r) => r.mo_detail?.mo?.no_tm_ada ?? '-', mergeKey: moMerge },
  { key: 'no_tm_gudang', label: 'No. TM Gudang', value: (r) => r.mo_detail?.mo?.no_tm_gudang ?? '-', mergeKey: moMerge },
]

const COLS_PENGADAAN: Kolom[] = [
  { key: 'no_out', label: 'No. OUT', value: (r) => r.mo_detail?.mo?.no_out ?? '-', mergeKey: moMerge, searchable: true },
  { key: 'tgl_out', label: 'Tgl OUT', value: (r) => tanggal(r.mo_detail?.mo?.tanggal_out), mergeKey: moMerge },
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

/**
 * Satu tabel per skema, masing-masing dipaginasi SENDIRI oleh server. Angka totalnya datang dari
 * `ringkasan` (dihitung server atas seluruh himpunan), bukan dari baris halaman ini -- kalau
 * dijumlah dari `rows`, totalnya ikut mengecil begitu datanya lewat satu halaman.
 */
function TabelSkema({
  skema,
  role,
  onDokumen,
  onEdit,
  onHapus,
  bolehEdit,
}: {
  skema: SkemaPengolahan
  role: string
  onDokumen: (row: PengolahanItem) => void
  onEdit: (row: PengolahanItem) => void
  /** Hanya diberikan untuk admin; tanpa ini tombol Hapus tidak dirender sama sekali. */
  onHapus?: (row: PengolahanItem) => void
  bolehEdit: (row: PengolahanItem) => boolean
}) {
  const [page, setPage] = useState(1)
  const { data, isLoading, isError, error } = usePengolahanRekap(skema, page)

  const rows = data?.data ?? []
  const columns = kolomUntukRole(role, skema)
  const errorMessage = (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ?? null

  const aksiBaris = (row: PengolahanItem) => (
    <div className="flex justify-center gap-2">
      <button
        type="button"
        onClick={() => onDokumen(row)}
        className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-bold text-primary-dark transition-colors hover:border-primary hover:bg-primary-tint"
      >
        Dokumen
      </button>
      {bolehEdit(row) && (
        <button
          type="button"
          onClick={() => onEdit(row)}
          className="rounded-lg border border-primary/20 bg-primary-tint px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white"
        >
          Edit
        </button>
      )}
      {onHapus && (
        <button
          type="button"
          onClick={() => onHapus(row)}
          className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-danger hover:text-white"
        >
          Hapus
        </button>
      )}
    </div>
  )

  return (
    <section className="panel panel-pad mb-6">
      <div className="toolbar-card mb-4">
        <div>
          <h2 className="section-title">Tabel Rekap Pengolahan - {skema}</h2>
          <p className="page-subtitle">
            Satu baris = satu pengolahan {skema} - {columns.length} kolom - {data?.ringkasan.baris ?? 0} baris
          </p>
        </div>
        <span className="badge">Beras HGL: {fmt(data?.ringkasan.beras_hgl ?? 0)} kg</span>
      </div>

      <DataSpreadsheet
        rows={rows}
        columns={columns}
        rowKey={(row) => row.id_pengolahan}
        namaFile={`rekap-pengolahan-${role || 'semua'}-${skema.toLowerCase()}-hal${page}`}
        isLoading={isLoading}
        isError={isError}
        errorMessage={errorMessage}
        renderRowActions={aksiBaris}
        emptyTitle={`Belum ada pengolahan ${skema}`}
        emptyCopy={`Data muncul setelah data tahap Anda pada alur ${skema} diterima tahap berikutnya.`}
      />

      {/* Pencarian & filter di dalam tabel bekerja atas HALAMAN INI -- sama seperti Rekap Sergab. */}
      {data && data.last_page > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>Menampilkan {data.from ?? 0}-{data.to ?? 0} dari {data.total}</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Sebelumnya</button>
            <span className="badge">Halaman {data.current_page}/{data.last_page}</span>
            <button className="btn btn-ghost" disabled={page >= data.last_page} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
          </div>
        </div>
      )}
    </section>
  )
}

/**
 * Cermin PengolahanController::SCOPE_EDIT_REKAP -- blok yang boleh disentuh tiap role saat
 * jatah editnya dibuka admin. Kosmetik saja; penyaring sebenarnya ada di backend, jadi
 * menambah blok di sini tidak memberi izin apa pun.
 */
const SCOPE_EDIT: Record<string, TahapPengolahan[]> = {
  gudang: ['gudang'],
  ub_jastasma: ['ub_jastasma'],
  operasi: ['operasi'],
  pengadaan: ['pengadaan'],
}

/** Blok yang punya isi untuk diedit: tanpa datanya, form-nya cuma kotak kosong. */
function blokTersedia(row: PengolahanItem, blok: TahapPengolahan) {
  if (blok === 'gudang') return !!row.data_gudang
  if (blok === 'ub_jastasma') return !!row.data_lhpk
  return !!row.mo_detail?.mo
}

function blokUntukRole(row: PengolahanItem, role: string): TahapPengolahan[] {
  const izin = role === 'admin' ? (['gudang', 'ub_jastasma', 'operasi', 'pengadaan'] as TahapPengolahan[]) : (SCOPE_EDIT[role] ?? [])
  return izin.filter((blok) => blokTersedia(row, blok))
}

type FormEdit = Record<string, string>

function isiForm(row: PengolahanItem): FormEdit {
  const teks = (value: string | number | null | undefined) => (value === null || value === undefined ? '' : String(value))
  const mo = row.mo_detail?.mo

  return {
    g_tanggal_masuk_gudang: teks(row.data_gudang?.tanggal_masuk_gudang).slice(0, 10),
    g_kuantum_hgl: teks(row.data_gudang?.kuantum_hgl),
    g_plat_mobil: teks(row.data_gudang?.plat_mobil),
    g_supir: teks(row.data_gudang?.supir),
    l_no_lhpk: teks(row.data_lhpk?.no_lhpk),
    l_tanggal_lhpk: teks(row.data_lhpk?.tanggal_lhpk).slice(0, 10),
    l_kuantum_gabah_diolah: teks(row.data_lhpk?.kuantum_gabah_diolah),
    l_kuantum_beras_hgl: teks(row.data_lhpk?.kuantum_beras_hgl),
    l_kualitas: teks(row.data_lhpk?.kualitas),
    l_broken: teks(row.data_lhpk?.broken),
    l_menir: teks(row.data_lhpk?.menir),
    l_katul: teks(row.data_lhpk?.katul),
    l_ka1: teks(row.data_lhpk?.ka1),
    l_ka2: teks(row.data_lhpk?.ka2),
    l_ka3: teks(row.data_lhpk?.ka3),
    l_reject: teks(row.data_lhpk?.reject),
    m_no_mo: teks(mo?.no_mo),
    m_no_tm_ada: teks(mo?.no_tm_ada),
    m_no_tm_gudang: teks(mo?.no_tm_gudang),
    m_no_out: teks(mo?.no_out),
    m_tanggal_out: teks(mo?.tanggal_out).slice(0, 10),
  }
}

/** Hanya blok yang benar-benar boleh & tampil yang dikirim -- sisanya disaring backend juga. */
function payloadEdit(form: FormEdit, blok: TahapPengolahan[]) {
  const teks = (value: string) => (value.trim() === '' ? null : value.trim())
  const angka = (value: string) => (value.trim() === '' ? null : Number(value))

  return {
    ...(blok.includes('gudang') ? { data_gudang: {
      tanggal_masuk_gudang: teks(form.g_tanggal_masuk_gudang),
      kuantum_hgl: angka(form.g_kuantum_hgl),
      plat_mobil: teks(form.g_plat_mobil),
      supir: teks(form.g_supir),
    } } : {}),
    ...(blok.includes('ub_jastasma') ? { data_lhpk: {
      no_lhpk: teks(form.l_no_lhpk),
      tanggal_lhpk: teks(form.l_tanggal_lhpk),
      kuantum_gabah_diolah: angka(form.l_kuantum_gabah_diolah),
      kuantum_beras_hgl: angka(form.l_kuantum_beras_hgl),
      kualitas: teks(form.l_kualitas),
      broken: angka(form.l_broken),
      menir: angka(form.l_menir),
      katul: angka(form.l_katul),
      ka1: angka(form.l_ka1),
      ka2: angka(form.l_ka2),
      ka3: angka(form.l_ka3),
      reject: angka(form.l_reject),
    } } : {}),
    // Dua role berbagi satu blok `mo`, persis seperti blok PO di Rekap Sergab.
    ...(blok.includes('operasi') || blok.includes('pengadaan') ? { mo: {
      ...(blok.includes('operasi') ? {
        no_mo: form.m_no_mo.trim(),
        no_tm_ada: teks(form.m_no_tm_ada),
        no_tm_gudang: teks(form.m_no_tm_gudang),
      } : {}),
      ...(blok.includes('pengadaan') ? {
        no_out: teks(form.m_no_out),
        tanggal_out: teks(form.m_tanggal_out),
      } : {}),
    } } : {}),
  }
}

export default function RekapPengolahanPage() {
  const { user } = useAuth()
  const role = user?.role.nama_role ?? ''
  const queryClient = useQueryClient()
  const [dokumenRow, setDokumenRow] = useState<PengolahanItem | null>(null)
  const [editRow, setEditRow] = useState<PengolahanItem | null>(null)
  const [form, setForm] = useState<FormEdit | null>(null)

  // Admin selalu; role lain hanya selama jatah simpan dari admin masih tersisa, dan hanya
  // untuk blok tahapnya sendiri (dibatasi lagi di backend).
  const sisaJatah = user?.akses_edit_sisa ?? 0
  const aksesSementara = role !== 'admin' && sisaJatah > 0
  const bolehEdit = (row: PengolahanItem) =>
    (role === 'admin' || aksesSementara) && blokUntukRole(row, role).length > 0

  const simpan = useMutation({
    mutationFn: ({ row, body }: { row: PengolahanItem; body: object }) =>
      api.patch(`/api/pengolahan/${encodeURIComponent(row.id_pengolahan)}/admin-rekap`, body),
    onSuccess: (_res, { row }) => {
      toast.success(`Pengolahan ${row.id_pengolahan} diperbarui.`)
      setEditRow(null)
      setForm(null)
      // Jatah berkurang tiap simpan, jadi data user ikut disegarkan supaya tombol Edit
      // hilang sendiri saat habis.
      queryClient.invalidateQueries({ queryKey: ['me'] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-rekap'] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-list'] })
      queryClient.invalidateQueries({ queryKey: ['mo-list'] })
    },
    onError: (err) => toast.error(pesanError(err)),
  })

  // Padanan tombol Hapus di Rekap Sergab: admin saja (backend pun menolak role lain lewat
  // jalur ini). Nomor MO ikut disamakan ulang di server, jadi daftar MO turut disegarkan.
  const hapus = useMutation({
    mutationFn: (row: PengolahanItem) => api.delete(`/api/pengolahan/${encodeURIComponent(row.id_pengolahan)}`),
    onSuccess: (_res, row) => {
      toast.success(`Pengolahan ${row.id_pengolahan} dihapus.`)
      queryClient.invalidateQueries({ queryKey: ['pengolahan-rekap'] })
      queryClient.invalidateQueries({ queryKey: ['pengolahan-list'] })
      queryClient.invalidateQueries({ queryKey: ['mo-list'] })
    },
    onError: (err) => toast.error(pesanError(err)),
  })

  // Hanya untuk kartu ringkasan di kepala halaman: satu permintaan ringan per skema (per_page 1),
  // yang dibaca cuma `ringkasan`-nya.
  const gdg = usePengolahanRekap('GDG', 1, 1)
  const ubj = usePengolahanRekap('UBJ', 1, 1)
  const barisGdg = gdg.data?.ringkasan.baris ?? 0
  const barisUbj = ubj.data?.ringkasan.baris ?? 0
  const totalHgl = (gdg.data?.ringkasan.beras_hgl ?? 0) + (ubj.data?.ringkasan.beras_hgl ?? 0)

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
          <span className="badge">{barisGdg + barisUbj} baris</span>
        </div>

        {aksesSementara && (
          <div className="alert-warning mb-4">
            Admin membuka akses perbaikan untuk Anda: <strong>sisa {sisaJatah} kali simpan</strong>. Tekan <strong>Edit</strong> pada baris yang salah, perbaiki data tahap Anda, lalu simpan — tiap penyimpanan memakai satu jatah.
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total GDG</div>
            <div className="mt-1 text-2xl font-extrabold text-primary-dark">{barisGdg}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total UBJ</div>
            <div className="mt-1 text-2xl font-extrabold text-primary-dark">{barisUbj}</div>
          </div>
          <div className="rounded-lg border border-border bg-surface px-4 py-3">
            <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">Total Beras HGL</div>
            <div className="mt-1 text-2xl font-extrabold text-primary-dark">{fmt(totalHgl)} kg</div>
          </div>
        </div>
      </section>

      {(['GDG', 'UBJ'] as const).map((skema) => (
        <TabelSkema
          key={skema}
          skema={skema}
          role={role}
          onDokumen={setDokumenRow}
          bolehEdit={bolehEdit}
          onEdit={(row) => {
            setEditRow(row)
            setForm(isiForm(row))
          }}
          onHapus={role === 'admin' ? (row) => {
            if (window.confirm(`Hapus pengolahan ${row.id_pengolahan}? Data tahap dan fotonya ikut terhapus, dan total MO-nya dihitung ulang.`)) {
              hapus.mutate(row)
            }
          } : undefined}
        />
      ))}

      {dokumenRow && (
        <DokumenPengolahanModal
          idPengolahan={dokumenRow.id_pengolahan}
          slots={slotDokumen(dokumenRow)}
          onClose={() => setDokumenRow(null)}
        />
      )}

      {editRow && form && (
        <ModalEditPengolahan
          row={editRow}
          role={role}
          form={form}
          blok={blokUntukRole(editRow, role)}
          isSaving={simpan.isPending}
          onChange={(key, value) => setForm((prev) => (prev ? { ...prev, [key]: value } : prev))}
          onClose={() => {
            setEditRow(null)
            setForm(null)
          }}
          onSubmit={() => simpan.mutate({ row: editRow, body: payloadEdit(form, blokUntukRole(editRow, role)) })}
        />
      )}
    </div>
  )
}

type ModalEditProps = {
  row: PengolahanItem
  role: string
  form: FormEdit
  blok: TahapPengolahan[]
  isSaving: boolean
  onChange: (key: string, value: string) => void
  onClose: () => void
  onSubmit: () => void
}

/**
 * Koreksi data pengolahan yang sudah terkunci -- padanan RekapEditModal di Rekap Sergab.
 * Section yang tampil mengikuti `blok`, jadi tiap role hanya melihat tahapnya sendiri.
 */
function ModalEditPengolahan({ row, role, form, blok, isSaving, onChange, onClose, onSubmit }: ModalEditProps) {
  const isAdmin = role === 'admin'

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm">
        <form
          className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-white/40 bg-white shadow-2xl"
          onSubmit={(event) => {
            event.preventDefault()
            onSubmit()
          }}
        >
          <div className="border-b border-border bg-gradient-to-r from-primary-dark via-primary to-primary-dark px-6 py-5 text-white">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-accent">
                  {isAdmin ? 'Edit Rekap Pengolahan' : 'Perbaikan Data Anda'}
                </p>
                <h2 className="mt-1 text-2xl font-extrabold">{row.id_pengolahan}</h2>
                <p className="mt-1 text-sm text-white/70">
                  {isAdmin
                    ? 'Koreksi data terkunci tanpa mengulang alur pengolahan.'
                    : 'Akses dibuka Admin dengan jatah terbatas: tiap penyimpanan memakai satu jatah.'}
                </p>
              </div>
              <div className="flex gap-2">
                <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">{row.skema}</span>
                <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">{LABEL_TAHAP[row.current_stage]}</span>
              </div>
            </div>
          </div>

          <div className="space-y-5 overflow-y-auto bg-surface px-6 py-5">
            {blok.includes('gudang') && (
              <SectionEdit title="Gudang" badge="Gabah masuk gudang">
                <FieldEdit type="date" label="Tanggal Masuk Gudang" value={form.g_tanggal_masuk_gudang} onChange={(v) => onChange('g_tanggal_masuk_gudang', v)} />
                <FieldEdit type="number" label="Kuantum HGL fisik (kg)" value={form.g_kuantum_hgl} onChange={(v) => onChange('g_kuantum_hgl', v)} />
                <FieldEdit label="Plat Mobil" value={form.g_plat_mobil} onChange={(v) => onChange('g_plat_mobil', v)} />
                <FieldEdit label="Supir" value={form.g_supir} onChange={(v) => onChange('g_supir', v)} />
              </SectionEdit>
            )}

            {blok.includes('ub_jastasma') && (
              <SectionEdit title="UB Jastasma" badge="LHPK dan mutu">
                <FieldEdit label="No. LHPK" value={form.l_no_lhpk} onChange={(v) => onChange('l_no_lhpk', v)} />
                <FieldEdit type="date" label="Tanggal LHPK" value={form.l_tanggal_lhpk} onChange={(v) => onChange('l_tanggal_lhpk', v)} />
                <FieldEdit type="number" label="Gabah Diolah (kg)" value={form.l_kuantum_gabah_diolah} onChange={(v) => onChange('l_kuantum_gabah_diolah', v)} />
                <FieldEdit type="number" label="Beras HGL (kg)" value={form.l_kuantum_beras_hgl} onChange={(v) => onChange('l_kuantum_beras_hgl', v)} />
                <FieldEdit label="Kualitas" value={form.l_kualitas} onChange={(v) => onChange('l_kualitas', v)} />
                <FieldEdit type="number" label="Broken" value={form.l_broken} onChange={(v) => onChange('l_broken', v)} />
                <FieldEdit type="number" label="Menir" value={form.l_menir} onChange={(v) => onChange('l_menir', v)} />
                <FieldEdit type="number" label="Katul" value={form.l_katul} onChange={(v) => onChange('l_katul', v)} />
                <FieldEdit type="number" label="KA1" value={form.l_ka1} onChange={(v) => onChange('l_ka1', v)} />
                <FieldEdit type="number" label="KA2" value={form.l_ka2} onChange={(v) => onChange('l_ka2', v)} />
                <FieldEdit type="number" label="KA3" value={form.l_ka3} onChange={(v) => onChange('l_ka3', v)} />
                <FieldEdit type="number" label="Reject" value={form.l_reject} onChange={(v) => onChange('l_reject', v)} />
              </SectionEdit>
            )}

            {(blok.includes('operasi') || blok.includes('pengadaan')) && (
              <SectionEdit
                title="Operasi & Pengadaan"
                badge="Nomor MO dan OUT"
                catatan="Nomor di bawah milik MO gabungan, jadi perubahannya berlaku untuk seluruh anggota MO ini."
              >
                {blok.includes('operasi') && <FieldEdit label="No. MO" value={form.m_no_mo} onChange={(v) => onChange('m_no_mo', v)} />}
                {blok.includes('operasi') && <FieldEdit label="No. TM ADA" value={form.m_no_tm_ada} onChange={(v) => onChange('m_no_tm_ada', v)} />}
                {blok.includes('operasi') && <FieldEdit label="No. TM Gudang" value={form.m_no_tm_gudang} onChange={(v) => onChange('m_no_tm_gudang', v)} />}
                {blok.includes('pengadaan') && <FieldEdit label="No. OUT" value={form.m_no_out} onChange={(v) => onChange('m_no_out', v)} />}
                {blok.includes('pengadaan') && <FieldEdit type="date" label="Tanggal OUT" value={form.m_tanggal_out} onChange={(v) => onChange('m_tanggal_out', v)} />}
              </SectionEdit>
            )}

            <PanelDokumenPengolahan row={row} blok={blok} isAdmin={isAdmin} />
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-border bg-white px-6 py-4 sm:flex-row sm:justify-end">
            <button type="button" onClick={onClose} className="btn btn-ghost">Batal</button>
            <button type="submit" disabled={isSaving} className="btn btn-primary">
              {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </ModalPortal>
  )
}

/**
 * Slot foto rantai pengolahan, masing-masing milik satu tahap: nota timbang punya Gudang, LHPK
 * punya UB Jastasma. Cerminan `$pemilikSlot` di PengolahanController::fotoUpload -- kosmetik saja,
 * penyaring sebenarnya ada di backend.
 */
const SLOT_FOTO: { jenis: 'foto_notim' | 'foto_lhpk'; blok: TahapPengolahan }[] = [
  { jenis: 'foto_notim', blok: 'gudang' },
  { jenis: 'foto_lhpk', blok: 'ub_jastasma' },
]

/**
 * Padanan DokumenAdminPanel di Rekap Sergab: mengganti/menghapus foto tanpa mengulang alur. Slot
 * yang tampil mengikuti `blok`, jadi tiap role hanya memegang foto tahapnya sendiri; Operasi &
 * Pengadaan tidak punya slot foto sama sekali sehingga panelnya tidak dirender untuk mereka.
 */
function PanelDokumenPengolahan({ row, blok, isAdmin }: { row: PengolahanItem; blok: TahapPengolahan[]; isAdmin: boolean }) {
  const slots = SLOT_FOTO.filter((slot) => blok.includes(slot.blok))

  if (slots.length === 0) return null

  return (
    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-primary-dark">Dokumen {row.skema}</h3>
          <p className="mt-1 text-xs text-slate-500">
            {isAdmin
              ? 'Lihat/download ulang, ganti file, atau hapus foto pengolahan.'
              : 'Lihat/download ulang atau ganti file foto tahap Anda.'}
          </p>
        </div>
        <span className="rounded-full bg-primary-tint px-3 py-1 text-[0.68rem] font-bold text-primary">{slots.length} slot dokumen</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {slots.map((slot) => (
          <KartuFotoPengolahan key={slot.jenis} idPengolahan={row.id_pengolahan} slot={slot} bolehHapus={isAdmin} />
        ))}
      </div>
    </section>
  )
}

function KartuFotoPengolahan({
  idPengolahan,
  slot,
  bolehHapus,
}: {
  idPengolahan: string
  slot: (typeof SLOT_FOTO)[number]
  bolehHapus: boolean
}) {
  const queryClient = useQueryClient()
  const { data: thumb } = useFotoPengolahanUrl(idPengolahan, slot.jenis, true, 'thumb')
  const path = `/api/pengolahan/${encodeURIComponent(idPengolahan)}/foto`
  // Prefix key: menyegarkan varian 'thumb' DAN 'asli' sekaligus -- keduanya menunjuk media yang
  // baru saja berganti.
  const segarkan = () => queryClient.invalidateQueries({ queryKey: ['foto-pengolahan-url', idPengolahan, slot.jenis] })

  return (
    <KartuFoto
      label={labelFoto(slot.jenis)}
      badge={LABEL_TAHAP[slot.blok]}
      thumbUrl={thumb}
      ambilAsli={(opts) => ambilFotoPengolahan(idPengolahan, slot.jenis, opts)}
      onGanti={async (file) => {
        const body = new FormData()
        body.append('jenis_foto', slot.jenis)
        body.append('foto', file)
        await api.post(path, body, { headers: { 'Content-Type': 'multipart/form-data' } })
        await segarkan()
      }}
      onHapus={bolehHapus ? async () => {
        await api.delete(`${path}/${slot.jenis}`)
        await segarkan()
      } : undefined}
    />
  )
}

function SectionEdit({ title, badge, catatan, children }: { title: string; badge: string; catatan?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-extrabold text-primary-dark">{title}</h3>
          {catatan && <p className="mt-1 text-xs text-slate-500">{catatan}</p>}
        </div>
        <span className="rounded-full bg-primary-tint px-3 py-1 text-[0.68rem] font-bold text-primary">{badge}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

function FieldEdit({
  label,
  value,
  onChange,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  type?: 'text' | 'number' | 'date'
}) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <input
        type={type}
        step={type === 'number' ? '0.01' : undefined}
        min={type === 'number' ? '0' : undefined}
        className="input"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}
