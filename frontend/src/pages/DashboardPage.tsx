import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useAntreanTransaksi, type TransaksiListItem } from '../hooks/useTransaksiList'
import { useRingkasanDashboard, usePantauan, type PantauanBaris } from '../hooks/useDashboard'
import { kunciTransaksi, tanggalTransaksi } from '../lib/transaksiKunci'
import {
  KERJAAN_KETERANGAN,
  KERJAAN_LABEL,
  KERJAAN_URUT,
  kerjaan,
  labelTahap,
  rejectedStages,
  type KerjaanId,
  type RejectInfo,
} from '../lib/kerjaanTransaksi'
import { namaTampilan } from '../lib/namaUser'
import { SkeletonMakloonGroups, SkeletonTable } from '../components/Skeleton'
import DataSpreadsheet, { type SheetColumn } from '../components/DataSpreadsheet'

type SkemaFilter = 'semua' | 'TJP' | 'MPP'

// Role yang menampilkan daftar transaksi dikelompokkan per makloon (accordion).
// Semua role operasional + Admin, KECUALI Makloon (dia hanya melihat transaksinya sendiri).
const GROUPED_ROLES = new Set(['jemput_pangan', 'ub_jastasma', 'pengadaan', 'keuangan', 'operasi', 'gudang', 'admin'])

// Label ramah + kalimat pembuka per role untuk hero sambutan dashboard.
const ROLE_LABEL: Record<string, string> = {
  admin: 'Administrator',
  jemput_pangan: 'Jemput Pangan',
  ub_jastasma: 'UB Jastasma',
  pengadaan: 'Pengadaan',
  keuangan: 'Keuangan',
  operasi: 'Operasi',
  gudang: 'Gudang',
  makloon: 'Makloon',
}

const ROLE_SUBTITLE: Record<string, string> = {
  jemput_pangan: 'Jemput gabah dari petani dan kirim ke makloon. Setiap transaksi yang kamu buat menggerakkan rantai serap pangan Lampung.',
  ub_jastasma: 'Tinjau UB & jastasma tiap transaksi sebelum masuk tahap pengadaan.',
  pengadaan: 'Tinjau transaksi masuk dan terbitkan PO untuk melanjutkan proses serap.',
  keuangan: 'Proses pembayaran PO tepat waktu agar rantai serap terus berjalan.',
  operasi: 'Catat data operasi lapangan supaya progres tiap transaksi selalu terpantau.',
  gudang: 'Konfirmasi penerimaan gabah di gudang sebagai penutup alur serap.',
  admin: 'Pantau seluruh alur TJP dan MPP dari input awal sampai penerimaan gudang.',
  makloon: 'Kelola bongkar dan proses gabah dari mitra dengan rapi dan tepat waktu.',
}

// Urutan blok tahap pada tabel datar: TJP dulu baru MPP, sama seperti pengurutan rekap.
const TAHAP_URUT = ['jemput_pangan', 'makloon', 'makloon_kirim', 'makloon_terima', 'ub_jastasma', 'pengadaan', 'keuangan']

// Kalimat pembuka tiap blok tahap -- menjelaskan pekerjaannya sekali di kepala tabel, sehingga
// badge per baris cukup menjawab "sudah sampai mana", bukan menjelaskan ulang tugasnya.
const TAHAP_KETERANGAN: Record<string, string> = {
  makloon: 'Cek data dari Jemput Pangan, lalu isi data bongkar dan kirim ke UB Jastasma.',
  makloon_kirim: 'Isi data pengiriman gabah beserta dokumennya, lalu kirim.',
  makloon_terima: 'Barang sudah sampai. Timbang & bongkar, catat kuantum bongkar, unggah surat jalan + nota timbang, lalu tekan Terima.',
}

type MakloonGroup = {
  nama: string
  lokasi: string
  transaksi: TransaksiListItem[]
  tjp: number
  mpp: number
}

function groupByMakloon(items: TransaksiListItem[]): MakloonGroup[] {
  const map = new Map<string, MakloonGroup>()
  for (const t of items) {
    const key = t.nama_maklon ?? 'Tanpa makloon'
    let g = map.get(key)
    if (!g) {
      g = { nama: key, lokasi: [t.makloon_kecamatan, t.makloon_kabupaten].filter(Boolean).join(', '), transaksi: [], tjp: 0, mpp: 0 }
      map.set(key, g)
    }
    g.transaksi.push(t)
    if (t.skema === 'TJP') g.tjp += 1
    else g.mpp += 1
  }
  return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
}

// Inisial 2 huruf dari nama makloon, mengabaikan prefix "Makloon" (mis. "Makloon Sinar Jaya" -> "SJ").
function inisialMakloon(nama: string) {
  const kata = nama.replace(/^makloon\s+/i, '').trim().split(/\s+/).filter(Boolean)
  const dua = (kata[0]?.[0] ?? '') + (kata[1]?.[0] ?? kata[0]?.[1] ?? '')
  return (dua || nama.slice(0, 2)).toUpperCase()
}

function tanggalSingkat(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short' }).format(new Date(value))
}

function SkemaBadge({ skema }: { skema: 'TJP' | 'MPP'; }) {
  const cls = skema === 'TJP' ? 'bg-primary-tint text-primary' : 'bg-warning-bg text-warning'
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{skema}</span>
}

function SkemaCount({ skema, count }: { skema: 'TJP' | 'MPP'; count: number }) {
  const cls = skema === 'TJP' ? 'bg-primary-tint text-primary' : 'bg-warning-bg text-warning'
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{count} {skema}</span>
}

function KerjaanBadge({ row }: { row: TransaksiListItem }) {
  const item = kerjaan(row)
  return <span className={`badge ${item.cls}`} title={item.judul}>{item.label}</span>
}

/** Chip filter antrean, dengan jumlah supaya terlihat mana yang menumpuk tanpa perlu diklik. */
function KerjaanChip({ label, jumlah, aktif, onClick }: { label: string; jumlah: number; aktif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktif}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${aktif ? 'border-primary bg-primary text-white' : 'border-border bg-white text-slate-600 hover:border-primary/40 hover:text-primary'}`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${aktif ? 'bg-white/20' : 'bg-surface'}`}>{jumlah}</span>
    </button>
  )
}

function RejectedBadge({ items }: { items: RejectInfo[] }) {
  if (items.length === 0) return null
  return <span className="inline-flex items-center gap-1 rounded-md bg-danger-bg px-2 py-1 text-[0.68rem] font-bold text-danger">Ditolak: {items.map((item) => labelTahap(item.stage)).join(', ')}</span>
}

function num(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === '') return 0
  return Number(value) || 0
}

function fmt(value: number) {
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 }).format(value)
}

function pct(value: number) {
  return `${new Intl.NumberFormat('id-ID', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)}%`
}

type PantauanRow = {
  nama: string
  gabahDiterima: number
  gabahAdministrasi: number
  belumDiadministrasi: number
  gabahSudahDiolah: number
  stokGudangAdmAda: number
  hgl: number
  broken: number
  menir: number
  katul: number
  rataRendemen: number
  realisasiPenerimaanHgb: number
  hglBelumAdministrasi: number
  persenDiolah: number
}

type OperasiTotals = {
  gabahDiolah: number
  hgl: number
  broken: number
  menir: number
  katul: number
  rendemenPersen: number
  realisasiPenerimaanHgb: number
}

// Kolom "Hasil Olah" & "Realisasi HGB" pada Pantauan Admin dulunya diisi dari modul
// Operasi/Gudang lama. Modul itu diganti alur Pengolahan (pengolahan/mo); rewiring tabel
// pantauan ke sumber baru belum tercakup rencana ini, jadi sementara diisi nol.
// TODO(pengolahan): hitung hasil olah & realisasi dari data mo/pengolahan.
const HASIL_OLAH_KOSONG: OperasiTotals = {
  gabahDiolah: 0,
  hgl: 0,
  broken: 0,
  menir: 0,
  katul: 0,
  rendemenPersen: 0,
  realisasiPenerimaanHgb: 0,
}

/**
 * Penjumlahan per makloon TIDAK lagi dilakukan di sini -- server yang mengirimkannya sudah
 * teragregasi (GET /api/dashboard/pantauan). Menjumlahkannya di browser berarti hanya baris
 * yang kebetulan ter-fetch yang terhitung, dan di atas satu halaman angkanya salah tanpa
 * tanda apa pun. Fungsi ini kini hanya menurunkan kolom-kolom lanjutan dari dua angka dasar.
 */
function pantauanRows(rows: PantauanBaris[], hasilOperasi: OperasiTotals): PantauanRow[] {
  const items: PantauanRow[] = rows.map((row) => ({
    nama: row.nama,
    gabahDiterima: num(row.gabah_diterima),
    gabahAdministrasi: num(row.gabah_administrasi),
    belumDiadministrasi: 0,
    gabahSudahDiolah: 0,
    stokGudangAdmAda: 0,
    hgl: 0,
    broken: 0,
    menir: 0,
    katul: 0,
    rataRendemen: 0,
    realisasiPenerimaanHgb: 0,
    hglBelumAdministrasi: 0,
    persenDiolah: 0,
  }))

  const totalAdministrasi = items.reduce((sum, row) => sum + row.gabahAdministrasi, 0)
  const fallbackGabahDiolah = items.reduce((sum, row) => sum + row.gabahAdministrasi, 0)
  const totalGabahDiolah = hasilOperasi.gabahDiolah > 0 ? hasilOperasi.gabahDiolah : fallbackGabahDiolah

  return items
    .map((row) => {
      const share = totalAdministrasi > 0 ? row.gabahAdministrasi / totalAdministrasi : (items.length > 0 ? 1 / items.length : 0)
      const gabahSudahDiolah = totalGabahDiolah * share
      const hgl = hasilOperasi.hgl * share
      const broken = hasilOperasi.broken * share
      const menir = hasilOperasi.menir * share
      const katul = hasilOperasi.katul * share
      const realisasiPenerimaanHgb = hasilOperasi.realisasiPenerimaanHgb * share
      const belumDiadministrasi = Math.max(row.gabahDiterima - row.gabahAdministrasi, 0)
      const stokGudangAdmAda = Math.max(row.gabahAdministrasi - gabahSudahDiolah, 0)
      const hglBelumAdministrasi = Math.max(hgl - realisasiPenerimaanHgb, 0)

      return {
        ...row,
        gabahSudahDiolah,
        belumDiadministrasi,
        stokGudangAdmAda,
        hgl,
        broken,
        menir,
        katul,
        realisasiPenerimaanHgb,
        hglBelumAdministrasi,
        rataRendemen: hasilOperasi.rendemenPersen,
        persenDiolah: row.gabahAdministrasi > 0 ? (gabahSudahDiolah / row.gabahAdministrasi) * 100 : 0,
      }
    })
    .sort((a, b) => b.gabahDiterima - a.gabahDiterima || a.nama.localeCompare(b.nama, 'id'))
}

export default function DashboardPage() {
  const { user } = useAuth()
  const role = user?.role.nama_role ?? ''
  const [skemaFilter, setSkemaFilter] = useState<SkemaFilter>('semua')
  const [kerjaanFilter, setKerjaanFilter] = useState<KerjaanId | 'semua'>('semua')
  const [page, setPage] = useState(1)

  // Angka ringkasan & filter dikerjakan di server. Menghitungnya di browser hanya benar selama
  // seluruh antrean muat dalam satu halaman; di atas itu kartu statistik dan chip diam-diam
  // melaporkan sebagian data saja. Daftarnya kembali paginated karena filternya sudah di query.
  const { data: ringkasan } = useRingkasanDashboard(skemaFilter)
  const { data: antreanPage, isLoading } = useAntreanTransaksi(page, skemaFilter, kerjaanFilter)
  const { data: pantauanBaris } = usePantauan(role === 'admin')

  const transaksi = antreanPage?.items ?? []
  const meta = antreanPage?.meta
  const hitungKerjaan: Record<KerjaanId, number> = ringkasan?.antrean ?? { periksa: 0, isi: 0, draft: 0, ditolak: 0, po: 0 }
  const totalAntrean = ringkasan?.antrean.total ?? 0

  const useGrouped = !!user && GROUPED_ROLES.has(role)
  const makloonGroups = useMemo(() => groupByMakloon(transaksi), [transaksi])
  // Tabel datar (role Makloon) dipisah per TAHAP, bukan per status: satu orang Makloon memegang
  // tiga tahap yang pekerjaannya benar-benar berbeda (Makloon TJP, Makloon Kirim & Makloon
  // Terima di MPP). Role lain hanya memegang satu tahap sehingga tetap satu blok.
  const tahapGroups = useMemo(
    () => TAHAP_URUT
      .map((stage) => ({ stage, rows: transaksi.filter((item) => item.current_stage === stage) }))
      .filter((group) => group.rows.length > 0),
    [transaksi],
  )

  // Panel "Transaksi ditolak" hanya memuat contoh 5 teratas, jadi cukup dari halaman yang
  // terbuka; jumlah sebenarnya diambil dari ringkasan server.
  const rejectedTransaksi = useMemo(
    () => transaksi.filter((item) => rejectedStages(item).length > 0),
    [transaksi],
  )

  const kartuKetiga = role === 'pengadaan' || role === 'keuangan'
    ? { label: 'Di halaman PO', value: hitungKerjaan.po, sub: 'lanjut di halaman PO', tone: 'accent' as const, icon: ICONS.total }
    : { label: 'Perlu diisi', value: hitungKerjaan.isi + hitungKerjaan.draft, sub: 'termasuk draft', tone: 'accent' as const, icon: ICONS.total }
  const statCards = role === 'admin' && ringkasan?.rekap
    ? [
        { label: 'Total transaksi', value: ringkasan.rekap.total, sub: 'seluruh transaksi', tone: 'primary' as const, icon: ICONS.total },
        { label: 'Perlu diproses', value: ringkasan.rekap.perlu_diproses, sub: 'tahap aktif', tone: 'warning' as const, icon: ICONS.berjalan },
        { label: 'Ditolak', value: ringkasan.rekap.ditolak, sub: 'perlu revisi', tone: 'danger' as const, icon: ICONS.ditolak },
        { label: 'Selesai', value: ringkasan.rekap.selesai, sub: 'sudah rampung', tone: 'success' as const, icon: ICONS.selesai },
      ]
    : [
        { label: 'Total antrean', value: totalAntrean, sub: 'menunggu tindakan Anda', tone: 'primary' as const, icon: ICONS.total },
        { label: 'Perlu dicek', value: hitungKerjaan.periksa, sub: 'terima atau tolak', tone: 'warning' as const, icon: ICONS.berjalan },
        kartuKetiga,
        { label: 'Ditolak', value: hitungKerjaan.ditolak, sub: 'perlu revisi', tone: 'danger' as const, icon: ICONS.ditolak },
      ]
  const pantauan = useMemo(() => pantauanRows(pantauanBaris ?? [], HASIL_OLAH_KOSONG), [pantauanBaris])

  const now = new Date()
  const jam = now.getHours()
  const sapaan = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam'
  const tanggalPanjang = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)

  const roleLabel = ROLE_LABEL[role] ?? role.replaceAll('_', ' ')
  const roleSubtitle = ROLE_SUBTITLE[role] ?? 'Pantau dan kelola transaksi serap gabah dari satu tempat.'

  return (
    <div className="min-h-screen bg-surface">
      {/* Hero sambutan -- navy dramatis, gaya landing page, dihias cincin + ilustrasi panen. */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#14213f] via-primary-dark to-primary text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-28 bottom-0 h-72 w-72 rounded-full bg-primary/50 blur-3xl" />
        {/* cincin dekoratif samar di kanan */}
        <div aria-hidden className="pointer-events-none absolute -right-6 top-4 hidden h-80 w-80 rounded-full border border-white/5 lg:block" />
        <div aria-hidden className="pointer-events-none absolute right-16 top-20 hidden h-48 w-48 rounded-full border border-white/5 lg:block" />

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-9">
          <div className="grid items-center gap-10 lg:grid-cols-[1fr_340px]">
            <div>
              {/* Eyebrow brand */}
              <p className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.18em] text-accent">
                <span aria-hidden className="h-px w-7 bg-accent" />
                Perum Bulog Kanwil Lampung
              </p>
              <p className="mt-5 text-xs font-medium text-white/50">{sapaan} &middot; {tanggalPanjang}</p>
              <h1 className="mt-2 text-4xl font-bold leading-tight tracking-tight md:text-5xl">
                Halo, {namaTampilan(user)}<span className="text-accent">.</span>
              </h1>
              <div aria-hidden className="mt-5 h-1 w-16 rounded-full bg-accent" />
              <div className="mt-5">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {roleLabel}
                </span>
              </div>
              <p className="mt-5 max-w-xl text-sm leading-6 text-white/70">{roleSubtitle}</p>

            </div>

            {/* Ilustrasi panen gabah -- hanya tampil di layar lebar untuk mengisi ruang. */}
            <div aria-hidden className="relative hidden lg:block">
              <DashboardGrafis />
            </div>
          </div>
        </div>
      </section>

      {/* Kartu statistik ditarik naik menimpa hero. */}
      <div className="relative mx-auto -mt-16 max-w-6xl px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statCards.map((card) => <StatCard key={card.label} {...card} />)}
        </div>
      </div>

      {rejectedTransaksi.length > 0 && (
        <div className="mx-auto max-w-6xl px-6 pt-6">
          <section className="panel overflow-hidden border-danger/25">
            <div className="flex flex-col gap-2 border-b border-danger/15 bg-danger-bg px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="section-title text-danger">Transaksi ditolak</h2>
                <p className="page-subtitle">Periksa bagian yang ditandai lalu buka detail transaksi untuk tindak lanjut.</p>
              </div>
              <span className="badge badge-danger">{rejectedTransaksi.length} transaksi</span>
            </div>
            <div className="divide-y divide-border bg-white">
              {rejectedTransaksi.slice(0, 5).map((item) => {
                const rejected = rejectedStages(item)
                return (
                  <div key={item.id_transaksi} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-primary-dark">{item.id_transaksi}</span>
                        <SkemaBadge skema={item.skema} />
                        <RejectedBadge items={rejected} />
                      </div>
                      {rejected[0]?.catatan && <p className="mt-1 text-xs text-danger">{rejected[0].catatan}</p>}
                    </div>
                    <Link to={`/transaksi/${encodeURIComponent(item.id_transaksi)}`} className="text-sm font-bold text-primary hover:underline">Lihat detail</Link>
                  </div>
                )
              })}
            </div>
          </section>
        </div>
      )}

      {role === 'admin' && (
        <div className="mx-auto max-w-[96rem] px-4 pt-6 sm:px-6 2xl:max-w-[104rem]">
          <PantauanPengadaanTable rows={pantauan} />
        </div>
      )}

      {/* Operasi & Gudang adalah modul mandiri (lepas dari timeline transaksi),
          jadi daftar transaksi menunggu tindakan tidak relevan untuk dua role ini. */}
      {!['operasi', 'gudang', 'admin'].includes(role) && (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="section-title">Transaksi menunggu tindakan</h2>
            <p className="page-subtitle">
              {useGrouped && `${makloonGroups.length} makloon · `}
              {totalAntrean} transaksi menunggu tindakan Anda
            </p>
          </div>
          <div className="flex rounded-lg bg-primary-tint p-1 text-xs font-semibold text-primary">
            {(['semua', 'TJP', 'MPP'] as const).map((item) => (
              <button key={item} type="button" onClick={() => { setSkemaFilter(item); setPage(1) }} className={'rounded px-4 py-2 ' + (skemaFilter === item ? 'bg-white shadow-sm' : 'hover:bg-white/60')}>
                {item === 'semua' ? 'Semua' : item}
              </button>
            ))}
          </div>
        </div>

        {/* Filter kerjaan. Angkanya datang dari server (seluruh antrean), bukan dari halaman yang
            terbuka. Hanya kategori yang benar-benar ada di antrean role ini yang muncul -- Jemput
            Pangan tidak pernah memeriksa kiriman, Keuangan tidak pernah mengisi form. Kategori
            yang sedang aktif tetap ditampilkan walau nol supaya tidak hilang dari bawah kursor. */}
        <div className="mb-2 flex flex-wrap gap-2">
          <KerjaanChip label="Semua" jumlah={totalAntrean} aktif={kerjaanFilter === 'semua'} onClick={() => { setKerjaanFilter('semua'); setPage(1) }} />
          {KERJAAN_URUT.filter((id) => hitungKerjaan[id] > 0 || kerjaanFilter === id).map((id) => (
            <KerjaanChip key={id} label={KERJAAN_LABEL[id]} jumlah={hitungKerjaan[id]} aktif={kerjaanFilter === id} onClick={() => { setKerjaanFilter(id); setPage(1) }} />
          ))}
        </div>
        {kerjaanFilter !== 'semua' && <p className="page-subtitle mb-3">{KERJAAN_KETERANGAN[kerjaanFilter]}</p>}

        {isLoading && (useGrouped ? <SkeletonMakloonGroups /> : <SkeletonTable />)}
        {!isLoading && transaksi.length === 0 && <div className="panel px-4 py-3 text-sm text-gray-400">Tidak ada transaksi untuk filter ini.</div>}

        {!isLoading && transaksi.length > 0 && (
          useGrouped ? (
            <div className="space-y-3">
              {makloonGroups.map((group) => (
                <details key={group.nama} className="group panel overflow-hidden">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-primary-tint text-xs font-bold text-primary transition-colors group-open:bg-primary group-open:text-white">{inisialMakloon(group.nama)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold text-primary-dark">{group.nama}</div>
                      {group.lokasi && <div className="truncate text-xs text-gray-400">{group.lokasi}</div>}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {group.tjp > 0 && <SkemaCount skema="TJP" count={group.tjp} />}
                      {group.mpp > 0 && <SkemaCount skema="MPP" count={group.mpp} />}
                      <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90"><path d="M7 5l6 5-6 5V5z" /></svg>
                    </div>
                  </summary>
                  <div className="border-t border-border bg-surface">
                    <table className="w-full text-sm">
                      <thead className="text-left text-[0.68rem] font-bold uppercase tracking-wide text-muted">
                        <tr>
                          <th className="py-2 pl-16 pr-4">ID Transaksi</th>
                          <th className="px-4">Skema</th>
                          <th className="px-4">Tahap</th>
                          <th className="px-4">Status</th>
                          <th className="px-4">Tanggal</th>
                          <th className="px-4">ID Pemasok</th>
                          <th className="px-4"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.transaksi.map((t) => <TransaksiRow key={t.id_transaksi} t={t} />)}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="space-y-6">
              {tahapGroups.map((group) => <TabelTahap key={group.stage} stage={group.stage} rows={group.rows} />)}
            </div>
          )
        )}
        {meta && meta.last_page > 1 && (
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
            <span>Menampilkan {meta.from ?? 0}-{meta.to ?? 0} dari {meta.total} transaksi</span>
            <div className="flex gap-2">
              <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</button>
              <span className="badge">Halaman {meta.current_page}/{meta.last_page}</span>
              <button className="btn btn-ghost" disabled={page >= meta.last_page} onClick={() => setPage((prev) => prev + 1)}>Berikutnya</button>
            </div>
          </div>
        )}
      </div>
      )}
    </div>
  )
}

// Ikon garis sederhana untuk kartu statistik (stroke mengikuti warna teks kontainer).
const ICONS = {
  total: <path d="M4 7h16M4 12h16M4 17h10" />,
  berjalan: <><circle cx="12" cy="12" r="8" /><path d="M12 8v4l3 2" /></>,
  ditolak: <><circle cx="12" cy="12" r="8" /><path d="M9 9l6 6M15 9l-6 6" /></>,
  selesai: <><circle cx="12" cy="12" r="8" /><path d="M8.5 12.5l2.5 2.5 4.5-5" /></>,
  makloon: <><circle cx="9" cy="8" r="3" /><path d="M15 11a3 3 0 1 0-2-5.2M4 19a5 5 0 0 1 10 0M14 19a5 5 0 0 1 6-4.6" /></>,
}

// Kartu ringkasan angka di atas daftar transaksi -- dengan ikon & aksen warna per tone.
function StatCard({
  label,
  value,
  sub,
  tone,
  icon,
}: {
  label: string
  value: number
  sub: string
  tone: 'primary' | 'warning' | 'danger' | 'success' | 'accent'
  icon: ReactNode
}) {
  const cfg = {
    primary: { bar: 'bg-primary', chip: 'bg-primary-tint text-primary' },
    warning: { bar: 'bg-warning', chip: 'bg-warning-bg text-warning' },
    danger: { bar: 'bg-danger', chip: 'bg-danger-bg text-danger' },
    success: { bar: 'bg-success', chip: 'bg-success/10 text-success' },
    accent: { bar: 'bg-accent', chip: 'bg-accent/15 text-accent' },
  }[tone]
  return (
    <div className="panel relative overflow-hidden px-5 py-4 transition-shadow hover:shadow-md">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${cfg.bar}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
          <p className="mt-2 text-3xl font-bold text-primary-dark">{value}</p>
          <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
        </div>
        <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${cfg.chip}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">{icon}</svg>
        </span>
      </div>
    </div>
  )
}

function PantauanPengadaanTable({ rows }: { rows: PantauanRow[] }) {
  // null = tabel belum sempat melapor (render pertama); pakai seluruh baris dulu.
  const [barisTampil, setBarisTampil] = useState<PantauanRow[] | null>(null)
  const rowsTampil = barisTampil ?? rows

  const totals = rowsTampil.reduce(
    (acc, row) => ({
      gabahDiterima: acc.gabahDiterima + row.gabahDiterima,
      gabahAdministrasi: acc.gabahAdministrasi + row.gabahAdministrasi,
      belumDiadministrasi: acc.belumDiadministrasi + row.belumDiadministrasi,
      gabahSudahDiolah: acc.gabahSudahDiolah + row.gabahSudahDiolah,
      stokGudangAdmAda: acc.stokGudangAdmAda + row.stokGudangAdmAda,
      hgl: acc.hgl + row.hgl,
      broken: acc.broken + row.broken,
      menir: acc.menir + row.menir,
      katul: acc.katul + row.katul,
      realisasiPenerimaanHgb: acc.realisasiPenerimaanHgb + row.realisasiPenerimaanHgb,
      hglBelumAdministrasi: acc.hglBelumAdministrasi + row.hglBelumAdministrasi,
    }),
    { gabahDiterima: 0, gabahAdministrasi: 0, belumDiadministrasi: 0, gabahSudahDiolah: 0, stokGudangAdmAda: 0, hgl: 0, broken: 0, menir: 0, katul: 0, realisasiPenerimaanHgb: 0, hglBelumAdministrasi: 0 },
  )
  const totalRendemen = totals.gabahSudahDiolah > 0
    ? rowsTampil.reduce((sum, row) => sum + (row.rataRendemen * row.gabahSudahDiolah), 0) / totals.gabahSudahDiolah
    : 0
  const totalPersenDiolah = totals.gabahAdministrasi > 0 ? (totals.gabahSudahDiolah / totals.gabahAdministrasi) * 100 : 0
  const columns: SheetColumn<PantauanRow>[] = [
    { key: 'nama', label: 'Nama Makloon', value: (row) => row.nama, filterable: true },
    { key: 'gabah_diterima', label: 'GKP - Gabah Diterima', value: (row) => row.gabahDiterima, align: 'right' },
    { key: 'gabah_administrasi', label: 'GKP - Gabah Sudah di IN', value: (row) => row.gabahAdministrasi, align: 'right' },
    { key: 'belum_administrasi', label: 'GKP - Belum di IN', value: (row) => row.belumDiadministrasi, align: 'right' },
    { key: 'gabah_diolah', label: 'GKP - Gabah Sudah Diolah', value: (row) => row.gabahSudahDiolah, align: 'right' },
    { key: 'stok_gudang', label: 'GKP - Stok di Gudang ADM Ada', value: (row) => row.stokGudangAdmAda, align: 'right' },
    { key: 'hgl', label: 'Kuantum Hasil Olah - HGL', value: (row) => row.hgl, align: 'right' },
    { key: 'broken', label: 'Hasil Olah - Broken', value: (row) => row.broken, align: 'right' },
    { key: 'menir', label: 'Hasil Olah - Menir', value: (row) => row.menir, align: 'right' },
    { key: 'katul', label: 'Hasil Olah - Katul', value: (row) => row.katul, align: 'right' },
    { key: 'rendemen', label: 'Rata-rata Rendemen', value: (row) => pct(row.rataRendemen), align: 'right' },
    { key: 'hgb', label: 'Kuantum Penerimaan HGL', value: (row) => row.realisasiPenerimaanHgb, align: 'right' },
    { key: 'hgl_belum', label: 'HGL Belum Administrasi', value: (row) => row.hglBelumAdministrasi, align: 'right' },
    { key: 'persen_diolah', label: 'Persentase Gabah Diolah vs Administrasi', value: (row) => pct(row.persenDiolah), align: 'right' },
  ]
  const summary = [
    { label: 'Gabah Diterima', value: fmt(totals.gabahDiterima), tone: 'primary' },
    { label: 'Gabah Administrasi', value: fmt(totals.gabahAdministrasi), tone: 'primary' },
    { label: 'Belum Diadministrasi', value: fmt(totals.belumDiadministrasi), tone: 'warning' },
    { label: 'Gabah Sudah Diolah', value: fmt(totals.gabahSudahDiolah), tone: 'success' },
    { label: 'Rata-rata Rendemen', value: pct(totalRendemen), tone: 'accent' },
    { label: 'Persentase Diolah', value: pct(totalPersenDiolah), tone: 'accent' },
  ]

  return (
    <section className="panel panel-pad">
      <div className="toolbar-card mb-4">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent">Pantauan Admin</p>
          <h2 className="section-title mt-1">Pantauan Pengadaan GKP Tahun 2026</h2>
          <p className="page-subtitle">Satu baris = satu makloon - {columns.length} kolom</p>
        </div>
        <span className="badge">{rows.length} makloon</span>
      </div>

      <DataSpreadsheet
        rows={rows}
        columns={columns}
        rowKey={(row) => row.nama}
        namaFile="pantauan-pengadaan-gkp"
        emptyTitle="Belum ada data pantauan"
        emptyCopy="Data muncul setelah transaksi TJP atau MPP masuk rekap admin."
        onFilteredChange={setBarisTampil}
      />

      <div className="mt-4 rounded-lg border border-border bg-surface px-4 py-3">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <span className="section-title">Total pantauan pengadaan</span>
          <span className="text-xs font-semibold text-slate-500">
            {rowsTampil.length === rows.length
              ? 'Dihitung dari seluruh makloon pada pantauan'
              : `Mengikuti filter tabel — ${rowsTampil.length} dari ${rows.length} makloon`}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summary.map((item) => (
            <div key={item.label} className="rounded-lg border border-border bg-white px-4 py-3">
              <div className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-500">{item.label}</div>
              <div className={`mt-1 text-2xl font-extrabold ${item.tone === 'warning' ? 'text-warning' : item.tone === 'success' ? 'text-success' : item.tone === 'accent' ? 'text-accent' : 'text-primary-dark'}`}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

// Ilustrasi dekoratif hero dashboard: emblem gabah (motif logo) di dalam cincin, butir gabah
// bertaburan, dan garis tren naik sebagai simbol progres/semangat.
function DashboardGrafis() {
  return (
    <svg viewBox="0 0 360 300" fill="none" className="h-64 w-full" role="img" aria-label="Ilustrasi panen gabah">
      <circle cx="200" cy="150" r="140" stroke="rgba(255,255,255,0.06)" strokeWidth="1.5" />
      <circle cx="200" cy="150" r="108" stroke="rgba(217,164,65,0.30)" strokeWidth="1.5" strokeDasharray="3 9" />
      <circle cx="200" cy="150" r="74" fill="rgba(217,164,65,0.06)" />
      {/* emblem gabah (motif logo), emas */}
      <g transform="translate(100,50) scale(5)" stroke="#D9A441" strokeWidth="0.8" strokeLinecap="round">
        <path d="M20 31V16" />
        <path d="M20 17c-3.4-.4-5.6-2.4-6.4-5.6" />
        <path d="M20 17c3.4-.4 5.6-2.4 6.4-5.6" />
        <path d="M20 22c-3.4-.4-5.6-2.4-6.4-5.6" />
        <path d="M20 22c3.4-.4 5.6-2.4 6.4-5.6" />
        <path d="M20 27c-3.4-.4-5.6-2.4-6.4-5.6" />
        <path d="M20 27c3.4-.4 5.6-2.4 6.4-5.6" />
        <path d="M20 15.5c0-2.7 1-4.6 3-5.8" />
        <path d="M20 15.5c0-2.7-1-4.6-3-5.8" />
      </g>
      {/* butir gabah bertaburan */}
      <circle cx="70" cy="72" r="4" fill="#D9A441" fillOpacity="0.7" />
      <circle cx="304" cy="104" r="5" fill="#ffffff" fillOpacity="0.45" />
      <circle cx="86" cy="214" r="6" fill="#D9A441" fillOpacity="0.45" />
      <circle cx="312" cy="228" r="4" fill="#ffffff" fillOpacity="0.4" />
      {/* garis tren naik */}
      <polyline points="66,252 116,238 166,244 216,212 266,222 322,182" stroke="rgba(255,255,255,0.32)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="322" cy="182" r="4" fill="#D9A441" />
    </svg>
  )
}

/** Baris di dalam accordion per-makloon (indentasi mengikuti kolom nama grup). */
function TransaksiRow({ t }: { t: TransaksiListItem }) {
  const rejected = rejectedStages(t)
  return (
    <tr className={`border-t border-border/60 ${rejected.length > 0 ? 'bg-danger-bg/60' : ''}`}>
      <td className="py-3 pl-16 pr-4 font-medium text-primary-dark">{t.id_transaksi}</td>
      <td className="px-4"><SkemaBadge skema={t.skema} /></td>
      <td className="px-4 capitalize text-gray-600">{labelTahap(t.current_stage)}</td>
      <td className="px-4"><KerjaanBadge row={t} /></td>
      <td className="px-4 text-gray-500">{tanggalSingkat(tanggalTransaksi(t))}</td>
      <td className="px-4 text-gray-600">{kunciTransaksi(t).id_pemasok ?? '-'}</td>
      <td className="py-3 pl-4 pr-4 text-right"><Link to={`/transaksi/${encodeURIComponent(t.id_transaksi)}`} className="font-medium text-primary hover:underline">Lihat</Link></td>
    </tr>
  )
}

/** Satu blok tabel per tahap, dipakai role Makloon yang memegang tiga tahap sekaligus. */
function TabelTahap({ stage, rows }: { stage: string; rows: TransaksiListItem[] }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h3 className="section-title">{labelTahap(stage)}</h3>
          {TAHAP_KETERANGAN[stage] && <p className="page-subtitle">{TAHAP_KETERANGAN[stage]}</p>}
        </div>
        <span className="badge">{rows.length} transaksi</span>
      </div>
      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-primary-tint text-left text-primary-dark">
            <tr>
              <th className="px-4 py-2">ID Transaksi</th>
              <th className="px-4 py-2">Skema</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Tanggal</th>
              <th className="px-4 py-2">ID Pemasok</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => <DashboardTableRow key={t.id_transaksi} t={t} />)}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** Baris tabel datar. Kolom Tahap dihilangkan -- judul blok di atasnya sudah menyebutkannya. */
function DashboardTableRow({ t }: { t: TransaksiListItem }) {
  const rejected = rejectedStages(t)
  return (
    <tr className={`border-t border-border ${rejected.length > 0 ? 'bg-danger-bg/60' : ''}`}>
      <td className="px-4 py-2 font-medium text-primary-dark">{t.id_transaksi}</td>
      <td className="px-4 py-2"><SkemaBadge skema={t.skema} /></td>
      <td className="px-4 py-2"><KerjaanBadge row={t} /></td>
      <td className="px-4 py-2">{new Date(tanggalTransaksi(t)).toLocaleDateString('id-ID')}</td>
      <td className="px-4 py-2">{kunciTransaksi(t).id_pemasok ?? '-'}</td>
      <td className="px-4 py-2 text-right"><Link to={`/transaksi/${encodeURIComponent(t.id_transaksi)}`} className="font-medium text-primary">Lihat</Link></td>
    </tr>
  )
}
