import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTransaksiList, type TransaksiListItem } from '../hooks/useTransaksiList'
import { SkeletonMakloonGroups, SkeletonTable } from '../components/Skeleton'

type SkemaFilter = 'semua' | 'TJP' | 'MPP'

// Role yang menampilkan daftar transaksi dikelompokkan per makloon (accordion).
// Semua role operasional + Admin, KECUALI Makloon (dia hanya melihat transaksinya sendiri).
const GROUPED_ROLES = new Set(['jemput_pangan', 'ub_jastasma', 'pengadaan', 'keuangan', 'operasi', 'gudang', 'admin'])

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
  const { user, logout } = useAuth()
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

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Dashboard Konekto</h1>
            <p className="page-subtitle">Masuk sebagai <strong>{user?.username}</strong> ({user?.role.nama_role})</p>
          </div>
          <button onClick={() => logout()} className="btn btn-outline-danger">Keluar</button>
        </div>

        <div className="mb-5 flex flex-wrap gap-3">
          {user?.role.nama_role === 'admin' && <Link to="/admin/users" className="btn btn-primary">Kelola User</Link>}
          {user?.role.nama_role === 'admin' && <Link to="/monitoring" className="btn btn-primary">Monitoring</Link>}
          {user?.role.nama_role === 'jemput_pangan' && <Link to="/transaksi/baru" className="btn btn-primary">Buat Transaksi Jemput Pangan</Link>}
          {user?.role.nama_role === 'makloon' && <Link to="/transaksi/baru-mpp" className="btn btn-primary">Buat Baru (MPP)</Link>}
          {(user?.role.nama_role === 'pengadaan' || user?.role.nama_role === 'admin') && <Link to="/pengadaan" className="btn btn-primary">Kelola Pengadaan</Link>}
          {(user?.role.nama_role === 'keuangan' || user?.role.nama_role === 'admin') && <Link to="/keuangan" className="btn btn-primary">Kelola Pembayaran PO</Link>}
          {(user?.role.nama_role === 'operasi' || user?.role.nama_role === 'admin') && <Link to="/operasi" className="btn btn-primary">Input Data Operasi</Link>}
          {(user?.role.nama_role === 'gudang' || user?.role.nama_role === 'admin') && <Link to="/gudang" className="btn btn-primary">Input Penerimaan Gudang</Link>}
        </div>
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
              {makloonGroups.map((group, index) => (
                <details key={group.nama} open={index === 0} className="group panel overflow-hidden">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                    <span className={`grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg text-xs font-bold ${index === 0 ? 'bg-primary text-white' : 'bg-primary-tint text-primary'}`}>{inisialMakloon(group.nama)}</span>
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
