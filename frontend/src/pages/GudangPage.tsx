import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { useOperasiList, sudahIsiHasil, type PermintaanOperasi } from '../hooks/useOperasiList'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'

function formatNumber(value: string | number | null) {
  if (value === null || value === '') return '-'
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

export default function GudangPage() {
  const { data, isLoading } = useOperasiList()
  const items = data?.items ?? []

  const menunggu = items.filter((i) => sudahIsiHasil(i) && !i.data_gudang)
  const diterima = items.filter((i) => sudahIsiHasil(i) && i.data_gudang)
  const totalHgl = menunggu.reduce((sum, i) => sum + Number(i.hgl_kg || 0), 0)

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Role Gudang"
        title="Gudang — Penerimaan Hasil Produksi"
        subtitle="Catat penerimaan hasil produksi tiap batch pengeluaran stok Operasi yang nomor OUT-nya sudah keluar."
      />

      <div className="relative mx-auto -mt-16 max-w-5xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Menunggu gudang</div><div className="stat-value">{menunggu.length}</div></div>
          <div className="stat-card"><div className="stat-label">Sudah diterima</div><div className="stat-value">{diterima.length}</div></div>
          <div className="stat-card"><div className="stat-label">HGL antrean (kg)</div><div className="stat-value">{formatNumber(totalHgl)}</div></div>
          <div className="stat-card"><div className="stat-label">Total batch</div><div className="stat-value">{data?.meta.total ?? items.length}</div></div>
        </div>

        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div><h2 className="section-title">Batch Siap Diterima</h2><p className="page-subtitle">Hasil produksi Operasi sudah lengkap dan menunggu penerimaan gudang.</p></div>
            <span className="badge badge-warning">{menunggu.length} antrean</span>
          </div>

          {isLoading && <SkeletonPoCards />}
          {!isLoading && menunggu.length === 0 && (
            <div className="empty-state">
              <div className="empty-title">Tidak ada batch menunggu penerimaan</div>
              <p className="empty-copy">Batch muncul setelah Operasi mengisi hasil produksi pada permintaan yang nomor OUT-nya sudah dikeluarkan Pengadaan.</p>
            </div>
          )}

          <div className="space-y-4">{menunggu.map((item) => <GudangForm key={item.id} item={item} />)}</div>
        </section>

        {diterima.length > 0 && (
          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">Riwayat Penerimaan</h2><p className="page-subtitle">Batch yang sudah tercatat masuk gudang.</p></div>
              <span className="badge badge-success">{diterima.length}</span>
            </div>
            <div className="data-table-wrap">
              <table className="data-table">
                <thead><tr><th>No. OUT</th><th>No. MO</th><th>HGL (kg)</th><th>Rendemen</th><th>Gudang</th><th>Tanggal masuk</th></tr></thead>
                <tbody>
                  {diterima.map((i) => (
                    <tr key={i.id}>
                      <td className="font-semibold text-primary-dark">{i.no_out}</td>
                      <td>{i.no_mo}</td>
                      <td>{formatNumber(i.hgl_kg)}</td>
                      <td>{i.rendemen_persen ? `${i.rendemen_persen}%` : '-'}</td>
                      <td>{i.data_gudang?.nama_gudang}</td>
                      <td>{i.data_gudang ? new Date(i.data_gudang.tanggal_masuk).toLocaleDateString('id-ID') : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}

function GudangForm({ item }: { item: PermintaanOperasi }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    tanggal_masuk: '',
    nama_gudang: '',
    realisasi_hgl: item.hgl_kg ? String(Number(item.hgl_kg)) : '',
    no_tm: item.no_tm ?? '',
  })
  const [confirm, setConfirm] = useState(false)

  const set = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/operasi/${item.id}/gudang`, {
        tanggal_masuk: form.tanggal_masuk,
        nama_gudang: form.nama_gudang,
        realisasi_hgl: form.realisasi_hgl.trim() !== '' ? Number(form.realisasi_hgl) : undefined,
        no_tm: form.no_tm,
      }),
    onSuccess: () => {
      setConfirm(false)
      queryClient.invalidateQueries({ queryKey: ['operasi-list'] })
      toast.success(`Penerimaan batch OUT ${item.no_out} tercatat.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan penerimaan Gudang.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message
  const valid = form.tanggal_masuk && form.nama_gudang.trim() && form.no_tm.trim()

  return (
    <form className="po-card @container" onSubmit={(e) => { e.preventDefault(); setConfirm(true) }}>
      <div className="po-card-header">
        <div>
          <div className="po-title">No. OUT {item.no_out} — MO {item.no_mo}</div>
          <div className="po-meta">
            Gabah diolah {formatNumber(item.gabah_diolah_kg)} kg · HGL {formatNumber(item.hgl_kg)} kg
            {item.rendemen_persen ? ` · Rendemen ${item.rendemen_persen}%` : ''}
          </div>
        </div>
        <span className="badge badge-success">Operasi selesai</span>
      </div>
      {errorMessage && <div className="alert-danger mb-3">{errorMessage}</div>}

      <div className="grid gap-4 @md:grid-cols-2">
        <Field label="Tanggal Masuk"><input required type="date" className="input" value={form.tanggal_masuk} onChange={(e) => set('tanggal_masuk', e.target.value)} /></Field>
        <Field label="Nama Gudang"><input required className="input" placeholder="Contoh: Gudang Bulog Lampung" value={form.nama_gudang} onChange={(e) => set('nama_gudang', e.target.value)} /></Field>
        <Field label="Realisasi HGL (kg)"><input type="number" step="0.01" min="0" className="input" value={form.realisasi_hgl} onChange={(e) => set('realisasi_hgl', e.target.value)} /></Field>
        <Field label="No. TM"><input required className="input" value={form.no_tm} onChange={(e) => set('no_tm', e.target.value)} /></Field>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={!valid || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : 'Simpan Penerimaan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Simpan penerimaan gudang?"
        description={<>Penerimaan batch <strong>No. OUT {item.no_out}</strong> akan dicatat. Data tidak dapat diubah lagi setelah disimpan. Lanjutkan?</>}
        confirmLabel="Simpan Penerimaan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirm(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
