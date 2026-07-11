import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTransaksiList } from '../hooks/useTransaksiList'

type SkemaFilter = 'semua' | 'TJP' | 'MPP'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const { data: transaksi, isLoading } = useTransaksiList()
  const [skemaFilter, setSkemaFilter] = useState<SkemaFilter>('semua')
  const filteredTransaksi = useMemo(
    () => (transaksi ?? []).filter((item) => skemaFilter === 'semua' || item.skema === skemaFilter),
    [transaksi, skemaFilter],
  )

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
            <p className="page-subtitle">Pisahkan daftar berdasarkan skema TJP atau MPP.</p>
          </div>
          <div className="flex rounded-lg bg-primary-tint p-1 text-xs font-semibold text-primary">
            {(['semua', 'TJP', 'MPP'] as const).map((item) => (
              <button key={item} type="button" onClick={() => setSkemaFilter(item)} className={'rounded px-4 py-2 ' + (skemaFilter === item ? 'bg-white shadow-sm' : 'hover:bg-white/60')}>
                {item === 'semua' ? 'Semua' : item}
              </button>
            ))}
          </div>
        </div>

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
              {isLoading && <tr><td className="px-4 py-3 text-gray-400" colSpan={6}>Memuat...</td></tr>}
              {!isLoading && filteredTransaksi.length === 0 && <tr><td className="px-4 py-3 text-gray-400" colSpan={6}>Tidak ada transaksi untuk filter ini.</td></tr>}
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
      </div>
    </div>
  )
}
