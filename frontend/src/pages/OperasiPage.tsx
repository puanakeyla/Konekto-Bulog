import { useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem } from '../hooks/usePoList'
import ConfirmDialog from '../components/ConfirmDialog'
import { toast } from 'sonner'
import { apiErrorMessage } from '../lib/apiError'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'

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
  const [page, setPage] = useState(1)
  const { data: poResult, isLoading } = usePoList(page)
  const poList = poResult?.items ?? []
  const meta = poResult?.meta
  const menungguOperasi = poList.filter((po) => po.data_keuangan?.status_bayar === 'dibayarkan' && !po.data_operasi)
  const sudahOperasi = poList.filter((po) => !!po.data_operasi).length
  const totalKuantum = menungguOperasi.reduce((sum, po) => sum + Number(po.total_kuantum || 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Operasi — Input MO/TM"
        subtitle="Lengkapi data produksi setelah pembayaran PO dikonfirmasi Keuangan."
        badge="Role Operasi"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Menunggu operasi</div><div className="stat-value">{menungguOperasi.length}</div></div>
            <div className="stat-card"><div className="stat-label">Sudah operasi</div><div className="stat-value">{sudahOperasi}</div></div>
            <div className="stat-card"><div className="stat-label">Kuantum antrean</div><div className="stat-value">{formatNumber(totalKuantum)}</div></div>
            <div className="stat-card"><div className="stat-label">Total PO</div><div className="stat-value">{poResult?.meta.total ?? poList.length}</div></div>
          </div>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Siap Operasi</h2><p className="page-subtitle">Data ini tersambung ke POST /api/po/:id/operasi.</p></div>
              <span className="badge badge-warning">{menungguOperasi.length} antrean</span>
            </div>

            {isLoading && <SkeletonPoCards />}
            {!isLoading && menungguOperasi.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu data Operasi</div><p className="empty-copy">PO baru muncul setelah Keuangan menandai pembayaran sebagai dibayarkan.</p></div>
            )}

            <div className="space-y-4">{menungguOperasi.map((po) => <OperasiForm key={po.id} po={po} />)}</div>
            {meta && meta.last_page > 1 && <PaginationBar meta={meta} page={page} setPage={setPage} />}
          </section>
      </div>
    </div>
  )
}

function PaginationBar({ meta, page, setPage }: { meta: { current_page: number; last_page: number; total: number; from: number | null; to: number | null }; page: number; setPage: Dispatch<SetStateAction<number>> }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>Menampilkan {meta.from ?? 0}-{meta.to ?? 0} dari {meta.total} PO</span>
      <div className="flex gap-2">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</button>
        <span className="badge">Halaman {meta.current_page}/{meta.last_page}</span>
        <button className="btn btn-ghost" disabled={page >= meta.last_page} onClick={() => setPage((prev) => prev + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}

function OperasiForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(initialState)
  const [confirmOperasi, setConfirmOperasi] = useState(false)

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
    onSuccess: () => {
      setConfirmOperasi(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      toast.success(`Data Operasi PO ${po.no_po} tersimpan, diteruskan ke Gudang.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan data Operasi.')),
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((prev) => ({ ...prev, [key]: value }))
  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmOperasi(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - No. SPP {po.no_spp ?? '-'}</div></div>
        <span className="badge badge-success">Sudah dibayar</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}
      <div className="grid gap-4 @md:grid-cols-2">
        <Field label="No. MO"><input required className="input" value={form.no_mo} onChange={(e) => setField('no_mo', e.target.value)} /></Field>
        <Field label="No. TM"><input required className="input" value={form.no_tm} onChange={(e) => setField('no_tm', e.target.value)} /></Field>
        <Field label="HGL (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.hgl_persen} onChange={(e) => setField('hgl_persen', e.target.value)} /></Field>
        <Field label="Broken (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.broken_persen} onChange={(e) => setField('broken_persen', e.target.value)} /></Field>
        <Field label="Menir (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.menir_persen} onChange={(e) => setField('menir_persen', e.target.value)} /></Field>
        <Field label="Katul (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.katul_persen} onChange={(e) => setField('katul_persen', e.target.value)} /></Field>
        <Field label="Rendemen (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={form.rendemen_persen} onChange={(e) => setField('rendemen_persen', e.target.value)} /></Field>
      </div>
      <div className="mt-4 flex justify-end"><button type="submit" disabled={!form.no_mo || !form.no_tm || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Data Operasi'}</button></div>

      <ConfirmDialog
        open={confirmOperasi}
        title="Simpan data Operasi?"
        description={<>Data Operasi PO <strong>{po.no_po}</strong> akan disimpan dan PO diteruskan ke tahap <strong>Gudang</strong>. Data tidak dapat diubah lagi setelah disimpan. Lanjutkan?</>}
        confirmLabel="Simpan Data Operasi"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmOperasi(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
