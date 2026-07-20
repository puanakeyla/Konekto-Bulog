import { useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useRekapTransaksi, type RekapTransaksi } from '../hooks/useRekapTransaksi'
import { useTransaksiList, type TransaksiListItem } from '../hooks/useTransaksiList'
import { SkeletonMakloonGroups, SkeletonTable } from '../components/Skeleton'

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

const ACTIVE_STAT_ROLES = new Set(['jemput_pangan', 'ub_jastasma', 'pengadaan', 'keuangan'])

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

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'selesai' ? 'badge-success' : status === 'dibatalkan' ? 'badge-danger' : 'badge-warning'
  return <span className={`badge ${cls} capitalize`}>{status.replaceAll('_', ' ')}</span>
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

function kontribusiPo(row: RekapTransaksi) {
  return num(row.data_pengadaan?.po_detail?.find((detail) => detail.transaksi_id === row.id_transaksi)?.kuantum_kontribusi)
}

function kuantumMakloon(row: RekapTransaksi) {
  return num(row.data_makloon_tjp?.kuantum_bongkar ?? row.data_makloon_mpp?.kuantum)
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

function pantauanRows(rows: RekapTransaksi[], hasilOperasi: OperasiTotals): PantauanRow[] {
  const map = new Map<string, PantauanRow>()

  for (const row of rows) {
    const nama = row.nama_maklon ?? 'Tanpa makloon'
    let item = map.get(nama)
    if (!item) {
      item = {
        nama,
        gabahDiterima: 0,
        gabahAdministrasi: 0,
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
      }
      map.set(nama, item)
    }

    const diterima = kuantumMakloon(row)
    const administrasi = kontribusiPo(row)

    item.gabahDiterima += diterima
    item.gabahAdministrasi += administrasi
  }

  const items = Array.from(map.values())
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
  const [page, setPage] = useState(1)
  const { data: transaksiPage, isLoading } = useTransaksiList(page)
  const { data: rekapPage } = useRekapTransaksi(1, 200)
  const [skemaFilter, setSkemaFilter] = useState<SkemaFilter>('semua')
  const transaksi = transaksiPage?.items ?? []
  const rekapTransaksi = rekapPage?.items ?? []
  const meta = transaksiPage?.meta
  const filteredTransaksi = useMemo(
    () => transaksi.filter((item) => skemaFilter === 'semua' || item.skema === skemaFilter),
    [transaksi, skemaFilter],
  )
  const useGrouped = !!user && GROUPED_ROLES.has(user.role.nama_role)
  const makloonGroups = useMemo(() => groupByMakloon(filteredTransaksi), [filteredTransaksi])

  // Ringkasan dihitung dari data yang sudah di-fetch (tanpa endpoint baru).
  const role = user?.role.nama_role ?? ''
  const statSource = role === 'admin' || role === 'keuangan' ? rekapTransaksi : transaksi
  const total = role === 'admin' || role === 'keuangan' ? rekapTransaksi.length : (meta?.total ?? transaksi.length)
  const berjalan = useMemo(
    () => role === 'admin'
      ? rekapTransaksi.filter((t) => t.status_keseluruhan === 'berjalan').length
      : transaksi.filter((t) => t.status_keseluruhan === 'berjalan').length,
    [rekapTransaksi, role, transaksi],
  )
  const selesai = useMemo(
    () => role === 'admin' || role === 'keuangan'
      ? rekapTransaksi.filter((t) => t.status_keseluruhan === 'selesai' || t.current_stage === 'selesai').length
      : transaksi.filter((t) => t.status_keseluruhan === 'selesai').length,
    [rekapTransaksi, role, transaksi],
  )
  const makloonTerhubung = useMemo(
    () => new Set(statSource.map((t) => t.nama_maklon ?? 'Tanpa makloon')).size,
    [statSource],
  )
  const perluTindakan = useMemo(
    () => role === 'admin'
      ? rekapTransaksi.filter((t) => ACTIVE_STAT_ROLES.has(t.current_stage) && t.status_keseluruhan === 'berjalan').length
      : berjalan,
    [berjalan, rekapTransaksi, role],
  )
  const statCards = role === 'admin'
    ? [
        { label: 'Total transaksi', value: total, sub: 'data rekap masuk', tone: 'primary' as const, icon: ICONS.total },
        { label: 'Perlu diproses', value: perluTindakan, sub: 'tahap aktif', tone: 'warning' as const, icon: ICONS.berjalan },
        { label: 'Selesai', value: selesai, sub: 'sudah rampung', tone: 'success' as const, icon: ICONS.selesai },
        { label: 'Makloon terhubung', value: makloonTerhubung, sub: 'mitra pada rekap', tone: 'accent' as const, icon: ICONS.makloon },
      ]
    : [
        { label: 'Total transaksi', value: total, sub: 'keseluruhan', tone: 'primary' as const, icon: ICONS.total },
        { label: 'Sedang berjalan', value: berjalan, sub: 'menunggu tindakan', tone: 'warning' as const, icon: ICONS.berjalan },
        { label: 'Selesai', value: selesai, sub: 'sudah rampung', tone: 'success' as const, icon: ICONS.selesai },
        { label: 'Makloon terhubung', value: makloonTerhubung, sub: 'mitra pada daftar', tone: 'accent' as const, icon: ICONS.makloon },
      ]
  const pantauan = useMemo(
    () => pantauanRows(rekapTransaksi, HASIL_OLAH_KOSONG),
    [rekapTransaksi],
  )

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
                Halo, {user?.username}<span className="text-accent">.</span>
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
            {useGrouped
              ? <p className="page-subtitle">{makloonGroups.length} makloon · {filteredTransaksi.filter((t) => t.status_keseluruhan === 'berjalan').length} transaksi berjalan</p>
              : <p className="page-subtitle">Pisahkan daftar berdasarkan skema TJP atau MPP.</p>}
          </div>
          <div className="flex rounded-lg bg-primary-tint p-1 text-xs font-semibold text-primary">
            {(['semua', 'TJP', 'MPP'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setSkemaFilter(item)} className={'rounded px-4 py-2 ' + (skemaFilter === item ? 'bg-white shadow-sm' : 'hover:bg-white/60')}>
                {item === 'semua' ? 'Semua' : item}
              </button>
            ))}
          </div>
        </div>

        {isLoading && (useGrouped ? <SkeletonMakloonGroups /> : <SkeletonTable />)}
        {!isLoading && filteredTransaksi.length === 0 && <div className="panel px-4 py-3 text-sm text-gray-400">Tidak ada transaksi untuk filter ini.</div>}

        {!isLoading && filteredTransaksi.length > 0 && (
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
                      <tbody>
                        {group.transaksi.map((t) => <TransaksiRow key={t.id_transaksi} t={t} />)}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <div className="panel overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-primary-tint text-left text-primary-dark">
                  <tr>
                    <th className="px-4 py-2">ID Transaksi</th>
                    <th className="px-4 py-2">Skema</th>
                    <th className="px-4 py-2">Tahap</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2">Tanggal</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransaksi.map((t) => (
                    <tr key={t.id_transaksi} className="border-t border-border">
                      <td className="px-4 py-2 font-medium text-primary-dark">{t.id_transaksi}</td>
                      <td className="px-4 py-2"><span className="badge">{t.skema}</span></td>
                      <td className="px-4 py-2">{t.current_stage.replaceAll('_', ' ')}</td>
                      <td className="px-4 py-2">{t.status_keseluruhan.replaceAll('_', ' ')}</td>
                      <td className="px-4 py-2">{new Date(t.created_at).toLocaleDateString('id-ID')}</td>
                      <td className="px-4 py-2 text-right"><Link to={`/transaksi/${encodeURIComponent(t.id_transaksi)}`} className="font-medium text-primary">Lihat</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
  tone: 'primary' | 'warning' | 'success' | 'accent'
  icon: ReactNode
}) {
  const cfg = {
    primary: { bar: 'bg-primary', chip: 'bg-primary-tint text-primary' },
    warning: { bar: 'bg-warning', chip: 'bg-warning-bg text-warning' },
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
  const totals = rows.reduce(
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
    ? rows.reduce((sum, row) => sum + (row.rataRendemen * row.gabahSudahDiolah), 0) / totals.gabahSudahDiolah
    : 0
  const totalPersenDiolah = totals.gabahAdministrasi > 0 ? (totals.gabahSudahDiolah / totals.gabahAdministrasi) * 100 : 0

  return (
    <section className="panel overflow-hidden">
      <div className="flex flex-col gap-2 border-b border-border bg-white px-5 py-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent">Pantauan Admin</p>
          <h2 className="mt-1 text-base font-extrabold uppercase tracking-wide text-primary-dark">Pantauan Pengadaan GKP Tahun 2026</h2>
        </div>
        <span className="badge">{rows.length} makloon</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-[1740px] w-full table-fixed border-collapse text-[0.70rem] text-primary-dark">
          <colgroup>
            <col className="w-[44px]" />
            <col className="w-[260px]" />
            <col className="w-[112px]" />
            <col className="w-[122px]" />
            <col className="w-[124px]" />
            <col className="w-[122px]" />
            <col className="w-[130px]" />
            <col className="w-[108px]" />
            <col className="w-[108px]" />
            <col className="w-[108px]" />
            <col className="w-[108px]" />
            <col className="w-[120px]" />
            <col className="w-[134px]" />
            <col className="w-[132px]" />
            <col className="w-[156px]" />
          </colgroup>
          <thead className="text-center font-extrabold uppercase leading-tight">
            <tr>
              <th rowSpan={2} className="border border-slate-300 bg-slate-100 px-1.5 py-2">No</th>
              <th rowSpan={2} className="border border-slate-300 bg-slate-100 px-3 py-2 text-left">Nama Makloon</th>
              <th colSpan={5} className="border border-slate-300 bg-[#fff56a] px-2 py-2">GKP</th>
              <th colSpan={4} className="border border-slate-300 bg-[#dbe8f5] px-2 py-2">Hasil Olah</th>
              <th rowSpan={2} className="border border-slate-300 bg-[#8cff66] px-2 py-2">Rata-rata<br />rendemen</th>
              <th rowSpan={2} className="border border-slate-300 bg-[#e7a13a] px-2 py-2">Realisasi<br />Penerimaan HGB</th>
              <th rowSpan={2} className="border border-slate-300 bg-[#e7a13a] px-2 py-2">HGL Belum<br />Administrasi</th>
              <th rowSpan={2} className="border border-slate-300 bg-[#fff0b5] px-2 py-2">Persentase Gabah<br />Diolah dibanding<br />Administrasi Gabah</th>
            </tr>
            <tr>
              <th className="border border-slate-300 bg-[#fff56a] px-2 py-2">Gabah<br />Diterima</th>
              <th className="border border-slate-300 bg-[#fff56a] px-2 py-2">Gabah<br />Administrasi</th>
              <th className="border border-slate-300 bg-[#fff56a] px-2 py-2">Belum<br />Diadministrasi</th>
              <th className="border border-slate-300 bg-[#fff56a] px-2 py-2">Gabah Sudah<br />Diolah</th>
              <th className="border border-slate-300 bg-[#fff56a] px-2 py-2">Stok di Gudang<br />ADM ADA</th>
              <th className="border border-slate-300 bg-[#dbe8f5] px-2 py-2">HGL</th>
              <th className="border border-slate-300 bg-[#dbe8f5] px-2 py-2">Broken</th>
              <th className="border border-slate-300 bg-[#dbe8f5] px-2 py-2">Menir</th>
              <th className="border border-slate-300 bg-[#dbe8f5] px-2 py-2">Katul</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={16} className="border border-slate-300 px-4 py-8 text-center text-muted">Belum ada data transaksi yang dapat dipantau.</td>
              </tr>
            )}
            {rows.map((row, index) => <PantauanRowView key={row.nama} row={row} index={index} />)}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="font-extrabold">
              <tr>
                <td colSpan={2} className="border border-slate-300 bg-slate-100 px-3 py-2 text-right">TOTAL</td>
                <td className="border border-slate-300 bg-[#fffbc0] px-2 py-2 text-right">{fmt(totals.gabahDiterima)}</td>
                <td className="border border-slate-300 bg-[#fffbc0] px-2 py-2 text-right">{fmt(totals.gabahAdministrasi)}</td>
                <td className="border border-slate-300 bg-[#fffbc0] px-2 py-2 text-right">{fmt(totals.belumDiadministrasi)}</td>
                <td className="border border-slate-300 bg-[#fffbc0] px-2 py-2 text-right">{fmt(totals.gabahSudahDiolah)}</td>
                <td className="border border-slate-300 bg-[#fffbc0] px-2 py-2 text-right">{fmt(totals.stokGudangAdmAda)}</td>
                <td className="border border-slate-300 bg-[#eaf2fa] px-2 py-2 text-right">{fmt(totals.hgl)}</td>
                <td className="border border-slate-300 bg-[#eaf2fa] px-2 py-2 text-right">{fmt(totals.broken)}</td>
                <td className="border border-slate-300 bg-[#eaf2fa] px-2 py-2 text-right">{fmt(totals.menir)}</td>
                <td className="border border-slate-300 bg-[#eaf2fa] px-2 py-2 text-right">{fmt(totals.katul)}</td>
                <td className="border border-slate-300 bg-[#caffb6] px-2 py-2 text-right">{pct(totalRendemen)}</td>
                <td className="border border-slate-300 bg-[#f2be72] px-2 py-2 text-right">{fmt(totals.realisasiPenerimaanHgb)}</td>
                <td className="border border-slate-300 bg-[#f2be72] px-2 py-2 text-right">{fmt(totals.hglBelumAdministrasi)}</td>
                <td className="border border-slate-300 bg-[#fff0b5] px-2 py-2 text-right">{pct(totalPersenDiolah)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  )
}

function PantauanRowView({ row, index }: { row: PantauanRow; index: number }) {
  return (
    <tr className="odd:bg-white even:bg-slate-50 hover:bg-primary-tint/50">
      <td className="border border-slate-300 bg-slate-100 px-2 py-1.5 text-center font-semibold">{index + 1}</td>
      <td className="border border-slate-300 bg-slate-100 px-3 py-1.5 font-semibold uppercase">{row.nama}</td>
      <td className="border border-slate-300 bg-[#ffff68] px-2 py-1.5 text-right">{fmt(row.gabahDiterima)}</td>
      <td className="border border-slate-300 bg-[#ffff68] px-2 py-1.5 text-right">{fmt(row.gabahAdministrasi)}</td>
      <td className="border border-slate-300 bg-[#ffff68] px-2 py-1.5 text-right">{fmt(row.belumDiadministrasi)}</td>
      <td className="border border-slate-300 bg-[#ffff68] px-2 py-1.5 text-right">{fmt(row.gabahSudahDiolah)}</td>
      <td className="border border-slate-300 bg-[#ffff68] px-2 py-1.5 text-right">{fmt(row.stokGudangAdmAda)}</td>
      <td className="border border-slate-300 bg-[#dbe8f5] px-2 py-1.5 text-right">{fmt(row.hgl)}</td>
      <td className="border border-slate-300 bg-[#dbe8f5] px-2 py-1.5 text-right">{fmt(row.broken)}</td>
      <td className="border border-slate-300 bg-[#dbe8f5] px-2 py-1.5 text-right">{fmt(row.menir)}</td>
      <td className="border border-slate-300 bg-[#dbe8f5] px-2 py-1.5 text-right">{fmt(row.katul)}</td>
      <td className="border border-slate-300 bg-[#8cff66] px-2 py-1.5 text-right font-semibold">{pct(row.rataRendemen)}</td>
      <td className="border border-slate-300 bg-[#e7a13a] px-2 py-1.5 text-right">{fmt(row.realisasiPenerimaanHgb)}</td>
      <td className="border border-slate-300 bg-[#e7a13a] px-2 py-1.5 text-right">{fmt(row.hglBelumAdministrasi)}</td>
      <td className="border border-slate-300 bg-[#fff0b5] px-2 py-1.5 text-right font-semibold">{pct(row.persenDiolah)}</td>
    </tr>
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

function TransaksiRow({ t }: { t: TransaksiListItem }) {
  return (
    <tr className="border-t border-border/60">
      <td className="py-3 pl-16 pr-4 font-medium text-primary-dark">{t.id_transaksi}</td>
      <td className="px-4"><SkemaBadge skema={t.skema} /></td>
      <td className="px-4 capitalize text-gray-600">{t.current_stage.replaceAll('_', ' ')}</td>
      <td className="px-4"><StatusBadge status={t.status_keseluruhan} /></td>
      <td className="px-4 text-gray-500">{tanggalSingkat(t.created_at)}</td>
      <td className="py-3 pl-4 pr-4 text-right"><Link to={`/transaksi/${encodeURIComponent(t.id_transaksi)}`} className="font-medium text-primary hover:underline">Lihat →</Link></td>
    </tr>
  )
}
