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
  tanggal_masuk: string
  nama_gudang: string
  realisasi_hgl: string
  no_tm: string
}

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function semuaOperasi(po: PoItem) {
  return po.po_detail.length > 0 && po.po_detail.every((d) => d.data_operasi?.status_out === 'disetujui' && d.data_operasi.no_out)
}

function belumSemuaGudang(po: PoItem) {
  return po.po_detail.some((d) => d.data_operasi && !d.data_operasi.data_gudang)
}

export default function GudangPage() {
  const [page, setPage] = useState(1)
  const { data: poResult, isLoading } = usePoList(page)
  const poList = poResult?.items ?? []
  const meta = poResult?.meta
  const menungguGudang = poList.filter((po) => semuaOperasi(po) && belumSemuaGudang(po))
  const sudahGudang = poList.filter((po) => semuaOperasi(po) && !belumSemuaGudang(po)).length
  const totalKuantum = menungguGudang.reduce((sum, po) => sum + Number(po.total_kuantum || 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Gudang — Penerimaan per IN"
        subtitle="Catat penerimaan hasil operasi ke gudang tiap nomor IN sampai alur PO selesai."
        badge="Role Gudang"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Menunggu gudang</div><div className="stat-value">{menungguGudang.length}</div></div>
            <div className="stat-card"><div className="stat-label">Sudah diterima</div><div className="stat-value">{sudahGudang}</div></div>
            <div className="stat-card"><div className="stat-label">Kuantum antrean</div><div className="stat-value">{formatNumber(totalKuantum)}</div></div>
            <div className="stat-card"><div className="stat-label">Total PO</div><div className="stat-value">{poResult?.meta.total ?? poList.length}</div></div>
          </div>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Siap Diterima Gudang</h2><p className="page-subtitle">Isi penerimaan per nomor IN. Tersambung ke POST /api/po/:id/gudang.</p></div>
              <span className="badge badge-warning">{menungguGudang.length} antrean</span>
            </div>

            {isLoading && <SkeletonPoCards />}
            {!isLoading && menungguGudang.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu penerimaan Gudang</div><p className="empty-copy">PO baru muncul setelah Pengadaan menyetujui nomor OUT seluruh IN.</p></div>
            )}

            <div className="space-y-4">{menungguGudang.map((po) => <GudangForm key={po.id} po={po} />)}</div>
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

function GudangForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Record<number, RowState>>(() =>
    Object.fromEntries(
      po.po_detail.map((d) => [d.id, { tanggal_masuk: '', nama_gudang: '', realisasi_hgl: '', no_tm: d.data_operasi?.no_tm ?? '' }]),
    ),
  )
  const [confirmGudang, setConfirmGudang] = useState(false)

  const setRowField = (id: number, key: keyof RowState, value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))

  const allValid = po.po_detail.every((d) => rows[d.id]?.tanggal_masuk && rows[d.id]?.nama_gudang.trim() && rows[d.id]?.no_tm.trim())

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/po/${po.id}/gudang`, {
        items: po.po_detail.map((d) => ({
          po_detail_id: d.id,
          tanggal_masuk: rows[d.id].tanggal_masuk,
          nama_gudang: rows[d.id].nama_gudang,
          realisasi_hgl: rows[d.id].realisasi_hgl.trim() !== '' ? Number(rows[d.id].realisasi_hgl) : undefined,
          no_tm: rows[d.id].no_tm,
        })),
      }),
    onSuccess: () => {
      setConfirmGudang(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      toast.success(`Penerimaan PO ${po.no_po} tercatat, alur transaksi selesai.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan penerimaan Gudang.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmGudang(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - {po.po_detail.length} IN</div></div>
        <span className="badge badge-success">Operasi selesai</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      {po.po_detail.map((d) => (
        <div key={d.id} className="mb-4 rounded-lg border border-border bg-surface p-3">
          <div className="section-title mb-3">IN {d.transaksi_id} — {formatNumber(d.kuantum_kontribusi)} kg — MO {d.data_operasi?.no_mo ?? '-'}</div>
          <div className="page-subtitle mb-3">No. OUT {d.data_operasi?.no_out ?? '-'}</div>
          <div className="grid gap-4 @md:grid-cols-2">
            <label className="block"><span className="label">Tanggal Masuk</span><input required type="date" className="input" value={rows[d.id].tanggal_masuk} onChange={(e) => setRowField(d.id, 'tanggal_masuk', e.target.value)} /></label>
            <label className="block"><span className="label">Nama Gudang</span><input required className="input" value={rows[d.id].nama_gudang} onChange={(e) => setRowField(d.id, 'nama_gudang', e.target.value)} placeholder="Contoh: Gudang Bulog Lampung" /></label>
            <label className="block"><span className="label">Realisasi HGL (kg)</span><input type="number" step="0.01" min="0" className="input" value={rows[d.id].realisasi_hgl} onChange={(e) => setRowField(d.id, 'realisasi_hgl', e.target.value)} /></label>
            <label className="block"><span className="label">No. TM</span><input required className="input" value={rows[d.id].no_tm} onChange={(e) => setRowField(d.id, 'no_tm', e.target.value)} /></label>
          </div>
        </div>
      ))}

      <div className="mt-4 flex justify-end"><button type="submit" disabled={!allValid || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Penerimaan'}</button></div>

      <ConfirmDialog
        open={confirmGudang}
        title="Simpan penerimaan gudang?"
        description={<>Penerimaan <strong>{po.po_detail.length} IN</strong> pada PO <strong>{po.no_po}</strong> akan dicatat dan alur transaksi ditandai <strong>selesai</strong>. Data tidak dapat diubah lagi setelah disimpan. Lanjutkan?</>}
        confirmLabel="Simpan Penerimaan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmGudang(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
