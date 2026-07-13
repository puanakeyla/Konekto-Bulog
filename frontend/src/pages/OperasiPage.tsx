import { useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem } from '../hooks/usePoList'
import ConfirmDialog from '../components/ConfirmDialog'
import { toast } from 'sonner'
import { apiErrorMessage } from '../lib/apiError'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'

type RowState = {
  no_mo: string
  no_tm: string
  hgl_kg: string
  broken_kg: string
  menir_kg: string
  katul_kg: string
  rendemen_persen: string
}

const emptyRow: RowState = { no_mo: '', no_tm: '', hgl_kg: '', broken_kg: '', menir_kg: '', katul_kg: '', rendemen_persen: '' }

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function belumSemuaOperasi(po: PoItem) {
  return po.po_detail.some((d) => !d.data_operasi)
}

export default function OperasiPage() {
  const [page, setPage] = useState(1)
  const { data: poResult, isLoading } = usePoList(page)
  const poList = poResult?.items ?? []
  const meta = poResult?.meta
  const menungguOperasi = poList.filter((po) => po.data_keuangan?.status_bayar === 'dibayarkan' && belumSemuaOperasi(po))
  const sudahOperasi = poList.filter((po) => po.po_detail.length > 0 && !belumSemuaOperasi(po)).length
  const totalKuantum = menungguOperasi.reduce((sum, po) => sum + Number(po.total_kuantum || 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Operasi — Input MO/TM per IN"
        subtitle="Lengkapi data produksi tiap nomor IN setelah pembayaran PO dikonfirmasi Keuangan."
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
              <div><h2 className="section-title">PO Siap Operasi</h2><p className="page-subtitle">Isi data Operasi per nomor IN. Tersambung ke POST /api/po/:id/operasi.</p></div>
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
  const [rows, setRows] = useState<Record<number, RowState>>(() =>
    Object.fromEntries(po.po_detail.map((d) => [d.id, { ...emptyRow }])),
  )
  const [confirmOperasi, setConfirmOperasi] = useState(false)

  const setRowField = (id: number, key: keyof RowState, value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))

  const allValid = po.po_detail.every((d) => rows[d.id]?.no_mo.trim() && rows[d.id]?.no_tm.trim())

  const num = (v: string) => (v.trim() !== '' ? Number(v) : undefined)

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/po/${po.id}/operasi`, {
        items: po.po_detail.map((d) => ({
          po_detail_id: d.id,
          no_mo: rows[d.id].no_mo,
          no_tm: rows[d.id].no_tm,
          hgl_kg: num(rows[d.id].hgl_kg),
          broken_kg: num(rows[d.id].broken_kg),
          menir_kg: num(rows[d.id].menir_kg),
          katul_kg: num(rows[d.id].katul_kg),
          rendemen_persen: num(rows[d.id].rendemen_persen),
        })),
      }),
    onSuccess: () => {
      setConfirmOperasi(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      toast.success(`Data Operasi PO ${po.no_po} tersimpan, diteruskan ke Gudang.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan data Operasi.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmOperasi(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - No. SPP {po.no_spp ?? '-'}</div></div>
        <span className="badge badge-success">Sudah dibayar</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      {po.po_detail.map((d) => (
        <div key={d.id} className="mb-4 rounded-lg border border-border bg-surface p-3">
          <div className="section-title mb-3">IN {d.transaksi_id} — {formatNumber(d.kuantum_kontribusi)} kg{d.no_in ? ` — No. IN ${d.no_in}` : ''}</div>
          <div className="grid gap-4 @md:grid-cols-2">
            <Field label="No. MO"><input required className="input" value={rows[d.id].no_mo} onChange={(e) => setRowField(d.id, 'no_mo', e.target.value)} /></Field>
            <Field label="No. TM"><input required className="input" value={rows[d.id].no_tm} onChange={(e) => setRowField(d.id, 'no_tm', e.target.value)} /></Field>
            <Field label="HGL (kg)"><input type="number" step="0.01" min="0" className="input" value={rows[d.id].hgl_kg} onChange={(e) => setRowField(d.id, 'hgl_kg', e.target.value)} /></Field>
            <Field label="Broken (kg)"><input type="number" step="0.01" min="0" className="input" value={rows[d.id].broken_kg} onChange={(e) => setRowField(d.id, 'broken_kg', e.target.value)} /></Field>
            <Field label="Menir (kg)"><input type="number" step="0.01" min="0" className="input" value={rows[d.id].menir_kg} onChange={(e) => setRowField(d.id, 'menir_kg', e.target.value)} /></Field>
            <Field label="Katul (kg)"><input type="number" step="0.01" min="0" className="input" value={rows[d.id].katul_kg} onChange={(e) => setRowField(d.id, 'katul_kg', e.target.value)} /></Field>
            <Field label="Rendemen (%)"><input type="number" step="0.01" min="0" max="100" className="input" value={rows[d.id].rendemen_persen} onChange={(e) => setRowField(d.id, 'rendemen_persen', e.target.value)} /></Field>
          </div>
        </div>
      ))}

      <div className="mt-4 flex justify-end"><button type="submit" disabled={!allValid || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Data Operasi'}</button></div>

      <ConfirmDialog
        open={confirmOperasi}
        title="Simpan data Operasi?"
        description={<>Data Operasi untuk <strong>{po.po_detail.length} IN</strong> pada PO <strong>{po.no_po}</strong> akan disimpan dan PO diteruskan ke tahap <strong>Gudang</strong>. Data tidak dapat diubah lagi setelah disimpan. Lanjutkan?</>}
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
