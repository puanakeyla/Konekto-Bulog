import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import api from '../../lib/api'
import { formatDate, formatNumber } from '../../lib/poFormat'
import type { PoItem } from '../../hooks/usePoList'
import type { TransaksiListItem } from '../../hooks/useTransaksiList'
import TahapDialog from '../TahapDialog'

/**
 * PO "dipecah kembali ke baris transaksi asalnya" (Bagian 3.4). Dipakai bersama oleh langkah
 * SPP, Status Sergab, dan Pembayaran supaya ketiganya menunjukkan daftar yang sama persis:
 * siapa saja anggota PO ini, dan tiap barisnya bisa dibuka jadi pop-up progres 5 tahap --
 * dialog yang sama dengan yang dipakai saat memilih transaksi untuk digabung jadi PO.
 *
 * ID pemasok & tanggal bongkar diambil dari level PO, bukan per baris: keduanya adalah KUNCI
 * pengelompokan PO (PoGroupingService), jadi seluruh anggota dijamin bernilai sama.
 */
export default function PoTransaksiRows({ po }: { po: PoItem }) {
  const [dibuka, setDibuka] = useState<string | null>(null)

  // Detail hanya diambil saat sebuah baris diklik -- tidak ikut membebani daftar PO. Memakai
  // queryKey ['transaksi', id] yang sama dengan halaman detail, jadi cache-nya dipakai bersama.
  const { data: transaksiDibuka } = useQuery({
    queryKey: ['transaksi', dibuka],
    queryFn: async () => {
      const { data } = await api.get<{ data: TransaksiListItem }>(`/api/transaksi/${encodeURIComponent(dibuka!)}`)
      return data.data
    },
    enabled: !!dibuka,
  })

  return (
    <>
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
            {po.po_detail.map((detail) => (
              <tr
                key={detail.id}
                onClick={() => setDibuka(detail.transaksi_id)}
                title="Klik untuk melihat progres 5 tahap transaksi ini"
                className="cursor-pointer hover:bg-primary-tint/40"
              >
                <td className="font-semibold text-primary-dark">{detail.transaksi_id}</td>
                <td><span className="badge">{detail.skema ?? '-'}</span></td>
                <td>{po.id_pemasok}</td>
                <td>{po.tanggal_bongkar ? formatDate(po.tanggal_bongkar) : '-'}</td>
                <td>{detail.no_in ?? '-'}</td>
                <td className="text-right font-medium">{formatNumber(detail.kuantum_kontribusi)} kg</td>
              </tr>
            ))}
            {po.po_detail.length === 0 && (
              <tr><td colSpan={6} className="py-4 text-center text-muted">PO ini belum punya transaksi anggota.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <TahapDialog transaksi={dibuka ? transaksiDibuka ?? null : null} onClose={() => setDibuka(null)} />
    </>
  )
}
