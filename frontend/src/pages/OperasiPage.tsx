import { useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem, type PoDetailItem } from '../hooks/usePoList'
import ConfirmDialog from '../components/ConfirmDialog'
import { toast } from 'sonner'
import { apiErrorMessage } from '../lib/apiError'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'

function formatNumber(value: string | number) {
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

// Status per IN (po_detail) diturunkan dari status_out data_operasi:
//   belum ada / dikembalikan -> perlu ( re)ajukan permintaan
//   menunggu_pengadaan       -> menunggu keputusan Pengadaan
//   dikeluarkan + belum no_mo -> No. OUT keluar, tinggal isi hasil produksi
const inPerluRequest = (d: PoDetailItem) => !d.data_operasi || d.data_operasi.status_out === 'dikembalikan'
const inMenunggu = (d: PoDetailItem) => d.data_operasi?.status_out === 'menunggu_pengadaan'
const inPerluHasil = (d: PoDetailItem) => d.data_operasi?.status_out === 'dikeluarkan' && !d.data_operasi.no_mo

const poDibayar = (po: PoItem) => po.data_keuangan?.status_bayar === 'dibayarkan'
const poPerluRequest = (po: PoItem) => poDibayar(po) && po.po_detail.some(inPerluRequest)
const poMenunggu = (po: PoItem) => po.po_detail.some(inMenunggu)
const poPerluHasil = (po: PoItem) => po.po_detail.some(inPerluHasil)

export default function OperasiPage() {
  const [page, setPage] = useState(1)
  const { data: poResult, isLoading } = usePoList(page)
  const poList = poResult?.items ?? []
  const meta = poResult?.meta

  const perluRequest = poList.filter(poPerluRequest)
  const menunggu = poList.filter(poMenunggu)
  const perluHasil = poList.filter(poPerluHasil)
  const totalGabah = perluRequest.reduce(
    (sum, po) => sum + po.po_detail.filter(inPerluRequest).reduce((a, d) => a + Number(d.kuantum_kontribusi || 0), 0),
    0,
  )

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        title="Operasi — Pengeluaran & Produksi"
        subtitle="Ajukan permintaan pengeluaran stok ke Pengadaan, lalu isi hasil produksi setelah nomor OUT keluar."
        badge="Role Operasi"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Perlu permintaan</div><div className="stat-value">{perluRequest.length}</div></div>
          <div className="stat-card"><div className="stat-label">Menunggu Pengadaan</div><div className="stat-value">{menunggu.length}</div></div>
          <div className="stat-card"><div className="stat-label">Perlu isi hasil</div><div className="stat-value">{perluHasil.length}</div></div>
          <div className="stat-card"><div className="stat-label">Kuantum antre (kg)</div><div className="stat-value">{formatNumber(totalGabah)}</div></div>
        </div>

        {/* 1. Permintaan pengeluaran stok */}
        <section className="panel panel-pad">
          <Toolbar title="Permintaan Pengeluaran Stok" desc="Ajukan jumlah gabah yang ingin diolah per IN ke Pengadaan." badge={`${perluRequest.length} PO`} />
          {isLoading && <SkeletonPoCards />}
          {!isLoading && perluRequest.length === 0 && (
            <Empty title="Tidak ada PO yang perlu permintaan" copy="PO muncul setelah Keuangan menandai pembayaran sebagai dibayarkan." />
          )}
          <div className="space-y-4">{perluRequest.map((po) => <RequestForm key={po.id} po={po} />)}</div>
          {meta && meta.last_page > 1 && <PaginationBar meta={meta} page={page} setPage={setPage} />}
        </section>

        {/* 2. Isi hasil produksi (setelah OUT keluar) */}
        <section className="panel panel-pad">
          <Toolbar title="Isi Hasil Produksi" desc="Nomor OUT sudah keluar — isi No. MO/TM dan hasil giling per IN." badge={`${perluHasil.length} PO`} />
          {!isLoading && perluHasil.length === 0 && (
            <Empty title="Belum ada nomor OUT yang perlu diproses" copy="Hasil produksi bisa diisi setelah Pengadaan mengeluarkan nomor OUT." />
          )}
          <div className="space-y-4">{perluHasil.map((po) => <HasilForm key={po.id} po={po} />)}</div>
        </section>

        {/* 3. Menunggu keputusan Pengadaan */}
        <section className="panel panel-pad">
          <Toolbar title="Menunggu Keputusan Pengadaan" desc="Permintaan terkirim, menunggu dikeluarkan atau dikembalikan." badge={`${menunggu.length} PO`} />
          {!isLoading && menunggu.length === 0 && (
            <Empty title="Tidak ada permintaan menunggu" copy="Permintaan yang dikirim akan tampil di sini sampai Pengadaan memutuskan." />
          )}
          <div className="space-y-4">{menunggu.map((po) => <MenungguCard key={po.id} po={po} />)}</div>
        </section>
      </div>
    </div>
  )
}

function Toolbar({ title, desc, badge }: { title: string; desc: string; badge: string }) {
  return (
    <div className="toolbar-card mb-4">
      <div><h2 className="section-title">{title}</h2><p className="page-subtitle">{desc}</p></div>
      <span className="badge badge-warning">{badge}</span>
    </div>
  )
}

function Empty({ title, copy }: { title: string; copy: string }) {
  return <div className="empty-state"><div className="empty-title">{title}</div><p className="empty-copy">{copy}</p></div>
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

function PoHeader({ po, right }: { po: PoItem; right: React.ReactNode }) {
  return (
    <div className="po-card-header">
      <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - No. SPP {po.no_spp ?? '-'}</div></div>
      {right}
    </div>
  )
}

// --- 1. Form permintaan pengeluaran stok (gabah diolah) ---
function RequestForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const details = po.po_detail.filter(inPerluRequest)
  const [values, setValues] = useState<Record<number, string>>(() =>
    Object.fromEntries(details.map((d) => [d.id, d.kuantum_kontribusi ?? ''])),
  )
  const [confirm, setConfirm] = useState(false)

  const allValid = details.every((d) => values[d.id]?.trim() && Number(values[d.id]) > 0)

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/po/${po.id}/operasi`, {
        items: details.map((d) => ({ po_detail_id: d.id, gabah_diolah_kg: Number(values[d.id]) })),
      }),
    onSuccess: () => {
      setConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      toast.success(`Permintaan pengeluaran stok PO ${po.no_po} dikirim ke Pengadaan.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal mengirim permintaan Operasi.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirm(true) }}>
      <PoHeader po={po} right={<span className="badge badge-success">Sudah dibayar</span>} />
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      {details.map((d) => (
        <div key={d.id} className="mb-4 rounded-lg border border-border bg-surface p-3">
          <div className="section-title mb-3">IN {d.transaksi_id} — {formatNumber(d.kuantum_kontribusi)} kg{d.no_in ? ` — No. IN ${d.no_in}` : ''}</div>
          {d.data_operasi?.status_out === 'dikembalikan' && d.data_operasi.catatan_pengembalian && (
            <div className="alert-warning mb-3">Dikembalikan Pengadaan: {d.data_operasi.catatan_pengembalian}. Perbaiki jumlah lalu ajukan lagi.</div>
          )}
          <div className="grid gap-4 @md:grid-cols-2">
            <Field label="Gabah diolah (kg)">
              <input required type="number" step="0.01" min="0" className="input" value={values[d.id] ?? ''} onChange={(e) => setValues((prev) => ({ ...prev, [d.id]: e.target.value }))} />
            </Field>
          </div>
        </div>
      ))}

      <div className="mt-4 flex justify-end"><button type="submit" disabled={!allValid || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Mengirim...' : 'Kirim Permintaan OUT'}</button></div>

      <ConfirmDialog
        open={confirm}
        title="Kirim permintaan pengeluaran stok?"
        description={<>Permintaan untuk <strong>{details.length} IN</strong> pada PO <strong>{po.no_po}</strong> akan dikirim ke <strong>Pengadaan</strong> untuk diputuskan dikeluarkan atau dikembalikan. Lanjutkan?</>}
        confirmLabel="Kirim Permintaan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirm(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}

// --- 2. Form isi hasil produksi (setelah OUT keluar) ---
type HasilRow = { no_mo: string; no_tm: string; hgl_kg: string; broken_kg: string; menir_kg: string; katul_kg: string }
const emptyHasil: HasilRow = { no_mo: '', no_tm: '', hgl_kg: '', broken_kg: '', menir_kg: '', katul_kg: '' }

function rendemenOf(hgl: string, gabah: string | null) {
  const h = Number(hgl)
  const g = Number(gabah)
  if (!hgl.trim() || !g) return ''
  return (h / g * 100).toFixed(2)
}

function HasilForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const details = po.po_detail.filter(inPerluHasil)
  const [rows, setRows] = useState<Record<number, HasilRow>>(() => Object.fromEntries(details.map((d) => [d.id, { ...emptyHasil }])))
  const [confirm, setConfirm] = useState(false)

  const setField = (id: number, key: keyof HasilRow, value: string) =>
    setRows((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))

  const allValid = details.every((d) => rows[d.id]?.no_mo.trim() && rows[d.id]?.no_tm.trim())
  const num = (v: string) => (v.trim() !== '' ? Number(v) : undefined)

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/po/${po.id}/operasi/hasil`, {
        items: details.map((d) => ({
          po_detail_id: d.id,
          no_mo: rows[d.id].no_mo,
          no_tm: rows[d.id].no_tm,
          hgl_kg: num(rows[d.id].hgl_kg),
          broken_kg: num(rows[d.id].broken_kg),
          menir_kg: num(rows[d.id].menir_kg),
          katul_kg: num(rows[d.id].katul_kg),
          rendemen_persen: num(rendemenOf(rows[d.id].hgl_kg, d.data_operasi?.gabah_diolah_kg ?? null)),
        })),
      }),
    onSuccess: () => {
      setConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      toast.success(`Hasil produksi PO ${po.no_po} tersimpan, transaksi lanjut ke Gudang.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan hasil produksi.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirm(true) }}>
      <PoHeader po={po} right={<span className="badge badge-warning">Nomor OUT keluar</span>} />
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      {details.map((d) => (
        <div key={d.id} className="mb-4 rounded-lg border border-border bg-surface p-3">
          <div className="section-title mb-1">IN {d.transaksi_id}{d.no_in ? ` — No. IN ${d.no_in}` : ''}</div>
          <p className="mb-3 text-xs text-muted">No. OUT {d.data_operasi?.no_out ?? '-'} · Gabah diolah {formatNumber(d.data_operasi?.gabah_diolah_kg ?? 0)} kg</p>
          <div className="grid gap-4 @md:grid-cols-2">
            <Field label="No. MO"><input required className="input" value={rows[d.id].no_mo} onChange={(e) => setField(d.id, 'no_mo', e.target.value)} /></Field>
            <Field label="No. TM"><input required className="input" value={rows[d.id].no_tm} onChange={(e) => setField(d.id, 'no_tm', e.target.value)} /></Field>
            <Field label="HGL (kg)"><input type="number" step="0.01" min="0" className="input" value={rows[d.id].hgl_kg} onChange={(e) => setField(d.id, 'hgl_kg', e.target.value)} /></Field>
            <Field label="Broken (kg)"><input type="number" step="0.01" min="0" className="input" value={rows[d.id].broken_kg} onChange={(e) => setField(d.id, 'broken_kg', e.target.value)} /></Field>
            <Field label="Menir (kg)"><input type="number" step="0.01" min="0" className="input" value={rows[d.id].menir_kg} onChange={(e) => setField(d.id, 'menir_kg', e.target.value)} /></Field>
            <Field label="Katul (kg)"><input type="number" step="0.01" min="0" className="input" value={rows[d.id].katul_kg} onChange={(e) => setField(d.id, 'katul_kg', e.target.value)} /></Field>
            <Field label="Rendemen (%) — otomatis dari HGL ÷ gabah diolah">
              <input readOnly className="input bg-primary-tint/40" value={rendemenOf(rows[d.id].hgl_kg, d.data_operasi?.gabah_diolah_kg ?? null) || '-'} />
            </Field>
          </div>
        </div>
      ))}

      <div className="mt-4 flex justify-end"><button type="submit" disabled={!allValid || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Simpan Hasil Produksi'}</button></div>

      <ConfirmDialog
        open={confirm}
        title="Simpan hasil produksi?"
        description={<>Hasil produksi <strong>{details.length} IN</strong> pada PO <strong>{po.no_po}</strong> akan disimpan. Jika seluruh IN lengkap, transaksi lanjut ke <strong>Gudang</strong>. Lanjutkan?</>}
        confirmLabel="Simpan Hasil"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirm(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}

// --- 3. Kartu status permintaan yang menunggu keputusan Pengadaan ---
function MenungguCard({ po }: { po: PoItem }) {
  const details = po.po_detail.filter(inMenunggu)
  return (
    <div className="po-card">
      <PoHeader po={po} right={<span className="badge badge-warning">Menunggu Pengadaan</span>} />
      <div className="data-table-wrap">
        <table className="data-table">
          <thead><tr><th>ID Transaksi</th><th>No. IN</th><th>Gabah diolah (kg)</th><th>Status</th></tr></thead>
          <tbody>
            {details.map((d) => (
              <tr key={d.id}>
                <td className="font-semibold text-primary-dark">{d.transaksi_id}</td>
                <td>{d.no_in ?? '-'}</td>
                <td>{formatNumber(d.data_operasi?.gabah_diolah_kg ?? 0)}</td>
                <td><span className="badge badge-warning">Menunggu keputusan</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
