import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import PoReviewActions from './PoReviewActions'

// Ringkasan PO read-only + aksi review (Terima & Lanjutkan / Tolak). Dipakai halaman Keuangan
// dan panel inline di timeline saat tahap peninjau perlu memutuskan menerima/menolak data PO
// dari tahap sebelumnya (mis. Keuangan meninjau data Pengadaan).
export default function PoReviewCard({ po, reviewLabel, onChanged }: { po: PoItem; reviewLabel: string; onChanged?: () => void }) {
  return (
    <div className="po-card @container">
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">Menunggu review</span>
      </div>
      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>ID Transaksi</th><th className="text-right">Kuantum</th><th>Nomor IN</th></tr></thead>
          <tbody>
            {po.po_detail.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold text-primary-dark">{d.transaksi_id}</td>
                <td className="text-right">{formatNumber(d.kuantum_kontribusi)} kg</td>
                <td>{d.no_in ?? '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <PoReviewActions po={po} reviewLabel={reviewLabel} onChanged={onChanged} />
    </div>
  )
}
