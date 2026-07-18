import { useMemo, useState, type ReactNode } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
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

// Tombol aksi utama per role -- kondisi identik dengan versi lama, hanya dipindah ke hero.
function buildActions(role: string): { to: string; label: string }[] {
  const a: { to: string; label: string }[] = []
  if (role === 'admin') {
    a.push(
      { to: '/admin/users', label: 'Kelola User' },
      { to: '/admin/makloon', label: 'Kelola Makloon' },
      { to: '/monitoring', label: 'Monitoring' },
      { to: '/rekap', label: 'Rekap Data' },
      { to: '/pengadaan', label: 'Keputusan Pengeluaran Stok' },
      { to: '/keuangan', label: 'Kelola Pembayaran PO' },
      { to: '/operasi', label: 'Input Data Operasi' },
      { to: '/operasi/rekap', label: 'Rekap Hasil Operasi' },
      { to: '/gudang', label: 'Input Penerimaan Gudang' },
      { to: '/gudang/rekap', label: 'Rekap Penerimaan Gudang' },
      { to: '/admin/audit-logs', label: 'Audit Log' },
    )
    return a
  }
  if (role === 'jemput_pangan') a.push({ to: '/transaksi/baru', label: 'Buat Transaksi Jemput Pangan' })
  if (role === 'makloon') a.push({ to: '/transaksi/baru-mpp', label: 'Buat Baru (MPP)' })
  // Rekap tabel lintas tahap (kolom kumulatif sesuai role).
  if (['jemput_pangan', 'makloon', 'ub_jastasma', 'pengadaan', 'keuangan'].includes(role)) {
    a.push({ to: '/rekap', label: 'Rekap Data' })
  }
  if (role === 'pengadaan' || role === 'admin') a.push({ to: '/pengadaan', label: 'Keputusan Pengeluaran Stok' })
  if (role === 'keuangan' || role === 'admin') a.push({ to: '/keuangan', label: 'Kelola Pembayaran PO' })
  if (role === 'operasi' || role === 'admin') a.push({ to: '/operasi', label: 'Input Data Operasi' }, { to: '/operasi/rekap', label: 'Rekap Hasil Operasi' })
  if (role === 'gudang' || role === 'admin') a.push({ to: '/gudang', label: 'Input Penerimaan Gudang' }, { to: '/gudang/rekap', label: 'Rekap Penerimaan Gudang' })
  return a
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

function StatusBadge({ status }: { status: string }) {
  const cls = status === 'selesai' ? 'badge-success' : status === 'dibatalkan' ? 'badge-danger' : 'badge-warning'
  return <span className={`badge ${cls} capitalize`}>{status.replaceAll('_', ' ')}</span>
}

export default function DashboardPage() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const { data: transaksiPage, isLoading } = useTransaksiList(page)
  const [skemaFilter, setSkemaFilter] = useState<SkemaFilter>('semua')
  const transaksi = transaksiPage?.items ?? []
  const meta = transaksiPage?.meta
  const filteredTransaksi = useMemo(
    () => transaksi.filter((item) => skemaFilter === 'semua' || item.skema === skemaFilter),
    [transaksi, skemaFilter],
  )
  const useGrouped = !!user && GROUPED_ROLES.has(user.role.nama_role)
  const makloonGroups = useMemo(() => groupByMakloon(filteredTransaksi), [filteredTransaksi])

  // Ringkasan dihitung dari data yang sudah di-fetch (tanpa endpoint baru).
  const total = meta?.total ?? transaksi.length
  const berjalan = useMemo(() => transaksi.filter((t) => t.status_keseluruhan === 'berjalan').length, [transaksi])
  const selesai = useMemo(() => transaksi.filter((t) => t.status_keseluruhan === 'selesai').length, [transaksi])
  const makloonTerhubung = useMemo(
    () => new Set(transaksi.map((t) => t.nama_maklon ?? 'Tanpa makloon')).size,
    [transaksi],
  )

  const now = new Date()
  const jam = now.getHours()
  const sapaan = jam < 11 ? 'Selamat pagi' : jam < 15 ? 'Selamat siang' : jam < 18 ? 'Selamat sore' : 'Selamat malam'
  const tanggalPanjang = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now)

  const role = user?.role.nama_role ?? ''
  const roleLabel = ROLE_LABEL[role] ?? role.replaceAll('_', ' ')
  const roleSubtitle = ROLE_SUBTITLE[role] ?? 'Pantau dan kelola transaksi serap gabah dari satu tempat.'
  const actions = user ? buildActions(role) : []

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

              {actions.length > 0 && (
                <div className="mt-7 flex flex-wrap gap-2.5">
                  {actions.map((a) => (
                    <NavLink
                      key={a.to}
                      to={a.to}
                      className={({ isActive }) =>
                        'rounded-lg px-5 py-2.5 text-sm font-semibold transition-all ' +
                        (isActive
                          ? 'bg-accent text-primary-dark shadow-sm hover:bg-white hover:shadow-md'
                          : 'border border-white/15 bg-white/10 text-white hover:bg-white/20')
                      }
                    >
                      {a.label}
                    </NavLink>
                  ))}
                </div>
              )}
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
          <StatCard label="Total transaksi" value={total} sub="keseluruhan" tone="primary" icon={ICONS.total} />
          <StatCard label="Sedang berjalan" value={berjalan} sub="menunggu tindakan" tone="warning" icon={ICONS.berjalan} />
          <StatCard label="Selesai" value={selesai} sub="sudah rampung" tone="success" icon={ICONS.selesai} />
          <StatCard label="Makloon terhubung" value={makloonTerhubung} sub="mitra pada daftar" tone="accent" icon={ICONS.makloon} />
        </div>
      </div>

      {/* Operasi & Gudang adalah modul mandiri (lepas dari timeline transaksi),
          jadi daftar transaksi menunggu tindakan tidak relevan untuk dua role ini. */}
      {!['operasi', 'gudang'].includes(role) && (
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
