import FormHero from '../components/FormHero'
import DataSpreadsheet, { type SheetColumn } from '../components/DataSpreadsheet'
import { useAuth } from '../hooks/useAuth'
import { useRekapTransaksi, type RekapTransaksi, type StageStatus } from '../hooks/useRekapTransaksi'

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

const STATUS_LABEL: Record<string, string> = {
  menunggu_review: 'Menunggu review',
  diterima: 'Terkunci',
  ditolak: 'Ditolak',
}

function num(v: string | null | undefined) {
  if (v === null || v === undefined || v === '') return null
  return Number(v)
}

function tgl(v: string | null | undefined) {
  return v ? new Date(v).toLocaleDateString('id-ID') : null
}

/** Badge status kunci tiap tahap. `diterima` = data sudah dikunci dan tidak bisa diubah lagi. */
function StatusBadge({ status }: { status: StageStatus | null | undefined }) {
  if (!status) return <span className="text-muted">-</span>
  const cls =
    status === 'diterima' ? 'badge badge-success' : status === 'ditolak' ? 'badge badge-danger' : 'badge badge-warning'
  return (
    <span className={cls}>
      {status === 'diterima' && (
        <svg viewBox="0 0 20 20" className="mr-1 h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 9V6.5a4 4 0 0 1 8 0V9M5 9h10v7H5z" />
        </svg>
      )}
      {STATUS_LABEL[status] ?? status}
    </span>
  )
}

const COLS_UMUM: SheetColumn<RekapTransaksi>[] = [
  { key: 'id', label: 'ID Transaksi', value: (r) => r.id_transaksi },
  { key: 'skema', label: 'Skema', value: (r) => r.skema },
  { key: 'tahap', label: 'Tahap Saat Ini', value: (r) => r.current_stage.replaceAll('_', ' ') },
  { key: 'status', label: 'Status', value: (r) => r.status_keseluruhan.replaceAll('_', ' ') },
  { key: 'dibuat', label: 'Dibuat', value: (r) => tgl(r.created_at) },
  { key: 'makloon_nama', label: 'Makloon', value: (r) => r.nama_maklon },
]

const COLS_JP: SheetColumn<RekapTransaksi>[] = [
  { key: 'jp_status', label: 'Status JP', value: (r) => (r.data_jemput_pangan ? STATUS_LABEL[r.data_jemput_pangan.status] : null), render: (r) => <StatusBadge status={r.data_jemput_pangan?.status} /> },
  { key: 'jp_pemasok', label: 'JP · ID Pemasok', value: (r) => r.data_jemput_pangan?.id_pemasok ?? null },
  { key: 'jp_poktan', label: 'JP · Poktan/Gapoktan', value: (r) => r.data_jemput_pangan?.nama_poktan_gapoktan ?? null },
  { key: 'jp_supir', label: 'JP · Supir', value: (r) => r.data_jemput_pangan?.supir ?? null },
  { key: 'jp_plat', label: 'JP · Plat Mobil', value: (r) => r.data_jemput_pangan?.plat_mobil ?? null },
  { key: 'jp_desa', label: 'JP · Desa', value: (r) => r.data_jemput_pangan?.desa ?? null },
  { key: 'jp_kec', label: 'JP · Kecamatan', value: (r) => r.data_jemput_pangan?.kecamatan ?? null },
  { key: 'jp_kab', label: 'JP · Kabupaten', value: (r) => r.data_jemput_pangan?.kabupaten ?? null },
  { key: 'jp_tgl', label: 'JP · Tanggal Kirim', value: (r) => tgl(r.data_jemput_pangan?.tanggal_kirim) },
  { key: 'jp_kuantum', label: 'JP · Kuantum (kg)', value: (r) => num(r.data_jemput_pangan?.kuantum), align: 'right' },
  { key: 'jp_jarak', label: 'JP · Jarak (km)', value: (r) => num(r.data_jemput_pangan?.jarak_ke_makloon_km), align: 'right' },
]

const COLS_MAKLOON: SheetColumn<RekapTransaksi>[] = [
  {
    key: 'mk_status',
    label: 'Status Makloon',
    value: (r) => { const s = r.data_makloon_tjp?.status ?? r.data_makloon_mpp?.status; return s ? STATUS_LABEL[s] : null },
    render: (r) => <StatusBadge status={r.data_makloon_tjp?.status ?? r.data_makloon_mpp?.status} />,
  },
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
  { key: 'ub_status', label: 'Status UB', value: (r) => (r.data_ub_jastasma ? STATUS_LABEL[r.data_ub_jastasma.status] : null), render: (r) => <StatusBadge status={r.data_ub_jastasma?.status} /> },
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
  { key: 'po_no', label: 'Pengadaan · No. PO', value: (r) => r.data_pengadaan?.no_po ?? null },
  { key: 'po_in', label: 'Pengadaan · No. IN', value: (r) => noIn(r) },
  { key: 'po_status', label: 'Pengadaan · Status PO', value: (r) => r.data_pengadaan?.status ?? null },
  { key: 'po_harga', label: 'Pengadaan · Harga/kg', value: (r) => num(r.data_pengadaan?.harga), align: 'right' },
  { key: 'po_kuantum', label: 'Pengadaan · Total Kuantum (kg)', value: (r) => num(r.data_pengadaan?.total_kuantum), align: 'right' },
  { key: 'po_total', label: 'Pengadaan · Total Harga', value: (r) => num(r.data_pengadaan?.total_harga), align: 'right' },
]

const COLS_KEUANGAN: SheetColumn<RekapTransaksi>[] = [
  { key: 'ku_spp', label: 'Keuangan · No. SPP', value: (r) => r.data_pengadaan?.no_spp ?? null },
  { key: 'ku_bayar', label: 'Keuangan · Status Bayar', value: (r) => r.data_pengadaan?.data_keuangan?.status_bayar ?? null },
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
  if (batas < 0) return COLS_UMUM
  const stageCols = STAGE_ORDER.slice(0, batas + 1).flatMap((s) => GROUPS[s])
  return [...COLS_UMUM, ...stageCols]
}

export default function RekapTransaksiPage() {
  const { user } = useAuth()
  const role = user?.role.nama_role ?? ''
  const { data, isLoading } = useRekapTransaksi()
  const rows = data?.items ?? []

  const columns = kolomUntukRole(role)
  const judul = JUDUL[role] ?? { title: 'Rekap Transaksi', badge: 'Rekap', sub: 'Rekap data transaksi lintas tahap.' }

  const terkunci = rows.filter((r) => {
    const s = role === 'makloon' ? (r.data_makloon_tjp?.status ?? r.data_makloon_mpp?.status)
      : role === 'ub_jastasma' ? r.data_ub_jastasma?.status
      : r.data_jemput_pangan?.status
    return s === 'diterima'
  }).length

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge={judul.badge}
        title={judul.title}
        subtitle={`${judul.sub} Tabel mengikuti data timeline secara langsung — begitu tahap diubah atau dikunci, isinya ikut menyesuaikan. Dapat dicari dan diekspor ke CSV.`}
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Total transaksi</div><div className="stat-value">{rows.length}</div></div>
          <div className="stat-card"><div className="stat-label">TJP</div><div className="stat-value">{rows.filter((r) => r.skema === 'TJP').length}</div></div>
          <div className="stat-card"><div className="stat-label">MPP</div><div className="stat-value">{rows.filter((r) => r.skema === 'MPP').length}</div></div>
          <div className="stat-card"><div className="stat-label">Tahap Anda terkunci</div><div className="stat-value">{terkunci}</div></div>
        </div>

        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">Tabel {judul.title}</h2>
              <p className="page-subtitle">Satu baris = satu transaksi · {columns.length} kolom</p>
            </div>
            <span className="badge badge-success">Terkunci = data sudah diterima tahap berikutnya</span>
          </div>

          <DataSpreadsheet
            rows={rows}
            columns={columns}
            rowKey={(r) => r.id_transaksi}
            namaFile={`rekap-${role || 'transaksi'}`}
            isLoading={isLoading}
            emptyTitle="Belum ada transaksi"
            emptyCopy="Data muncul setelah transaksi dibuat pada alur TJP atau MPP."
          />
        </section>
      </div>
    </div>
  )
}
