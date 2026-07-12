import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
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
  if (role === 'admin') a.push({ to: '/admin/users', label: 'Kelola User' }, { to: '/admin/audit-logs', label: 'Audit Log' }, { to: '/monitoring', label: 'Monitoring' })
  if (role === 'jemput_pangan') a.push({ to: '/transaksi/baru', label: 'Buat Transaksi Jemput Pangan' })
  if (role === 'makloon') a.push({ to: '/transaksi/baru-mpp', label: 'Buat Baru (MPP)' })
  if (role === 'pengadaan' || role === 'admin') a.push({ to: '/pengadaan', label: 'Kelola Pengadaan' })
  if (role === 'keuangan' || role === 'admin') a.push({ to: '/keuangan', label: 'Kelola Pembayaran PO' })
  if (role === 'operasi' || role === 'admin') a.push({ to: '/operasi', label: 'Input Data Operasi' })
  if (role === 'gudang' || role === 'admin') a.push({ to: '/gudang', label: 'Input Penerimaan Gudang' })
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
      {/* Hero sambutan -- navy dramatis, gaya landing page. */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#14213f] via-primary-dark to-primary text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full bg-accent/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-28 bottom-0 h-72 w-72 rounded-full bg-primary/50 blur-3xl" />

        <div className="relative mx-auto max-w-6xl px-6 pb-24 pt-9">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            {sapaan} &middot; {tanggalPanjang}
          </span>
          <h1 className="mt-5 text-3xl font-bold tracking-tight md:text-4xl">
            Halo, {user?.username}<span className="text-accent">.</span>
          </h1>
          <div className="mt-2 flex items-center gap-2 text-sm text-white/60">
            <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs font-semibold text-white">{roleLabel}</span>
          </div>
          <p className="mt-4 max-w-xl text-sm leading-6 text-white/70">{roleSubtitle}</p>

          {actions.length > 0 && (
            <div className="mt-6 flex flex-wrap gap-2.5">
              {actions.map((a, i) => (
                <Link
                  key={a.to}
                  to={a.to}
                  className={
                    i === 0
                      ? 'rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-primary-dark shadow-sm transition-all hover:bg-white hover:shadow-md'
                      : 'rounded-lg border border-white/15 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-white/20'
                  }
                >
                  {a.label}
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Kartu statistik ditarik naik menimpa hero. */}
      <div className="relative mx-auto -mt-16 max-w-6xl px-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Total transaksi" value={total} sub="keseluruhan" tone="primary" />
          <StatCard label="Sedang berjalan" value={berjalan} sub="menunggu tindakan" tone="warning" />
          <StatCard label="Selesai" value={selesai} sub="sudah rampung" tone="success" />
          <StatCard label="Makloon terhubung" value={makloonTerhubung} sub="mitra pada daftar" tone="accent" />
        </div>
      </div>

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
    </div>
  )
}

// Kartu ringkasan angka di atas daftar transaksi.
function StatCard({
  label,
  value,
  sub,
  tone,
}: {
  label: string
  value: number
  sub: string
  tone: 'primary' | 'warning' | 'success' | 'accent'
}) {
  const dot = { primary: 'bg-primary', warning: 'bg-warning', success: 'bg-success', accent: 'bg-accent' }[tone]
  return (
    <div className="panel px-5 py-4 transition-shadow hover:shadow-md">
      <div className="flex items-center gap-2">
        <span aria-hidden className={`h-2 w-2 rounded-full ${dot}`} />
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      </div>
      <p className="mt-2 text-3xl font-bold text-primary-dark">{value}</p>
      <p className="mt-0.5 text-xs text-slate-500">{sub}</p>
    </div>
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
