import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem } from '../hooks/usePoList'

type FormState = {
  tanggal_masuk: string
  nama_gudang: string
  realisasi_hgl: string
  no_tm: string
}

const initialState: FormState = {
  tanggal_masuk: '',
  nama_gudang: '',
  realisasi_hgl: '',
  no_tm: '',
}

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

export default function GudangPage() {
  const { data: poList, isLoading } = usePoList()
  const menungguGudang = poList?.filter((po) => po.data_operasi && !po.data_operasi.data_gudang) ?? []
  const sudahGudang = poList?.filter((po) => !!po.data_operasi?.data_gudang).length ?? 0
  const totalKuantum = menungguGudang.reduce((sum, po) => sum + Number(po.total_kuantum || 0), 0)

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Gudang - Penerimaan</h1>
            <p className="page-subtitle">Catat penerimaan hasil operasi ke gudang sampai alur PO selesai.</p>
          </div>
          <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
        </div>

        <div className="work-layout">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Menunggu gudang</div><div className="stat-value">{menungguGudang.length}</div></div>
            <div className="stat-card"><div className="stat-label">Sudah diterima</div><div className="stat-value">{sudahGudang}</div></div>
            <div className="stat-card"><div className="stat-label">Kuantum antrean</div><div className="stat-value">{formatNumber(totalKuantum)}</div></div>
            <div className="stat-card"><div className="stat-label">Total PO</div><div className="stat-value">{poList?.length ?? 0}</div></div>
          </div>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Siap Diterima Gudang</h2><p className="page-subtitle">Data ini tersambung ke POST /api/operasi/:id/gudang.</p></div>
              <span className="badge badge-warning">{menungguGudang.length} antrean</span>
            </div>

            {isLoading && <p className="text-sm text-gray-400">Memuat PO...</p>}
            {!isLoading && menungguGudang.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu penerimaan Gudang</div><p className="empty-copy">PO baru muncul setelah Operasi menyimpan data MO/TM.</p></div>
            )}

            <div className="space-y-4">{menungguGudang.map((po) => <GudangForm key={po.id} po={po} />)}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

function GudangForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>({ ...initialState, no_tm: po.data_operasi?.no_tm ?? '' })

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/operasi/${po.data_operasi!.id}/gudang`, {
        tanggal_masuk: form.tanggal_masuk,
        nama_gudang: form.nama_gudang,
        realisasi_hgl: form.realisasi_hgl ? Number(form.realisasi_hgl) : undefined,
        no_tm: form.no_tm,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['po-list'] }),
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - MO {po.data_operasi?.no_mo} - TM {po.data_operasi?.no_tm}</div></div>
        <span className="badge badge-success">Operasi selesai</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="form-grid">
        <label className="block"><span className="label">Tanggal Masuk</span><input required type="date" className="input" value={form.tanggal_masuk} onChange={(e) => setField('tanggal_masuk', e.target.value)} /></label>
        <label className="block"><span className="label">Nama Gudang</span><input required className="input" value={form.nama_gudang} onChange={(e) => setField('nama_gudang', e.target.value)} placeholder="Contoh: Gudang Bulog Lampung" /></label>
        <label className="block"><span className="label">Realisasi HGL (%)</span><input type="number" step="0.01" min="0" className="input" value={form.realisasi_hgl} onChange={(e) => setField('realisasi_hgl', e.target.value)} /></label>
        <label className="block"><span className="label">No. TM</span><input required className="input" value={form.no_tm} onChange={(e) => setField('no_tm', e.target.value)} /></label>
      </div>
      <div className="mt-4 flex justify-end"><button type="submit" disabled={!form.tanggal_masuk || !form.nama_gudang || !form.no_tm || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Penerimaan'}</button></div>
    </form>
  )
}
