import { useState, type Dispatch, type SetStateAction } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import ConfirmDialog from '../components/ConfirmDialog'
import { toast } from 'sonner'
import { apiErrorMessage } from '../lib/apiError'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'
import type { PaginationMeta } from '../hooks/useTransaksiList'

type DataGudang = {
  id: number
  permintaan_operasi_id: number
  tanggal_masuk: string
  nama_gudang: string
  realisasi_hgl: string | null
  no_tm: string
}

type PermintaanOperasi = {
  id: number
  gabah_diolah_kg: string | null
  status_out: 'menunggu_pengadaan' | 'dikeluarkan' | 'dikembalikan'
  no_out: string | null
  kuantum_out: string | null
  no_mo: string | null
  no_tm: string | null
  hgl_kg: string | null
  created_at: string
  data_gudang: DataGudang | null
}

type GudangRowState = {
  tanggal_masuk: string
  nama_gudang: string
  realisasi_hgl: string
  no_tm: string
}

function formatNumber(value: string | number | null | undefined) {
  return Number(value ?? 0).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

export default function GudangPage() {
  const [page, setPage] = useState(1)
  const { data: result, isLoading } = useQuery({
    queryKey: ['operasi-list', page],
    queryFn: async () => {
      const { data } = await api.get<{ data: PermintaanOperasi[]; meta: PaginationMeta }>('/api/operasi', {
        params: { page, per_page: 20 },
      })
      return { items: data.data, meta: data.meta }
    },
  })

  const operasiList = result?.items ?? []
  const meta = result?.meta
  const siapGudang = operasiList.filter((item) => item.status_out === 'dikeluarkan' && item.no_mo && !item.data_gudang)
  const sudahGudang = operasiList.filter((item) => item.data_gudang !== null).length
  const totalKuantum = siapGudang.reduce((sum, item) => sum + Number(item.gabah_diolah_kg ?? 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Gudang - Penerimaan Batch"
        subtitle="Catat penerimaan hasil operasi yang sudah keluar nomor OUT dan sudah diisi hasil produksinya."
        badge="Role Gudang"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Menunggu gudang</div><div className="stat-value">{siapGudang.length}</div></div>
          <div className="stat-card"><div className="stat-label">Sudah diterima</div><div className="stat-value">{sudahGudang}</div></div>
          <div className="stat-card"><div className="stat-label">Kuantum antrean</div><div className="stat-value">{formatNumber(totalKuantum)}</div></div>
          <div className="stat-card"><div className="stat-label">Total batch</div><div className="stat-value">{meta?.total ?? operasiList.length}</div></div>
        </div>

        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">Batch Operasi Siap Diterima Gudang</h2>
              <p className="page-subtitle">Isi penerimaan per permintaan Operasi. Tersambung ke POST /api/operasi/:id/gudang.</p>
            </div>
            <span className="badge badge-warning">{siapGudang.length} antrean</span>
          </div>

          {isLoading && <SkeletonPoCards />}
          {!isLoading && siapGudang.length === 0 && (
            <div className="empty-state">
              <div className="empty-title">Tidak ada batch yang menunggu penerimaan Gudang</div>
              <p className="empty-copy">Batch muncul setelah Pengadaan mengeluarkan nomor OUT dan Operasi mengisi hasil produksi.</p>
            </div>
          )}

          <div className="space-y-4">{siapGudang.map((item) => <GudangForm key={item.id} item={item} />)}</div>
          {meta && meta.last_page > 1 && <PaginationBar meta={meta} page={page} setPage={setPage} />}
        </section>
      </div>
    </div>
  )
}

function PaginationBar({ meta, page, setPage }: { meta: PaginationMeta; page: number; setPage: Dispatch<SetStateAction<number>> }) {
  return (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
      <span>Menampilkan {meta.from ?? 0}-{meta.to ?? 0} dari {meta.total} batch</span>
      <div className="flex gap-2">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</button>
        <span className="badge">Halaman {meta.current_page}/{meta.last_page}</span>
        <button className="btn btn-ghost" disabled={page >= meta.last_page} onClick={() => setPage((prev) => prev + 1)}>Berikutnya</button>
      </div>
    </div>
  )
}


function GudangForm({ item }: { item: PermintaanOperasi }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<GudangRowState>({
    tanggal_masuk: '',
    nama_gudang: '',
    realisasi_hgl: '',
    no_tm: item.no_tm ?? '',
  })
  const [confirmGudang, setConfirmGudang] = useState(false)
  const allValid = values.tanggal_masuk && values.nama_gudang.trim() && values.no_tm.trim()

  const mutation = useMutation({
    mutationFn: () => api.post('/api/operasi/' + item.id + '/gudang', {
      tanggal_masuk: values.tanggal_masuk,
      nama_gudang: values.nama_gudang,
      realisasi_hgl: values.realisasi_hgl.trim() !== '' ? Number(values.realisasi_hgl) : undefined,
      no_tm: values.no_tm,
    }),
    onSuccess: () => {
      setConfirmGudang(false)
      queryClient.invalidateQueries({ queryKey: ['operasi-list'] })
      toast.success('Penerimaan batch operasi ' + item.id + ' tercatat.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan penerimaan Gudang.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirmGudang(true) }}>
      <div className="po-card-header">
        <div>
          <div className="po-title">Permintaan Operasi #{item.id}</div>
          <div className="po-meta">Gabah diolah {formatNumber(item.gabah_diolah_kg)} kg - No. OUT {item.no_out ?? '-'} - No. MO {item.no_mo ?? '-'}</div>
        </div>
        <span className="badge badge-success">Operasi selesai</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      <div className="mb-4 rounded-lg border border-border bg-surface p-3">
        <div className="section-title mb-3">Batch siap diterima</div>
        <div className="page-subtitle mb-3">No. TM dari Operasi: {item.no_tm ?? '-'}</div>
        <div className="grid gap-4 @md:grid-cols-2">
          <label className="block">
            <span className="label">Tanggal Masuk</span>
            <input required type="date" className="input" value={values.tanggal_masuk} onChange={(e) => setValues((prev) => ({ ...prev, tanggal_masuk: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">Nama Gudang</span>
            <input required className="input" value={values.nama_gudang} onChange={(e) => setValues((prev) => ({ ...prev, nama_gudang: e.target.value }))} placeholder="Contoh: Gudang Bulog Lampung" />
          </label>
          <label className="block">
            <span className="label">Realisasi HGL (kg)</span>
            <input type="number" step="0.01" min="0" className="input" value={values.realisasi_hgl} onChange={(e) => setValues((prev) => ({ ...prev, realisasi_hgl: e.target.value }))} />
          </label>
          <label className="block">
            <span className="label">No. TM</span>
            <input required className="input" value={values.no_tm} onChange={(e) => setValues((prev) => ({ ...prev, no_tm: e.target.value }))} />
          </label>
        </div>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={!allValid || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : 'Simpan Penerimaan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirmGudang}
        title="Simpan penerimaan gudang?"
        description={<>Penerimaan <strong>batch #{item.id}</strong> akan dicatat dan status gudang dianggap selesai. Data tidak dapat diubah lagi setelah disimpan. Lanjutkan?</>}
        confirmLabel="Simpan Penerimaan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirmGudang(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}
