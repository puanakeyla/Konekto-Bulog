import { formatMoney, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import PoReviewActions from './PoReviewActions'
import PoTransaksiRows from './PoTransaksiRows'

// Ringkasan PO read-only + aksi review (Terima & Lanjutkan / Tolak). Dipakai halaman Keuangan
// dan panel inline di timeline saat tahap peninjau perlu memutuskan menerima/menolak data PO
// dari tahap sebelumnya (mis. Keuangan meninjau data Pengadaan).
//
// Barisnya memakai PoTransaksiRows yang sama dengan langkah SPP/Sergab/Pembayaran: peninjau harus
// bisa membuka tiap transaksi anggota (sampai tahap Pengadaan) sebelum memutuskan menerima atau
// menolak -- tanpa itu keputusannya diambil hanya dari agregat level PO.
export default function PoReviewCard({ po, reviewLabel, onChanged }: { po: PoItem; reviewLabel: string; onChanged?: () => void }) {
  return (
    <div className="po-card @container">
      <div className="po-card-header">
        <div>
          <div className="po-title">{po.no_po}</div>
          <div className="po-meta">No. SPP {po.no_spp ?? '-'}</div>
          <div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div>
        </div>
        <span className="badge badge-warning">Menunggu review</span>
      </div>
      <p className="mb-2 text-xs text-muted">Klik satu baris untuk melihat progres transaksinya sebelum memutuskan.</p>
      <PoTransaksiRows po={po} />
      <PoReviewActions po={po} reviewLabel={reviewLabel} onChanged={onChanged} />
    </div>
  )
}
