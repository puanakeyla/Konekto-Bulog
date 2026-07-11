import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem } from '../hooks/usePoList'

type FormState = {
  no_mo: string
  no_tm: string
  hgl_persen: string
  broken_persen: string
  menir_persen: string
  katul_persen: string
  rendemen_persen: string
}

const initialState: FormState = {
  no_mo: '',
  no_tm: '',
  hgl_persen: '',
  broken_persen: '',
  menir_persen: '',
  katul_persen: '',
  rendemen_persen: '',
}

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

export default function OperasiPage() {
  const { data: poList, isLoading } = usePoList()
  const menungguOperasi = poList?.filter((po) => po.data_keuangan?.status_bayar === 'dibayarkan' && !po.data_operasi) ?? []
  const sudahOperasi = poList?.filter((po) => !!po.data_operasi).length ?? 0
  const totalKuantum = menungguOperasi.reduce((sum, po) => sum + Number(po.total_kuantum || 0), 0)

  return (
    <div className="page-shell">
      <div className="page-container">
        <div className="page-header">
          <div>
            <h1 className="page-title">Operasi - Input MO/TM</h1>
            <p className="page-subtitle">Lengkapi data produksi setelah pembayaran PO dikonfirmasi Keuangan.</p>
          </div>
          <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
        </div>

        <div className="work-layout">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Menunggu operasi</div><div className="stat-value">{menungguOperasi.length}</div></div>
            <div className="stat-card"><div className="stat-label">Sudah operasi</div><div className="stat-value">{sudahOperasi}</div></div>
            <div className="stat-card"><div className="stat-label">Kuantum antrean</div><div className="stat-value">{formatNumber(totalKuantum)}</div></div>
            <div className="stat-card"><div className="stat-label">Total PO</div><div className="stat-value">{poList?.length ?? 0}</div></div>
          </div>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Siap Operasi</h2><p className="page-subtitle">Data ini tersambung ke POST /api/po/:id/operasi.</p></div>
              <span className="badge badge-warning">{menungguOperasi.length} antrean</span>
            </div>

            {isLoading && <p className="text-sm text-gray-400">Memuat PO...</p>}
            {!isLoading && menungguOperasi.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu data Operasi</div><p className="empty-copy">PO baru muncul setelah Keuangan menandai pembayaran sebagai dibayarkan.</p></div>
            )}

            <div className="space-y-4">{menungguOperasi.map((po) => <OperasiForm key={po.id} po={po} />)}</div>
          </section>
        </div>
      </div>
    </div>
  )
}

function OperasiForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(initialState)

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/po/${po.id}/operasi`, {
        no_mo: form.no_mo,
        no_tm: form.no_tm,
        hgl_persen: form.hgl_persen ? Number(form.hgl_persen) : undefined,
        broken_persen: form.broken_persen ? Number(form.broken_persen) : undefined,
        menir_persen: form.menir_persen ? Number(form.menir_persen) : undefined,
        katul_persen: form.katul_persen ? Number(form.katul_persen) : undefined,
        rendemen_persen: form.rendemen_persen ? Number(form.rendemen_persen) : undefined,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['po-list'] }),
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card" onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - No. SPP {po.no_spp ?? '-'}</div></div>
        <span className="badge badge-success">Sudah dibayar</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="form-grid">
        <Field label="No. MO"><input required className="input" value={form.no_mo} onChange={(e) => setField('no_mo', e.target.value)} /></Field>
        <Field label="No. TM"><input required className="input" value={form.no_tm} onChange={(e) => setField('no_tm', e.target.value)} /></Field>
        <Field label="HGL (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.hgl_persen} onChange={(e) => setField('hgl_persen', e.target.value)} /></Field>
        <Field label="Broken (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.broken_persen} onChange={(e) => setField('broken_persen', e.target.value)} /></Field>
        <Field label="Menir (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.menir_persen} onChange={(e) => setField('menir_persen', e.target.value)} /></Field>
        <Field label="Katul (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.katul_persen} onChange={(e) => setField('katul_persen', e.target.value)} /></Field>
        <Field label="Rendemen (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.rendemen_persen} onChange={(e) => setField('rendemen_persen', e.target.value)} /></Field>
      </div>
      <div className="mt-4 flex justify-end"><button type="submit" disabled={!form.no_mo || !form.no_tm || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Data Operasi'}</button></div>
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
