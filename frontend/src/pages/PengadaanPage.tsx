import { useState, type Dispatch, type SetStateAction } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { formatNumber } from '../lib/poFormat'
import { useTransaksiList } from '../hooks/useTransaksiList'
import { usePoList, type PoItem, type PoDetailItem } from '../hooks/usePoList'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonPoCards, SkeletonTable } from '../components/Skeleton'
import FormHero from '../components/FormHero'
import GabungPoForm from '../components/pengadaan/GabungPoForm'
import PoInForm from '../components/pengadaan/PoInForm'

function adaOutMenunggu(po: PoItem) {
  return po.po_detail.some((detail) => detail.data_operasi?.status_out === 'menunggu_pengadaan')
}

export default function PengadaanPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [transaksiPage, setTransaksiPage] = useState(1)
  const [poPage, setPoPage] = useState(1)
  const [poSearch, setPoSearch] = useState(() => searchParams.get('po') ?? '')
  const [selCount, setSelCount] = useState(0)
  const { data: transaksiResult, isLoading: loadingTransaksi } = useTransaksiList(transaksiPage, 20, true)
  const { data: poResult, isLoading: loadingPo } = usePoList(poPage, 20, poSearch.trim())

  const transaksiList = transaksiResult?.items ?? []
  const transaksiMeta = transaksiResult?.meta
  const poList = poResult?.items ?? []
  const poMeta = poResult?.meta
  const poMenungguOut = poList.filter(adaOutMenunggu)
  const poBelumLengkap = poList.filter((po) => po.status === 'proses')
  const detailBelumOut = poMenungguOut.reduce(
    (sum, po) => sum + po.po_detail.filter((detail) => detail.data_operasi?.status_out === 'menunggu_pengadaan').length,
    0,
  )

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Pengadaan"
        subtitle="Gabungkan transaksi Makloon menjadi PO, lalu isi nomor IN per transaksi asal."
        badge="Role Pengadaan"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
          <div className="stats-grid">
            <div className="stat-card"><div className="stat-label">Transaksi siap PO</div><div className="stat-value">{transaksiMeta?.total ?? transaksiList.length}</div></div>
            <div className="stat-card"><div className="stat-label">Dipilih</div><div className="stat-value">{selCount}</div></div>
            <div className="stat-card"><div className="stat-label">PO proses</div><div className="stat-value">{poBelumLengkap.length}</div></div>
            <div className="stat-card"><div className="stat-label">Nomor OUT kosong</div><div className="stat-value">{detailBelumOut}</div></div>
          </div>

          <section className="panel panel-pad @container">
            {loadingTransaksi && <SkeletonTable cols={6} />}
            {!loadingTransaksi && (
              <>
                <GabungPoForm transaksiList={transaksiList} onSelectionChange={(count) => setSelCount(count)} />
                {transaksiMeta && transaksiMeta.last_page > 1 && (
                  <PaginationBar className="mt-4" meta={transaksiMeta} page={transaksiPage} setPage={setTransaksiPage} label="transaksi" />
                )}
              </>
            )}
          </section>

          <section className="panel panel-pad @container">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">PO Proses - Isi Nomor IN</h2><p className="page-subtitle">Setelah seluruh nomor IN terisi, PO masuk ke antrean Keuangan.</p></div>
              <span className="badge badge-warning">{poBelumLengkap.length} PO proses</span>
            </div>
            <form
              className="mb-4 flex flex-col gap-2 sm:flex-row"
              onSubmit={(event) => {
                event.preventDefault()
                setPoPage(1)
                setSearchParams(poSearch.trim() ? { po: poSearch.trim() } : {})
              }}
            >
              <input
                className="input"
                value={poSearch}
                onChange={(event) => setPoSearch(event.target.value)}
                placeholder="Cari No. PO, No. SPP, pemasok, makloon, atau ID transaksi"
              />
              <button type="submit" className="btn btn-primary">Cari</button>
              {poSearch && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => {
                    setPoSearch('')
                    setPoPage(1)
                    setSearchParams({})
                  }}
                >
                  Reset
                </button>
              )}
            </form>

            {loadingPo && <SkeletonPoCards />}
            {!loadingPo && poBelumLengkap.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada PO yang menunggu nomor IN</div><p className="empty-copy">PO yang sudah lengkap otomatis lanjut ke antrean Keuangan.</p></div>
            )}

            <div className="space-y-4">{poBelumLengkap.map((po) => <PoInForm key={po.id} po={po} />)}</div>
            {poMeta && poMeta.last_page > 1 && <PaginationBar className="mt-4" meta={poMeta} page={poPage} setPage={setPoPage} label="PO" />}
          </section>

          <section className="panel panel-pad @container">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">Keputusan Pengeluaran Stok (OUT)</h2><p className="page-subtitle">Tiap permintaan Operasi: keluarkan dengan mengisi No. OUT, atau kembalikan dengan catatan.</p></div>
              <span className="badge badge-warning">{poMenungguOut.length} PO menunggu</span>
            </div>

            {loadingPo && <SkeletonPoCards />}
            {!loadingPo && poMenungguOut.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada permintaan OUT</div><p className="empty-copy">Permintaan muncul setelah Operasi mengajukan pengeluaran stok.</p></div>
            )}

            <div className="space-y-4">{poMenungguOut.map((po) => <PoOutApprovalForm key={po.id} po={po} />)}</div>
          </section>
      </div>
    </div>
  )
}

function PaginationBar({ meta, page, setPage, label, className = '' }: { meta: { current_page: number; last_page: number; total: number; from: number | null; to: number | null }; page: number; setPage: Dispatch<SetStateAction<number>>; label: string; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-3 text-sm text-muted ${className}`}>
      <span>Menampilkan {meta.from ?? 0}-{meta.to ?? 0} dari {meta.total} {label}</span>
      <div className="flex gap-2">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</button>
        <span className="badge">Halaman {meta.current_page}/{meta.last_page}</span>
        <button className="btn btn-ghost" disabled={page >= meta.last_page} onClick={() => setPage((prev) => prev + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}

type Keputusan = '' | 'dikeluarkan' | 'dikembalikan'
type OutRow = { keputusan: Keputusan; no_out: string; catatan: string }
const emptyOut: OutRow = { keputusan: '', no_out: '', catatan: '' }

function PoOutApprovalForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const pendingDetails = po.po_detail.filter((detail) => detail.data_operasi?.status_out === 'menunggu_pengadaan')
  const [rows, setRows] = useState<Record<number, OutRow>>(() => Object.fromEntries(pendingDetails.map((d) => [d.id, { ...emptyOut }])))
  const [confirmOut, setConfirmOut] = useState(false)

  const setRow = (id: number, patch: Partial<OutRow>) => setRows((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }))

  const rowValid = (d: PoDetailItem) => {
    const r = rows[d.id]
    if (r?.keputusan === 'dikeluarkan') return !!r.no_out.trim()
    if (r?.keputusan === 'dikembalikan') return !!r.catatan.trim()
    return false
  }
  const allValid = pendingDetails.length > 0 && pendingDetails.every(rowValid)
  const keluarCount = pendingDetails.filter((d) => rows[d.id]?.keputusan === 'dikeluarkan').length
  const kembaliCount = pendingDetails.filter((d) => rows[d.id]?.keputusan === 'dikembalikan').length

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/out`, {
        items: pendingDetails.map((d) => {
          const r = rows[d.id]
          return r.keputusan === 'dikeluarkan'
            ? { po_detail_id: d.id, keputusan: 'dikeluarkan', no_out: r.no_out }
            : { po_detail_id: d.id, keputusan: 'dikembalikan', catatan: r.catatan }
        }),
      }),
    onSuccess: () => {
      setConfirmOut(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      toast.success(`Keputusan OUT PO ${po.no_po} terkirim ke Operasi.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan keputusan OUT.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmOut(true) }}>
      <div className="po-card-header">
        <div><div className="po-title">{po.no_po}</div><div className="po-meta">Pemasok {po.id_pemasok} - {formatNumber(po.total_kuantum)} kg - No. SPP {po.no_spp ?? '-'}</div></div>
        <span className="badge badge-warning">{pendingDetails.length} permintaan</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      <div className="space-y-3">
        {pendingDetails.map((detail) => {
          const r = rows[detail.id] ?? emptyOut
          return (
            <div key={detail.id} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="section-title">IN {detail.transaksi_id}{detail.no_in ? ` — No. IN ${detail.no_in}` : ''}</div>
                <div className="text-xs text-muted">Gabah diolah {formatNumber(detail.data_operasi?.gabah_diolah_kg ?? 0)} kg</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => setRow(detail.id, { keputusan: 'dikeluarkan' })} className={`btn ${r.keputusan === 'dikeluarkan' ? 'btn-primary' : 'btn-ghost border border-border bg-white'}`}>Dikeluarkan</button>
                <button type="button" onClick={() => setRow(detail.id, { keputusan: 'dikembalikan' })} className={`btn ${r.keputusan === 'dikembalikan' ? 'btn-danger' : 'btn-ghost border border-border bg-white'}`}>Dikembalikan</button>
              </div>
              {r.keputusan === 'dikeluarkan' && (
                <label className="mt-3 block"><span className="label">Nomor OUT</span><input className="input" placeholder="Masukkan nomor OUT" value={r.no_out} onChange={(e) => setRow(detail.id, { no_out: e.target.value })} /></label>
              )}
              {r.keputusan === 'dikembalikan' && (
                <label className="mt-3 block"><span className="label">Catatan pengembalian</span><textarea className="input min-h-16" placeholder="Alasan dikembalikan ke Operasi" value={r.catatan} onChange={(e) => setRow(detail.id, { catatan: e.target.value })} /></label>
              )}
            </div>
          )
        })}
      </div>

      <div className="mt-4 flex justify-end"><button type="submit" disabled={!allValid || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Mengirim...' : 'Kirim Keputusan'}</button></div>

      <ConfirmDialog
        open={confirmOut}
        title="Kirim keputusan OUT?"
        description={<><strong>{keluarCount} dikeluarkan</strong> &amp; <strong>{kembaliCount} dikembalikan</strong> pada PO <strong>{po.no_po}</strong> akan dikirim ke Operasi. Yang dikeluarkan lanjut diisi hasil produksinya; yang dikembalikan diajukan ulang. Lanjutkan?</>}
        confirmLabel="Kirim Keputusan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
