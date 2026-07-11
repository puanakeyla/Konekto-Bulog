import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useTransaksiList, type TransaksiListItem } from '../hooks/useTransaksiList'
import { usePoList, type PoItem } from '../hooks/usePoList'

function groupKeyOf(t: TransaksiListItem) {
  if (t.data_makloon_mpp) {
    return {
      id_pemasok: t.data_makloon_mpp.id_pemasok,
      tanggal_bongkar: t.data_makloon_mpp.tanggal_bongkar,
      kuantum: t.data_makloon_mpp.kuantum,
    }
  }
  if (t.data_makloon_tjp && t.data_jemput_pangan) {
    return {
      id_pemasok: t.data_jemput_pangan.id_pemasok,
      tanggal_bongkar: t.data_makloon_tjp.tanggal_bongkar,
      kuantum: t.data_makloon_tjp.kuantum_bongkar,
    }
  }
  return { id_pemasok: '-', tanggal_bongkar: '-', kuantum: '-' }
}

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function formatMoney(value: string | number) {
  return Number(value).toLocaleString('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  })
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString('id-ID')
}

export default function PengadaanPage() {
  const { data: transaksiList, isLoading: loadingTransaksi } = useTransaksiList()
  const { data: poList, isLoading: loadingPo } = usePoList()
  const queryClient = useQueryClient()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [noPo, setNoPo] = useState('')
  const [harga, setHarga] = useState('')

  const selectedRows = useMemo(
    () => (transaksiList ?? []).filter((item) => selected.has(item.id_transaksi)),
    [selected, transaksiList],
  )
  const poBelumLengkap = poList?.filter((po) => po.status === 'proses') ?? []
  const totalSelectedKuantum = selectedRows.reduce((sum, item) => sum + Number(groupKeyOf(item).kuantum || 0), 0)
  const detailBelumIn = poBelumLengkap.reduce(
    (sum, po) => sum + po.po_detail.filter((detail) => !detail.no_in).length,
    0,
  )

  const gabungMutation = useMutation({
    mutationFn: () =>
      api.post('/api/pengadaan/gabungkan-po', {
        transaksi_ids: Array.from(selected),
        no_po: noPo,
        harga: harga ? Number(harga) : undefined,
      }),
    onSuccess: () => {
      setSelected(new Set())
      setNoPo('')
      setHarga('')
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
    },
  })

  const errorMessage =
    (gabungMutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Pengadaan</h1>
            <p className="page-subtitle">Gabungkan transaksi Makloon menjadi PO, lalu isi nomor IN per transaksi asal.</p>
          </div>
          <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
        </div>

        <div className="work-layout">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Transaksi siap PO</div><div className="stat-value">{transaksiList?.length ?? 0}</div></div>
            <div className="stat-card"><div className="stat-label">Dipilih</div><div className="stat-value">{selected.size}</div></div>
            <div className="stat-card"><div className="stat-label">PO proses</div><div className="stat-value">{poBelumLengkap.length}</div></div>
            <div className="stat-card"><div className="stat-label">Nomor IN kosong</div><div className="stat-value">{detailBelumIn}</div></div>
          </div>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div>
                <h2 className="section-title">Gabungkan Transaksi Menjadi PO</h2>
                <p className="page-subtitle">Pilih transaksi dengan pemasok, tanggal bongkar, dan makloon yang sama.</p>
              </div>
              <span className="badge">Total dipilih: {formatNumber(totalSelectedKuantum)} kg</span>
            </div>

            {errorMessage && <div className="alert-danger mb-4">{errorMessage}</div>}
            {loadingTransaksi && <p className="text-sm text-gray-400">Memuat transaksi...</p>}
            {!loadingTransaksi && transaksiList?.length === 0 && (
              <div className="empty-state">
                <div className="empty-title">Belum ada transaksi siap digabung</div>
                <p className="empty-copy">Transaksi akan muncul setelah tahap Makloon dan UB Jastasma diterima.</p>
              </div>
            )}

            {transaksiList && transaksiList.length > 0 && (
              <>
                <div className="data-table-wrap mb-4">
                  <table className="data-table">
                    <thead><tr><th className="w-10"></th><th>ID Transaksi</th><th>Skema</th><th>ID Pemasok</th><th>Tanggal Bongkar</th><th className="text-right">Kuantum</th></tr></thead>
                    <tbody>
                      {transaksiList.map((t) => {
                        const key = groupKeyOf(t)
                        return (
                          <tr key={t.id_transaksi}>
                            <td><input type="checkbox" checked={selected.has(t.id_transaksi)} onChange={() => toggle(t.id_transaksi)} aria-label={`Pilih ${t.id_transaksi}`} /></td>
                            <td className="font-semibold text-primary-dark">{t.id_transaksi}</td>
                            <td><span className="badge">{t.skema}</span></td>
                            <td>{key.id_pemasok}</td>
                            <td>{key.tanggal_bongkar === '-' ? '-' : formatDate(key.tanggal_bongkar)}</td>
                            <td className="text-right font-medium">{formatNumber(key.kuantum)} kg</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>

                <form className="form-grid" onSubmit={(e) => { e.preventDefault(); gabungMutation.mutate() }}>
                  <label className="block"><span className="label">No. PO</span><input required className="input" value={noPo} onChange={(e) => setNoPo(e.target.value)} placeholder="Contoh: PO-0001/VII/2026" /></label>
                  <label className="block"><span className="label">Harga per kg</span><input type="number" step="0.01" min="0" className="input" value={harga} onChange={(e) => setHarga(e.target.value)} placeholder="Default 6500" /></label>
                  <div className="form-grid-full flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xs text-muted">Tersambung ke POST /api/pengadaan/gabungkan-po</p>
                    <button type="submit" disabled={selected.size === 0 || !noPo || gabungMutation.isPending} className="btn btn-primary">
                      {gabungMutation.isPending ? 'Menggabungkan...' : `Buat PO dari ${selected.size} transaksi`}
                    </button>
                  </div>
                </form>
              </>
            )}
          </section>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Proses - Isi Nomor IN</h2><p className="page-subtitle">Setelah seluruh nomor IN terisi, PO masuk ke antrean Keuangan.</p></div>
              <span className="badge badge-warning">{poBelumLengkap.length} PO proses</span>
            </div>

            {loadingPo && <p className="text-sm text-gray-400">Memuat PO...</p>}
            {!loadingPo && poBelumLengkap.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu nomor IN</div><p className="empty-copy">PO yang sudah lengkap otomatis lanjut ke antrean Keuangan.</p></div>
            )}

            <div className="space-y-4">{poBelumLengkap.map((po) => <PoInForm key={po.id} po={po} />)}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

function PoInForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<number, string>>({})

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/in`, {
        items: Object.entries(values)
          .filter(([, no_in]) => no_in.trim() !== '')
          .map(([po_detail_id, no_in]) => ({ po_detail_id: Number(po_detail_id), no_in })),
      }),
    onSuccess: () => {
      setValues({})
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
    },
  })

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const isiCount = Object.values(values).filter((v) => v.trim() !== '').length
  const lengkapCount = po.po_detail.filter((d) => d.no_in).length

  return (
    <form className="po-card" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {formatMoney(po.total_harga)}</div></div>
        <span className="badge badge-warning">{lengkapCount}/{po.po_detail.length} IN terisi</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="data-table-wrap mb-3">
        <table className="data-table">
          <thead><tr><th>ID Transaksi</th><th className="text-right">Kuantum</th><th>Nomor IN</th></tr></thead>
          <tbody>
            {po.po_detail.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold text-primary-dark">{d.transaksi_id}</td>
                <td className="text-right">{formatNumber(d.kuantum_kontribusi)} kg</td>
                <td><input className="input" placeholder={d.no_in ?? 'Masukkan nomor IN'} disabled={!!d.no_in} value={values[d.id] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [d.id]: e.target.value }))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end"><button type="submit" disabled={isiCount === 0 || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Nomor IN'}</button></div>
    </form>
  )
}
