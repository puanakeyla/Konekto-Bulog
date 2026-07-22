import { useState, type ReactNode } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import FormHero from '../components/FormHero'
import DataSpreadsheet, { type SheetColumn } from '../components/DataSpreadsheet'
import KabupatenSelect from '../components/KabupatenSelect'
import { useAuth } from '../hooks/useAuth'
import { useRekapTransaksi, type RekapTransaksi } from '../hooks/useRekapTransaksi'
import { useMakloonOptions } from '../hooks/useMakloonOptions'
import api, { pesanKegagalan } from '../lib/api'

/**
 * Rekap lintas tahap, kolomnya KUMULATIF sesuai role:
 *   jemput_pangan -> JP
 *   makloon       -> JP + Makloon
 *   ub_jastasma   -> JP + Makloon + UB
 *   pengadaan     -> ... + Pengadaan
 *   keuangan      -> ... + Keuangan
 * Sumber datanya sama dengan timeline, jadi begitu tahap diedit/dikunci tabel ikut menyesuaikan.
 */
const STAGE_ORDER = ['jemput_pangan', 'makloon', 'ub_jastasma', 'pengadaan', 'keuangan'] as const
type StageKey = (typeof STAGE_ORDER)[number]

function num(v: string | null | undefined) {
  if (v === null || v === undefined || v === '') return null
  return Number(v)
}

function tgl(v: string | null | undefined) {
  return v ? new Date(v).toLocaleDateString('id-ID') : null
}

function inputDate(v: string | null | undefined) {
  if (!v) return ''
  return String(v).slice(0, 10)
}

function field(v: string | number | null | undefined) {
  return v === null || v === undefined ? '' : String(v)
}

function nullable(v: string) {
  const clean = v.trim()
  return clean === '' ? null : clean
}

function numeric(v: string) {
  const clean = v.trim()
  return clean === '' ? null : Number(clean)
}

function numberValue(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === '') return 0
  const parsed = Number(v)
  return Number.isFinite(parsed) ? parsed : 0
}

function formatKg(value: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(value)
}

type RejectInfo = { stage: string; catatan: string | null }

const STAGE_LABELS: Record<string, string> = {
  jemput_pangan: 'Jemput Pangan',
  makloon: 'Makloon',
  makloon_kirim: 'Makloon Kirim',
  makloon_terima: 'Makloon Terima',
  ub_jastasma: 'UB Jastasma',
  pengadaan: 'Pengadaan',
  keuangan: 'Keuangan',
}

function labelTahap(stage: string) {
  return STAGE_LABELS[stage] ?? stage.replaceAll('_', ' ')
}

function rejectedStages(row: RekapTransaksi): RejectInfo[] {
  const items: RejectInfo[] = []
  if (row.data_jemput_pangan?.status === 'ditolak') items.push({ stage: 'jemput_pangan', catatan: row.data_jemput_pangan.catatan_penolakan ?? null })
  if (row.data_makloon_tjp?.status === 'ditolak' || row.data_makloon_mpp?.status === 'ditolak') {
    items.push({ stage: row.skema === 'MPP' ? 'makloon_kirim' : 'makloon', catatan: (row.data_makloon_tjp?.catatan_penolakan ?? row.data_makloon_mpp?.catatan_penolakan) ?? null })
  }
  if (row.data_ub_jastasma?.status === 'ditolak') items.push({ stage: 'ub_jastasma', catatan: row.data_ub_jastasma.catatan_penolakan ?? null })
  if (row.data_pengadaan?.review_status === 'ditolak') items.push({ stage: 'pengadaan', catatan: null })
  if (row.data_pengadaan?.data_keuangan?.review_status === 'ditolak') items.push({ stage: 'keuangan', catatan: null })
  return items
}

function rejectedText(row: RekapTransaksi) {
  const stages = rejectedStages(row).map((item) => labelTahap(item.stage))
  return stages.length > 0 ? stages.join(', ') : null
}

function RejectedMarker({ row }: { row: RekapTransaksi }) {
  const rejected = rejectedStages(row)
  if (rejected.length === 0) return <span className="text-xs text-slate-400">-</span>
  return (
    <div className="flex min-w-[9rem] flex-col gap-1">
      <span className="w-fit rounded-md bg-danger-bg px-2 py-1 text-[0.68rem] font-bold text-danger">Ditolak</span>
      <span className="whitespace-normal text-[0.72rem] font-semibold leading-4 text-danger">{rejected.map((item) => labelTahap(item.stage)).join(', ')}</span>
    </div>
  )
}

const COLS_UMUM: SheetColumn<RekapTransaksi>[] = [
  { key: 'id', label: 'ID Transaksi', value: (r) => r.id_transaksi },
  { key: 'skema', label: 'Skema', value: (r) => r.skema, filterable: true },
  { key: 'penanda', label: 'Penanda', value: rejectedText, render: (r) => <RejectedMarker row={r} />, filterable: true, searchable: true },
  { key: 'tahap', label: 'Tahap Saat Ini', value: (r) => labelTahap(r.current_stage) },
  { key: 'dibuat', label: 'Dibuat', value: (r) => tgl(r.created_at) },
  { key: 'makloon_nama', label: 'Makloon', value: (r) => r.nama_maklon, filterable: true },
]

const COLS_JP: SheetColumn<RekapTransaksi>[] = [
  { key: 'jp_pemasok', label: 'JP · ID Pemasok', value: (r) => r.data_jemput_pangan?.id_pemasok ?? null },
  { key: 'jp_poktan', label: 'JP · Poktan/Gapoktan', value: (r) => r.data_jemput_pangan?.nama_poktan_gapoktan ?? null },
  { key: 'jp_supir', label: 'JP · Supir', value: (r) => r.data_jemput_pangan?.supir ?? null },
  { key: 'jp_plat', label: 'JP · Plat Mobil', value: (r) => r.data_jemput_pangan?.plat_mobil ?? null },
  { key: 'jp_desa', label: 'JP · Desa', value: (r) => r.data_jemput_pangan?.desa ?? null },
  { key: 'jp_kec', label: 'JP · Kecamatan', value: (r) => r.data_jemput_pangan?.kecamatan ?? null, filterable: true },
  { key: 'jp_kab', label: 'JP · Kabupaten', value: (r) => r.data_jemput_pangan?.kabupaten ?? null, filterable: true },
  { key: 'jp_tgl', label: 'JP · Tanggal Kirim', value: (r) => tgl(r.data_jemput_pangan?.tanggal_kirim) },
  { key: 'jp_kuantum', label: 'JP · Kuantum (kg)', value: (r) => num(r.data_jemput_pangan?.kuantum), align: 'right' },
  { key: 'jp_jarak', label: 'JP · Jarak (km)', value: (r) => num(r.data_jemput_pangan?.jarak_ke_makloon_km), align: 'right' },
]

const COLS_MAKLOON: SheetColumn<RekapTransaksi>[] = [
  { key: 'mk_pemasok', label: 'Makloon · ID Pemasok', value: (r) => r.data_makloon_mpp?.id_pemasok ?? null },
  { key: 'mk_supir', label: 'Makloon · Supir', value: (r) => r.data_makloon_mpp?.supir ?? null },
  { key: 'mk_plat', label: 'Makloon · Plat Mobil', value: (r) => r.data_makloon_mpp?.plat_mobil ?? null },
  { key: 'mk_desa', label: 'Makloon · Desa', value: (r) => r.data_makloon_mpp?.desa ?? null },
  { key: 'mk_kec', label: 'Makloon · Kecamatan', value: (r) => r.data_makloon_mpp?.kecamatan ?? null },
  { key: 'mk_kab', label: 'Makloon · Kabupaten', value: (r) => r.data_makloon_mpp?.kabupaten ?? null },
  { key: 'mk_tgl', label: 'Makloon · Tanggal Bongkar', value: (r) => tgl(r.data_makloon_tjp?.tanggal_bongkar ?? r.data_makloon_mpp?.tanggal_bongkar) },
  { key: 'mk_kuantum', label: 'Makloon · Kuantum Bongkar (kg)', value: (r) => num(r.data_makloon_tjp?.kuantum_bongkar ?? r.data_makloon_mpp?.kuantum), align: 'right' },
]

const COLS_UB: SheetColumn<RekapTransaksi>[] = [
  { key: 'ub_ka1', label: 'UB · KA1', value: (r) => num(r.data_ub_jastasma?.ka1), align: 'right' },
  { key: 'ub_ka2', label: 'UB · KA2', value: (r) => num(r.data_ub_jastasma?.ka2), align: 'right' },
  { key: 'ub_ka3', label: 'UB · KA3', value: (r) => num(r.data_ub_jastasma?.ka3), align: 'right' },
  { key: 'ub_hampa', label: 'UB · Hampa', value: (r) => num(r.data_ub_jastasma?.hampa), align: 'right' },
  { key: 'ub_hijau', label: 'UB · Butir Hijau', value: (r) => num(r.data_ub_jastasma?.butir_hijau), align: 'right' },
]

/** No. IN spesifik transaksi ini di dalam PO gabungan. */
function noIn(r: RekapTransaksi) {
  return r.data_pengadaan?.po_detail?.find((d) => d.transaksi_id === r.id_transaksi)?.no_in ?? null
}

const COLS_PENGADAAN: SheetColumn<RekapTransaksi>[] = [
  {
    key: 'po_no',
    label: 'Pengadaan · No. PO',
    value: (r) => r.data_pengadaan?.no_po ?? null,
    // Satu PO menaungi beberapa transaksi; sel digabung agar hubungan itu terlihat.
    // Penggabungan hanya benar kalau baris satu PO berdampingan. Itu dijamin backend:
    // rekap() mengurutkan skema -> kunci grup PO -> id_transaksi, dengan kunci grup =
    // id_transaksi TERKECIL di antara anggota PO (bukan no_po, yang teks bebas).
    // Kalau urutan backend diubah, penggabungan di sini ikut rusak.
    mergeKey: (r) => r.data_pengadaan?.no_po ?? null,
    filterable: true,
  },
  { key: 'po_in', label: 'Pengadaan · No. IN', value: (r) => noIn(r) },
  { key: 'po_harga', label: 'Pengadaan · Harga/kg', value: (r) => num(r.data_pengadaan?.harga), align: 'right' },
  { key: 'po_kuantum', label: 'Pengadaan · Total Kuantum (kg)', value: (r) => num(r.data_pengadaan?.total_kuantum), align: 'right' },
  { key: 'po_total', label: 'Pengadaan · Total Harga', value: (r) => num(r.data_pengadaan?.total_harga), align: 'right' },
]

const COLS_KEUANGAN: SheetColumn<RekapTransaksi>[] = [
  { key: 'ku_spp', label: 'Keuangan · No. SPP', value: (r) => r.data_pengadaan?.no_spp ?? null },
  { key: 'ku_tgl', label: 'Keuangan · Tanggal Bayar', value: (r) => tgl(r.data_pengadaan?.data_keuangan?.tanggal_bayar) },
]

const GROUPS: Record<StageKey, SheetColumn<RekapTransaksi>[]> = {
  jemput_pangan: COLS_JP,
  makloon: COLS_MAKLOON,
  ub_jastasma: COLS_UB,
  pengadaan: COLS_PENGADAAN,
  keuangan: COLS_KEUANGAN,
}

const JUDUL: Record<string, { title: string; badge: string; sub: string }> = {
  jemput_pangan: { title: 'Rekap Jemput Pangan', badge: 'Rekap Jemput Pangan', sub: 'Seluruh transaksi TJP beserta data Jemput Pangan.' },
  makloon: { title: 'Rekap Makloon', badge: 'Rekap Makloon', sub: 'Data Jemput Pangan sampai Makloon dalam satu tabel.' },
  ub_jastasma: { title: 'Rekap UB Jastasma', badge: 'Rekap UB Jastasma', sub: 'Data Jemput Pangan, Makloon, dan hasil uji mutu UB Jastasma.' },
  pengadaan: { title: 'Rekap Pengadaan', badge: 'Rekap Pengadaan', sub: 'Data lapangan sampai penggabungan PO dan nomor IN.' },
  keuangan: { title: 'Rekap Keuangan', badge: 'Rekap Keuangan', sub: 'Data lengkap lintas tahap sampai pembayaran PO.' },
  admin: { title: 'Rekap Seluruh Tahap', badge: 'Rekap Admin', sub: 'Seluruh kolom dari Jemput Pangan sampai Keuangan.' },
}

/** Kolom kumulatif: semua tahap sampai (dan termasuk) tahap milik role. */
function kolomUntukRole(role: string): SheetColumn<RekapTransaksi>[] {
  const batas = role === 'admin' ? STAGE_ORDER.length - 1 : STAGE_ORDER.indexOf(role as StageKey)
  const colsUmum = ['makloon', 'ub_jastasma'].includes(role)
    ? COLS_UMUM.filter((col) => col.key !== 'tahap')
    : COLS_UMUM
  if (batas < 0) return colsUmum
  const stageCols = STAGE_ORDER.slice(0, batas + 1).flatMap((s) => GROUPS[s])
  return [...colsUmum, ...stageCols]
}

type KuantumSummaryItem = { key: string; label: string; value: number }

function totalJemputPangan(rows: RekapTransaksi[]) {
  return rows.reduce((total, row) => total + numberValue(row.data_jemput_pangan?.kuantum), 0)
}

function totalMakloon(rows: RekapTransaksi[]) {
  return rows.reduce((total, row) => total + numberValue(row.data_makloon_tjp?.kuantum_bongkar ?? row.data_makloon_mpp?.kuantum), 0)
}

function totalPengadaan(rows: RekapTransaksi[]) {
  const byPo = new Map<string, number>()
  rows.forEach((row) => {
    const po = row.data_pengadaan
    if (!po) return
    const key = String(po.id ?? po.no_po ?? row.id_transaksi)
    if (!byPo.has(key)) byPo.set(key, numberValue(po.total_kuantum))
  })
  return [...byPo.values()].reduce((total, value) => total + value, 0)
}

function kuantumSummaryUntukRole(role: string, rows: RekapTransaksi[]): KuantumSummaryItem[] {
  const batas = role === 'admin' ? STAGE_ORDER.length - 1 : STAGE_ORDER.indexOf(role as StageKey)
  const canSee = (stage: StageKey) => batas >= STAGE_ORDER.indexOf(stage)
  const items: KuantumSummaryItem[] = []

  if (canSee('jemput_pangan')) items.push({ key: 'jp', label: 'Total Kuantum JP', value: totalJemputPangan(rows) })
  if (canSee('makloon')) items.push({ key: 'makloon', label: 'Total Kuantum Makloon', value: totalMakloon(rows) })
  if (canSee('pengadaan')) items.push({ key: 'po', label: 'Total Kuantum PO', value: totalPengadaan(rows) })

  return items
}

type RekapEditForm = {
  jp_id_pemasok: string
  jp_poktan: string
  jp_supir: string
  jp_plat: string
  jp_desa: string
  jp_kecamatan: string
  jp_kabupaten: string
  jp_makloon_user_id: string
  jp_tanggal_kirim: string
  jp_kuantum: string
  jp_jarak: string
  mtjp_tanggal_bongkar: string
  mtjp_kuantum_bongkar: string
  mmpp_id_pemasok: string
  mmpp_supir: string
  mmpp_plat: string
  mmpp_desa: string
  mmpp_kecamatan: string
  mmpp_kabupaten: string
  mmpp_tanggal_bongkar: string
  mmpp_kuantum: string
  mmpp_jarak: string
  ub_ka1: string
  ub_ka2: string
  ub_ka3: string
  ub_hampa: string
  ub_hijau: string
  po_no: string
  po_in: string
  po_harga: string
  po_spp: string
  po_tanggal_bayar: string
}

function formDariRekap(row: RekapTransaksi): RekapEditForm {
  return {
    jp_id_pemasok: field(row.data_jemput_pangan?.id_pemasok),
    jp_poktan: field(row.data_jemput_pangan?.nama_poktan_gapoktan),
    jp_supir: field(row.data_jemput_pangan?.supir),
    jp_plat: field(row.data_jemput_pangan?.plat_mobil),
    jp_desa: field(row.data_jemput_pangan?.desa),
    jp_kecamatan: field(row.data_jemput_pangan?.kecamatan),
    jp_kabupaten: field(row.data_jemput_pangan?.kabupaten),
    jp_makloon_user_id: field(row.data_jemput_pangan?.makloon_user_id),
    jp_tanggal_kirim: inputDate(row.data_jemput_pangan?.tanggal_kirim),
    jp_kuantum: field(row.data_jemput_pangan?.kuantum),
    jp_jarak: field(row.data_jemput_pangan?.jarak_ke_makloon_km),
    mtjp_tanggal_bongkar: inputDate(row.data_makloon_tjp?.tanggal_bongkar),
    mtjp_kuantum_bongkar: field(row.data_makloon_tjp?.kuantum_bongkar),
    mmpp_id_pemasok: field(row.data_makloon_mpp?.id_pemasok),
    mmpp_supir: field(row.data_makloon_mpp?.supir),
    mmpp_plat: field(row.data_makloon_mpp?.plat_mobil),
    mmpp_desa: field(row.data_makloon_mpp?.desa),
    mmpp_kecamatan: field(row.data_makloon_mpp?.kecamatan),
    mmpp_kabupaten: field(row.data_makloon_mpp?.kabupaten),
    mmpp_tanggal_bongkar: inputDate(row.data_makloon_mpp?.tanggal_bongkar),
    mmpp_kuantum: field(row.data_makloon_mpp?.kuantum),
    mmpp_jarak: field(row.data_makloon_mpp?.jarak_ke_makloon_km),
    ub_ka1: field(row.data_ub_jastasma?.ka1),
    ub_ka2: field(row.data_ub_jastasma?.ka2),
    ub_ka3: field(row.data_ub_jastasma?.ka3),
    ub_hampa: field(row.data_ub_jastasma?.hampa),
    ub_hijau: field(row.data_ub_jastasma?.butir_hijau),
    po_no: field(row.data_pengadaan?.no_po),
    po_in: field(noIn(row)),
    po_harga: field(row.data_pengadaan?.harga),
    po_spp: field(row.data_pengadaan?.no_spp),
    po_tanggal_bayar: inputDate(row.data_pengadaan?.data_keuangan?.tanggal_bayar),
  }
}

function payloadDariForm(row: RekapTransaksi, form: RekapEditForm) {
  return {
    ...(row.data_jemput_pangan ? { data_jemput_pangan: {
      id_pemasok: nullable(form.jp_id_pemasok),
      nama_poktan_gapoktan: nullable(form.jp_poktan),
      supir: nullable(form.jp_supir),
      plat_mobil: nullable(form.jp_plat),
      desa: nullable(form.jp_desa),
      kecamatan: nullable(form.jp_kecamatan),
      kabupaten: nullable(form.jp_kabupaten),
      makloon_user_id: form.jp_makloon_user_id ? Number(form.jp_makloon_user_id) : null,
      tanggal_kirim: nullable(form.jp_tanggal_kirim),
      kuantum: numeric(form.jp_kuantum),
      jarak_ke_makloon_km: numeric(form.jp_jarak),
    } } : {}),
    ...(row.data_makloon_tjp ? { data_makloon_tjp: {
      tanggal_bongkar: nullable(form.mtjp_tanggal_bongkar),
      kuantum_bongkar: numeric(form.mtjp_kuantum_bongkar),
    } } : {}),
    ...(row.data_makloon_mpp ? { data_makloon_mpp: {
      id_pemasok: nullable(form.mmpp_id_pemasok),
      supir: nullable(form.mmpp_supir),
      plat_mobil: nullable(form.mmpp_plat),
      desa: nullable(form.mmpp_desa),
      kecamatan: nullable(form.mmpp_kecamatan),
      kabupaten: nullable(form.mmpp_kabupaten),
      tanggal_bongkar: nullable(form.mmpp_tanggal_bongkar),
      kuantum: numeric(form.mmpp_kuantum),
      jarak_ke_makloon_km: numeric(form.mmpp_jarak),
    } } : {}),
    ...(row.data_ub_jastasma ? { data_ub_jastasma: {
      ka1: numeric(form.ub_ka1),
      ka2: numeric(form.ub_ka2),
      ka3: numeric(form.ub_ka3),
      hampa: numeric(form.ub_hampa),
      butir_hijau: numeric(form.ub_hijau),
    } } : {}),
    ...(row.data_pengadaan ? { data_pengadaan: {
      no_po: nullable(form.po_no),
      no_in: nullable(form.po_in),
      harga: numeric(form.po_harga),
      no_spp: nullable(form.po_spp),
      tanggal_bayar: nullable(form.po_tanggal_bayar),
    } } : {}),
  }
}

export default function RekapTransaksiPage() {
  const { user } = useAuth()
  const role = user?.role.nama_role ?? ''
  const queryClient = useQueryClient()
  const { data, isLoading, isError, error } = useRekapTransaksi()
  const { data: makloonOptions = [] } = useMakloonOptions()
  const rows = data?.items ?? []
  const [editing, setEditing] = useState<RekapTransaksi | null>(null)
  const [editForm, setEditForm] = useState<RekapEditForm | null>(null)

  const columns = kolomUntukRole(role)
  const judul = JUDUL[role] ?? { title: 'Rekap Transaksi', badge: 'Rekap', sub: 'Rekap data transaksi lintas tahap.' }
  const kuantumSummaries = kuantumSummaryUntukRole(role, rows)

  // Semua baris kini pasti terkunci (disaring backend), jadi kartu "terkunci" tak lagi
  // bermakna. Jumlah PO unik lebih informatif sekarang setelah kolom No. PO digabung.
  const totalPo = new Set(rows.map((r) => r.data_pengadaan?.no_po).filter(Boolean)).size

  const updateMutation = useMutation({
    mutationFn: ({ row, form }: { row: RekapTransaksi; form: RekapEditForm }) =>
      api.patch(`/api/transaksi/${encodeURIComponent(row.id_transaksi)}/admin-rekap`, payloadDariForm(row, form)),
    onSuccess: (_res, vars) => {
      toast.success(`Transaksi ${vars.row.id_transaksi} diperbarui.`)
      setEditing(null)
      setEditForm(null)
      queryClient.invalidateQueries({ queryKey: ['rekap-transaksi'] })
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
    },
    onError: (err) => toast.error(pesanKegagalan(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (row: RekapTransaksi) => api.delete(`/api/transaksi/${encodeURIComponent(row.id_transaksi)}`),
    onSuccess: (_res, row) => {
      toast.success(`Transaksi ${row.id_transaksi} dihapus.`)
      queryClient.invalidateQueries({ queryKey: ['rekap-transaksi'] })
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
    },
    onError: (err) => toast.error(pesanKegagalan(err)),
  })

  const mulaiEdit = (row: RekapTransaksi) => {
    setEditing(row)
    setEditForm(formDariRekap(row))
  }

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge={judul.badge}
        title={judul.title}
        subtitle={`${judul.sub} Tabel hanya memuat data yang sudah terkunci — sudah diterima tahap berikutnya dan tidak dapat diubah lagi. Dapat dicari, disaring per kolom, dan diekspor ke CSV.`}
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Total transaksi</div><div className="stat-value">{rows.length}</div></div>
          <div className="stat-card"><div className="stat-label">TJP</div><div className="stat-value">{rows.filter((r) => r.skema === 'TJP').length}</div></div>
          <div className="stat-card"><div className="stat-label">MPP</div><div className="stat-value">{rows.filter((r) => r.skema === 'MPP').length}</div></div>
          <div className="stat-card"><div className="stat-label">Total PO</div><div className="stat-value">{totalPo}</div></div>
        </div>

        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">Tabel {judul.title}</h2>
              <p className="page-subtitle">Satu baris = satu transaksi · {columns.length} kolom</p>
            </div>
            <span className="badge badge-success">Hanya menampilkan data yang sudah terkunci</span>
          </div>

          <DataSpreadsheet
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id_transaksi}
            namaFile={`rekap-${role || 'transaksi'}`}
            isLoading={isLoading}
            isError={isError}
            errorMessage={pesanKegagalan(error)}
            emptyTitle="Belum ada transaksi"
            emptyCopy="Data muncul setelah transaksi dibuat pada alur TJP atau MPP."
            renderRowActions={role === 'admin' ? (row) => (
              <div className="flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => mulaiEdit(row)}
                  className="rounded-lg border border-primary/20 bg-primary-tint px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white"
                >
                  Edit
                </button>
                <button
                  type="button"
                  disabled={deleteMutation.isPending}
                  onClick={() => {
                    if (window.confirm(`Hapus transaksi ${row.id_transaksi}? Data tahap terkait ikut terhapus dari rekap.`)) {
                      deleteMutation.mutate(row)
                    }
                  }}
                  className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hapus
                </button>
              </div>
            ) : undefined}
          />

          <KuantumSummary items={kuantumSummaries} />
        </section>
      </div>

      {editing && editForm && (
        <RekapEditModal
          row={editing}
          form={editForm}
          makloonOptions={makloonOptions}
          isSaving={updateMutation.isPending}
          onChange={(key, value) => setEditForm((prev) => prev ? { ...prev, [key]: value } : prev)}
          onClose={() => {
            setEditing(null)
            setEditForm(null)
          }}
          onSubmit={() => updateMutation.mutate({ row: editing, form: editForm })}
        />
      )}
    </div>
  )
}

function KuantumSummary({ items }: { items: KuantumSummaryItem[] }) {
  if (items.length === 0) return null

  return (
    <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <span className="section-title">Total keseluruhan kuantum</span>
        <span className="text-xs font-semibold text-slate-500">Dihitung dari seluruh baris rekap yang tampil</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <div key={item.key} className="rounded-lg border border-border bg-white px-4 py-3">
            <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
            <div className="mt-1 text-2xl font-extrabold text-primary-dark">{formatKg(item.value)} kg</div>
          </div>
        ))}
      </div>
    </div>
  )
}

type RekapEditModalProps = {
  row: RekapTransaksi
  form: RekapEditForm
  makloonOptions: { id: number; nama_maklon: string; kecamatan: string | null; kabupaten: string | null }[]
  isSaving: boolean
  onChange: (key: keyof RekapEditForm, value: string) => void
  onClose: () => void
  onSubmit: () => void
}

function RekapEditModal({ row, form, makloonOptions, isSaving, onChange, onClose, onSubmit }: RekapEditModalProps) {
  return (
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
              <p className="text-[0.68rem] font-bold uppercase tracking-[0.2em] text-accent">Edit Rekap Admin</p>
              <h2 className="mt-1 text-2xl font-extrabold">{row.id_transaksi}</h2>
              <p className="mt-1 text-sm text-white/70">Koreksi data terkunci tanpa mengulang alur transaksi.</p>
            </div>
            <div className="flex gap-2">
              <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold">{row.skema}</span>
              <span className="rounded-lg border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-bold capitalize">{row.current_stage.replaceAll('_', ' ')}</span>
            </div>
          </div>
        </div>

        <div className="space-y-5 overflow-y-auto bg-surface px-6 py-5">
          {row.data_jemput_pangan && (
            <EditSection title="Jemput Pangan" badge="Data awal TJP">
              <TextField label="ID Pemasok" value={form.jp_id_pemasok} onChange={(v) => onChange('jp_id_pemasok', v)} />
              <TextField label="Poktan/Gapoktan" value={form.jp_poktan} onChange={(v) => onChange('jp_poktan', v)} />
              <TextField label="Supir" value={form.jp_supir} onChange={(v) => onChange('jp_supir', v)} />
              <TextField label="Plat Mobil" value={form.jp_plat} onChange={(v) => onChange('jp_plat', v)} />
              <TextField label="Desa" value={form.jp_desa} onChange={(v) => onChange('jp_desa', v)} />
              <TextField label="Kecamatan" value={form.jp_kecamatan} onChange={(v) => onChange('jp_kecamatan', v)} />
              <SelectField label="Kabupaten"><KabupatenSelect required={false} value={form.jp_kabupaten} onChange={(v) => onChange('jp_kabupaten', v)} /></SelectField>
              <label className="block">
                <span className="label">Makloon</span>
                <select className="input" value={form.jp_makloon_user_id} onChange={(e) => onChange('jp_makloon_user_id', e.target.value)}>
                  <option value="">Pilih makloon</option>
                  {makloonOptions.map((m) => (
                    <option key={m.id} value={m.id}>{m.nama_maklon}{m.kabupaten ? ` - ${m.kabupaten}` : ''}</option>
                  ))}
                </select>
              </label>
              <TextField type="date" label="Tanggal Kirim" value={form.jp_tanggal_kirim} onChange={(v) => onChange('jp_tanggal_kirim', v)} />
              <TextField type="number" label="Kuantum (kg)" value={form.jp_kuantum} onChange={(v) => onChange('jp_kuantum', v)} />
              <TextField type="number" label="Jarak ke Makloon (km)" value={form.jp_jarak} onChange={(v) => onChange('jp_jarak', v)} />
            </EditSection>
          )}

          {row.data_makloon_tjp && (
            <EditSection title="Makloon TJP" badge="Bongkar makloon">
              <TextField type="date" label="Tanggal Bongkar" value={form.mtjp_tanggal_bongkar} onChange={(v) => onChange('mtjp_tanggal_bongkar', v)} />
              <TextField type="number" label="Kuantum Bongkar (kg)" value={form.mtjp_kuantum_bongkar} onChange={(v) => onChange('mtjp_kuantum_bongkar', v)} />
            </EditSection>
          )}

          {row.data_makloon_mpp && (
            <EditSection title="Makloon MPP" badge="Input makloon">
              <TextField label="ID Pemasok" value={form.mmpp_id_pemasok} onChange={(v) => onChange('mmpp_id_pemasok', v)} />
              <TextField label="Supir" value={form.mmpp_supir} onChange={(v) => onChange('mmpp_supir', v)} />
              <TextField label="Plat Mobil" value={form.mmpp_plat} onChange={(v) => onChange('mmpp_plat', v)} />
              <TextField label="Desa" value={form.mmpp_desa} onChange={(v) => onChange('mmpp_desa', v)} />
              <TextField label="Kecamatan" value={form.mmpp_kecamatan} onChange={(v) => onChange('mmpp_kecamatan', v)} />
              <SelectField label="Kabupaten"><KabupatenSelect required={false} value={form.mmpp_kabupaten} onChange={(v) => onChange('mmpp_kabupaten', v)} /></SelectField>
              <TextField type="date" label="Tanggal Bongkar" value={form.mmpp_tanggal_bongkar} onChange={(v) => onChange('mmpp_tanggal_bongkar', v)} />
              <TextField type="number" label="Kuantum (kg)" value={form.mmpp_kuantum} onChange={(v) => onChange('mmpp_kuantum', v)} />
              <TextField type="number" label="Jarak ke Makloon (km)" value={form.mmpp_jarak} onChange={(v) => onChange('mmpp_jarak', v)} />
            </EditSection>
          )}

          {row.data_ub_jastasma && (
            <EditSection title="UB Jastasma" badge="Mutu gabah">
              <TextField type="number" label="KA1" value={form.ub_ka1} onChange={(v) => onChange('ub_ka1', v)} />
              <TextField type="number" label="KA2" value={form.ub_ka2} onChange={(v) => onChange('ub_ka2', v)} />
              <TextField type="number" label="KA3" value={form.ub_ka3} onChange={(v) => onChange('ub_ka3', v)} />
              <TextField type="number" label="Hampa" value={form.ub_hampa} onChange={(v) => onChange('ub_hampa', v)} />
              <TextField type="number" label="Butir Hijau" value={form.ub_hijau} onChange={(v) => onChange('ub_hijau', v)} />
            </EditSection>
          )}

          {row.data_pengadaan && (
            <EditSection title="Pengadaan & Keuangan" badge="PO, IN, dan pembayaran">
              <TextField label="No. PO" value={form.po_no} onChange={(v) => onChange('po_no', v)} />
              <TextField label="No. IN" value={form.po_in} onChange={(v) => onChange('po_in', v)} />
              <TextField type="number" label="Harga/kg" value={form.po_harga} onChange={(v) => onChange('po_harga', v)} />
              <TextField label="No. SPP" value={form.po_spp} onChange={(v) => onChange('po_spp', v)} />
              <TextField type="date" label="Tanggal Bayar" value={form.po_tanggal_bayar} onChange={(v) => onChange('po_tanggal_bayar', v)} />
            </EditSection>
          )}
        </div>

        <div className="flex flex-col-reverse gap-3 border-t border-border bg-white px-6 py-4 sm:flex-row sm:justify-end">
          <button type="button" onClick={onClose} className="btn btn-ghost">Batal</button>
          <button type="submit" disabled={isSaving} className="btn btn-primary">
            {isSaving ? 'Menyimpan...' : 'Simpan Perubahan'}
          </button>
        </div>
      </form>
    </div>
  )
}

function EditSection({ title, badge, children }: { title: string; badge: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-primary-dark">{title}</h3>
        <span className="rounded-full bg-primary-tint px-3 py-1 text-[0.68rem] font-bold text-primary">{badge}</span>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
    </section>
  )
}

function SelectField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}

function TextField({ label, value, onChange, type = 'text' }: { label: string; value: string; onChange: (value: string) => void; type?: 'text' | 'number' | 'date' }) {
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
