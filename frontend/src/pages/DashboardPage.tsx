import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useTransaksiList } from '../hooks/useTransaksiList'

export default function DashboardPage() {
  const { user, logout } = useAuth()
  const { data: transaksi, isLoading } = useTransaksiList()

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-medium text-primary">Dashboard Konekto</h1>
        <button
          onClick={() => logout()}
          className="text-sm text-danger border border-danger rounded px-3 py-1"
        >
          Keluar
        </button>
      </div>
      <p className="mb-4">
        Masuk sebagai <strong>{user?.username}</strong> ({user?.role.nama_role})
      </p>
      {user?.role.nama_role === 'jemput_pangan' && (
        <Link
          to="/transaksi/baru"
          className="inline-block bg-primary text-white rounded px-4 py-2 text-sm mb-6"
        >
          Buat Transaksi Jemput Pangan
        </Link>
      )}
      {user?.role.nama_role === 'makloon' && (
        <Link
          to="/transaksi/baru-mpp"
          className="inline-block bg-primary text-white rounded px-4 py-2 text-sm mb-6"
        >
          Buat Baru (MPP)
        </Link>
      )}
      {(user?.role.nama_role === 'pengadaan' || user?.role.nama_role === 'admin') && (
        <Link
          to="/pengadaan"
          className="inline-block bg-primary text-white rounded px-4 py-2 text-sm mb-6"
        >
          Kelola Pengadaan (Gabung PO &amp; Nomor IN)
        </Link>
      )}
      {(user?.role.nama_role === 'keuangan' || user?.role.nama_role === 'admin') && (
        <Link
          to="/keuangan"
          className="inline-block bg-primary text-white rounded px-4 py-2 text-sm mb-6"
        >
          Kelola Pembayaran PO
        </Link>
      )}
      {(user?.role.nama_role === 'operasi' || user?.role.nama_role === 'admin') && (
        <Link
          to="/operasi"
          className="inline-block bg-primary text-white rounded px-4 py-2 text-sm mb-6"
        >
          Input Data Operasi
        </Link>
      )}
      {(user?.role.nama_role === 'gudang' || user?.role.nama_role === 'admin') && (
        <Link
          to="/gudang"
          className="inline-block bg-primary text-white rounded px-4 py-2 text-sm mb-6"
        >
          Input Penerimaan Gudang
        </Link>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-primary-tint text-primary-dark text-left">
            <tr>
              <th className="px-4 py-2">ID Transaksi</th>
              <th className="px-4 py-2">Skema</th>
              <th className="px-4 py-2">Tanggal</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className="px-4 py-3 text-gray-400" colSpan={4}>
                  Memuat...
                </td>
              </tr>
            )}
            {!isLoading && transaksi?.length === 0 && (
              <tr>
                <td className="px-4 py-3 text-gray-400" colSpan={4}>
                  Tidak ada transaksi yang menunggu tindakan Anda.
                </td>
              </tr>
            )}
            {transaksi?.map((t) => (
              <tr key={t.id_transaksi} className="border-t border-border">
                <td className="px-4 py-2">{t.id_transaksi}</td>
                <td className="px-4 py-2">{t.skema}</td>
                <td className="px-4 py-2">{new Date(t.created_at).toLocaleDateString('id-ID')}</td>
                <td className="px-4 py-2 text-right">
                  <Link
                    to={`/transaksi/${encodeURIComponent(t.id_transaksi)}`}
                    className="text-primary font-medium"
                  >
                    Lihat
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
