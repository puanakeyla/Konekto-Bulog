import { useState, type Dispatch, type SetStateAction } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { formatNumber } from '../lib/poFormat'
import { useTransaksiList } from '../hooks/useTransaksiList'
import { usePoList } from '../hooks/usePoList'
import { useOperasiList, type PermintaanOperasi } from '../hooks/useOperasiList'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonPoCards, SkeletonTable } from '../components/Skeleton'
import FormHero from '../components/FormHero'
import GabungPoForm from '../components/pengadaan/GabungPoForm'
import PoInForm from '../components/pengadaan/PoInForm'

export default function PengadaanPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [transaksiPage, setTransaksiPage] = useState(1)
  const [poPage, setPoPage] = useState(1)
  const [poSearch, setPoSearch] = useState(() => searchParams.get('po') ?? '')
  const [selCount, setSelCount] = useState(0)
  const { data: transaksiResult, isLoading: loadingTransaksi } = useTransaksiList(transaksiPage, 20, true)
  const { data: poResult, isLoading: loadingPo } = usePoList(poPage, 20, poSearch.trim())
  const { data: operasiResult, isLoading: loadingOperasi } = useOperasiList()

  const transaksiList = transaksiResult?.items ?? []
  const transaksiMeta = transaksiResult?.meta
  const poList = poResult?.items ?? []
  const poMeta = poResult?.meta
  const poBelumLengkap = poList.filter((po) => po.status === 'proses')
  // Permintaan pengeluaran stok dari modul Operasi (mandiri, lepas dari PO/IN).
  const permintaanMenunggu = (operasiResult?.items ?? []).filter((i) => i.status_out === 'menunggu_pengadaan')

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
            <div className="stat-card"><div className="stat-label">Permintaan OUT</div><div className="stat-value">{permintaanMenunggu.length}</div></div>
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
              <div><h2 className="section-title">Keputusan Pengeluaran Stok (OUT)</h2><p className="page-subtitle">Permintaan Operasi: keluarkan dengan mengisi No. OUT, atau kembalikan dengan catatan.</p></div>
              <span className="badge badge-warning">{permintaanMenunggu.length} menunggu</span>
            </div>

            {loadingOperasi && <SkeletonPoCards />}
            {!loadingOperasi && permintaanMenunggu.length === 0 && (
              <div className="empty-state"><div className="empty-title">Tidak ada permintaan OUT</div><p className="empty-copy">Permintaan muncul setelah Operasi mengajukan pengeluaran stok.</p></div>
            )}

            <div className="space-y-4">{permintaanMenunggu.map((item) => <OutApprovalForm key={item.id} item={item} />)}</div>
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

// Keputusan Pengadaan atas SATU permintaan pengeluaran stok dari Operasi (modul mandiri).
function OutApprovalForm({ item }: { item: PermintaanOperasi }) {
  const queryClient = useQueryClient()
  const [keputusan, setKeputusan] = useState<Keputusan>('')
  const [noOut, setNoOut] = useState('')
  const [catatan, setCatatan] = useState('')
  const [confirmOut, setConfirmOut] = useState(false)

  const valid = keputusan === 'dikeluarkan' ? !!noOut.trim() : keputusan === 'dikembalikan' ? !!catatan.trim() : false

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/operasi/${item.id}/out`,
        keputusan === 'dikeluarkan'
          ? { keputusan: 'dikeluarkan', no_out: noOut }
          : { keputusan: 'dikembalikan', catatan },
      ),
    onSuccess: () => {
      setConfirmOut(false)
      queryClient.invalidateQueries({ queryKey: ['operasi-list'] })
      toast.success(
        keputusan === 'dikeluarkan'
          ? `Nomor OUT ${noOut} dikirim ke Operasi.`
          : 'Permintaan dikembalikan ke Operasi.',
      )
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan keputusan OUT.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmOut(true) }}>
      <div className="po-card-header">
        <div>
          <div className="po-title">Permintaan {formatNumber(item.gabah_diolah_kg)} kg gabah</div>
          <div className="po-meta">
            Diajukan {new Date(item.created_at).toLocaleDateString('id-ID')}
            {item.creator ? ` oleh ${item.creator.username}` : ''}
          </div>
        </div>
        <span className="badge badge-warning">Menunggu keputusan</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setKeputusan('dikeluarkan')} className={`btn ${keputusan === 'dikeluarkan' ? 'btn-primary' : 'btn-ghost border border-border bg-white'}`}>Dikeluarkan</button>
        <button type="button" onClick={() => setKeputusan('dikembalikan')} className={`btn ${keputusan === 'dikembalikan' ? 'btn-danger' : 'btn-ghost border border-border bg-white'}`}>Dikembalikan</button>
      </div>

      {keputusan === 'dikeluarkan' && (
        <label className="mt-3 block max-w-sm">
          <span className="label">Nomor OUT</span>
          <input className="input" placeholder="Masukkan nomor OUT" value={noOut} onChange={(e) => setNoOut(e.target.value)} />
        </label>
      )}
      {keputusan === 'dikembalikan' && (
        <label className="mt-3 block">
          <span className="label">Catatan pengembalian</span>
          <textarea className="input min-h-16" placeholder="Alasan dikembalikan ke Operasi" value={catatan} onChange={(e) => setCatatan(e.target.value)} />
        </label>
      )}

      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={!valid || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Mengirim...' : 'Kirim Keputusan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmOut}
        title="Kirim keputusan OUT?"
        description={
          keputusan === 'dikeluarkan'
            ? <>Permintaan <strong>{formatNumber(item.gabah_diolah_kg)} kg</strong> akan <strong>dikeluarkan</strong> dengan No. OUT <strong>{noOut}</strong>. Operasi lanjut mengisi hasil produksi. Lanjutkan?</>
            : <>Permintaan <strong>{formatNumber(item.gabah_diolah_kg)} kg</strong> akan <strong>dikembalikan</strong> ke Operasi untuk diajukan ulang. Lanjutkan?</>
        }
        confirmLabel="Kirim Keputusan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmOut(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
