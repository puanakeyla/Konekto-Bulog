import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem } from '../hooks/usePoList'

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function formatMoney(value: string | number) {
  return Number(value).toLocaleString('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 })
}

export default function KeuanganPage() {
  const { data: poList, isLoading } = usePoList()
  const belumDibayar = poList?.filter((po) => po.status === 'lengkap' && po.data_keuangan?.status_bayar !== 'dibayarkan') ?? []
  const sudahDibayar = poList?.filter((po) => po.data_keuangan?.status_bayar === 'dibayarkan').length ?? 0
  const totalTagihan = belumDibayar.reduce((sum, po) => sum + Number(po.total_harga || 0), 0)

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Keuangan - Pembayaran PO</h1>
            <p className="page-subtitle">Input No. SPP dan tanggal bayar untuk PO yang sudah lengkap nomor IN.</p>
          </div>
          <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
        </div>

        <div className="work-layout">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Menunggu bayar</div><div className="stat-value">{belumDibayar.length}</div></div>
            <div className="stat-card"><div className="stat-label">Sudah dibayar</div><div className="stat-value">{sudahDibayar}</div></div>
            <div className="stat-card"><div className="stat-label">Nilai antrean</div><div className="stat-value text-base leading-tight">{formatMoney(totalTagihan)}</div></div>
            <div className="stat-card"><div className="stat-label">Total PO</div><div className="stat-value">{poList?.length ?? 0}</div></div>
          </div>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Siap Dibayar</h2><p className="page-subtitle">Data ini tersambung ke PATCH /api/po/:id/pembayaran.</p></div>
              <span className="badge badge-warning">{belumDibayar.length} antrean</span>
            </div>

            {isLoading && <p className="text-sm text-gray-400">Memuat PO...</p>}
            {!isLoading && belumDibayar.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu pembayaran</div><p className="empty-copy">PO baru muncul setelah Pengadaan mengisi seluruh nomor IN.</p></div>
            )}

            <div className="space-y-4">{belumDibayar.map((po) => <PembayaranForm key={po.id} po={po} />)}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

function PembayaranForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [tanggalBayar, setTanggalBayar] = useState('')
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/po/${po.id}/pembayaran`, { status_bayar: 'dibayarkan', tanggal_bayar: tanggalBayar, no_spp: noSpp || undefined }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['po-list'] }),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">Belum dibayar</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="form-grid">
        <label className="block"><span className="label">No. SPP</span><input className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} placeholder="Nomor SPP" /></label>
        <label className="block"><span className="label">Tanggal Bayar</span><input required type="date" className="input" value={tanggalBayar} onChange={(e) => setTanggalBayar(e.target.value)} /></label>
      </div>
      <div className="mt-4 flex justify-end"><button type="submit" disabled={!tanggalBayar || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Tandai Dibayarkan'}</button></div>
    </form>
  )
}
