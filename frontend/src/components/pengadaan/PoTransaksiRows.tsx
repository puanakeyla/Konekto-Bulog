import { Link, useNavigate } from 'react-router-dom'
import { formatDate, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'

/**
 * PO "dipecah kembali ke baris transaksi asalnya" (Bagian 3.4). Dipakai bersama oleh langkah
 * SPP, Status Sergab, dan Pembayaran supaya ketiganya menunjukkan daftar yang sama persis:
 * siapa saja anggota PO ini, dan tiap barisnya bisa dibuka ke timeline transaksinya.
 *
 * ID pemasok & tanggal bongkar diambil dari level PO, bukan per baris -- keduanya adalah KUNCI
 * pengelompokan PO (PoGroupingService), jadi seluruh anggota dijamin bernilai sama.
 */
export default function PoTransaksiRows({ po }: { po: PoItem }) {
  const navigate = useNavigate()

  return (
    <div className="data-table-wrap mb-4">
      <table className="data-table">
        <thead>
          <tr>
            <th>ID Transaksi</th>
            <th>Skema</th>
            <th>ID Pemasok</th>
            <th>Tanggal Bongkar</th>
            <th>Nomor IN</th>
            <th className="text-right">Kuantum</th>
          </tr>
        </thead>
        <tbody>
          {po.po_detail.map((detail) => {
            const href = `/transaksi/${encodeURIComponent(detail.transaksi_id)}`
            return (
              <tr
                key={detail.id}
                onClick={() => navigate(href)}
                title="Klik untuk membuka detail transaksi ini"
                className="cursor-pointer hover:bg-primary-tint/40"
              >
                {/* Link asli, bukan cuma onClick baris: baris tetap bisa dibuka lewat keyboard. */}
                <td className="font-semibold text-primary-dark">
                  <Link to={href} onClick={(e) => e.stopPropagation()} className="hover:underline">{detail.transaksi_id}</Link>
                </td>
                <td><span className="badge">{detail.skema ?? '-'}</span></td>
                <td>{po.id_pemasok}</td>
                <td>{po.tanggal_bongkar ? formatDate(po.tanggal_bongkar) : '-'}</td>
                <td>{detail.no_in ?? '-'}</td>
                <td className="text-right font-medium">{formatNumber(detail.kuantum_kontribusi)} kg</td>
              </tr>
            )
          })}
          {po.po_detail.length === 0 && (
            <tr><td colSpan={6} className="py-4 text-center text-muted">PO ini belum punya transaksi anggota.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
