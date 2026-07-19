import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { useGudangList, type DataGudang } from '../hooks/useGudang'
import ConfirmDialog from '../components/ConfirmDialog'
import { SkeletonPoCards } from '../components/Skeleton'
import FormHero from '../components/FormHero'

function formatNumber(value: string | number | null) {
  if (value === null || value === '') return '-'
  return Number(value).toLocaleString('id-ID', { maximumFractionDigits: 2 })
}

function formatTanggal(value: string | null | undefined) {
  return value ? new Date(value).toLocaleDateString('id-ID') : '-'
}

type GudangForm = {
  tanggal_masuk: string
  nama_gudang: string
  realisasi_hgl: string
  no_tm: string
}

const emptyForm: GudangForm = { tanggal_masuk: '', nama_gudang: '', realisasi_hgl: '', no_tm: '' }

function toPayload(form: GudangForm) {
  return {
    tanggal_masuk: form.tanggal_masuk,
    nama_gudang: form.nama_gudang.trim(),
    realisasi_hgl: form.realisasi_hgl.trim() !== '' ? Number(form.realisasi_hgl) : undefined,
    no_tm: form.no_tm.trim(),
  }
}

function isValid(form: GudangForm) {
  return !!form.tanggal_masuk && form.nama_gudang.trim() !== '' && form.realisasi_hgl.trim() !== '' && form.no_tm.trim() !== ''
}

export default function GudangPage() {
  const { data, isLoading } = useGudangList(1, 200)
  const entries = data?.items ?? []
  const totalRealisasi = entries.reduce((sum, g) => sum + Number(g.realisasi_hgl || 0), 0)
  const gudangUnik = new Set(entries.map((g) => g.nama_gudang)).size

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Role Gudang"
        title="Gudang — Pencatatan Penerimaan"
        subtitle="Catat penerimaan gudang secara mandiri: Tanggal Masuk, Nama Gudang, Kuantum Realisasi HGL, dan No. TM. Tidak perlu menunggu input Operasi."
      />

      <div className="relative mx-auto -mt-16 max-w-5xl space-y-6 px-6 pb-16">
        <div className="stats-grid">
          <div className="stat-card"><div className="stat-label">Total entri</div><div className="stat-value">{data?.meta.total ?? entries.length}</div></div>
          <div className="stat-card"><div className="stat-label">Realisasi HGL (kg)</div><div className="stat-value">{formatNumber(totalRealisasi)}</div></div>
          <div className="stat-card"><div className="stat-label">Gudang tercatat</div><div className="stat-value">{gudangUnik}</div></div>
        </div>

        <TambahForm />

        <section className="panel overflow-hidden">
          <div className="toolbar-card border-b border-border px-5 py-4">
            <div><h2 className="section-title">Entri Terbaru</h2><p className="page-subtitle">Ubah atau hapus catatan penerimaan gudang.</p></div>
            <Link to="/gudang/rekap" className="btn btn-ghost border border-border bg-white">Buka Rekap</Link>
          </div>

          {isLoading && <div className="p-5"><SkeletonPoCards /></div>}
          {!isLoading && entries.length === 0 && (
            <div className="empty-state">
              <div className="empty-title">Belum ada penerimaan gudang</div>
              <p className="empty-copy">Catat penerimaan pertama lewat form di atas.</p>
            </div>
          )}

          {entries.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-primary-tint text-left text-primary-dark">
                  <tr>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Tanggal Masuk</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">Nama Gudang</th>
                    <th className="px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Realisasi HGL (kg)</th>
                    <th className="px-4 py-3 text-xs font-bold uppercase tracking-wide">No. TM</th>
                    <th className="px-2 py-3 text-center text-xs font-bold uppercase tracking-wide">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {entries.map((entry) => <Row key={entry.id} entry={entry} />)}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

// Form utama: Gudang mencatat penerimaan secara mandiri (lepas dari Operasi).
function TambahForm() {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<GudangForm>(emptyForm)
  const [confirm, setConfirm] = useState(false)
  const set = (key: keyof GudangForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: () => api.post('/api/gudang', toPayload(form)),
    onSuccess: () => {
      setConfirm(false)
      setForm(emptyForm)
      queryClient.invalidateQueries({ queryKey: ['gudang-list'] })
      toast.success('Penerimaan gudang tercatat.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan penerimaan gudang.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <form className="panel panel-pad @container" onSubmit={(e) => { e.preventDefault(); setConfirm(true) }}>
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-lg font-bold text-white shadow-sm shadow-primary/20">+</span>
        <div>
          <h2 className="section-title">Catat Penerimaan Gudang</h2>
          <p className="mt-0.5 text-xs text-slate-500">Isi keempat kolom lalu simpan.</p>
        </div>
      </div>
      {errorMessage && <div className="alert-danger mb-4">{errorMessage}</div>}

      <div className="grid gap-4 @md:grid-cols-2">
        <Field label="Tanggal Masuk"><input required type="date" className="input" value={form.tanggal_masuk} onChange={(e) => set('tanggal_masuk', e.target.value)} /></Field>
        <Field label="Nama Gudang"><input required className="input" placeholder="Contoh: Gudang Bulog Lampung" value={form.nama_gudang} onChange={(e) => set('nama_gudang', e.target.value)} /></Field>
        <Field label="Kuantum Realisasi HGL (kg)"><input required type="number" step="0.01" min="0" className="input" value={form.realisasi_hgl} onChange={(e) => set('realisasi_hgl', e.target.value)} /></Field>
        <Field label="No. TM"><input required className="input" value={form.no_tm} onChange={(e) => set('no_tm', e.target.value)} /></Field>
      </div>

      <div className="mt-4 flex justify-end">
        <button type="submit" disabled={!isValid(form) || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : 'Simpan Penerimaan'}
        </button>
      </div>

      <ConfirmDialog
        open={confirm}
        title="Simpan penerimaan gudang?"
        description={<>Catatan penerimaan <strong>{form.nama_gudang || 'gudang'}</strong> ({formatNumber(form.realisasi_hgl)} kg) akan disimpan. Lanjutkan?</>}
        confirmLabel="Simpan Penerimaan"
        loading={mutation.isPending}
        error={errorMessage}
        onCancel={() => setConfirm(false)}
        onConfirm={() => mutation.mutate()}
      />
    </form>
  )
}

function Row({ entry }: { entry: DataGudang }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => api.delete(`/api/gudang/${entry.id}`),
    onSuccess: () => {
      setConfirmDelete(false)
      queryClient.invalidateQueries({ queryKey: ['gudang-list'] })
      toast.success('Entri penerimaan dihapus.')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menghapus entri.')),
  })

  const deleteError = (deleteMutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <tr className="transition-colors hover:bg-surface">
      <td className="px-4 py-3 text-gray-600">{formatTanggal(entry.tanggal_masuk)}</td>
      <td className="px-4 py-3 font-semibold text-primary-dark">{entry.nama_gudang}</td>
      <td className="px-4 py-3 text-right text-gray-600">{formatNumber(entry.realisasi_hgl)}</td>
      <td className="px-4 py-3 text-gray-600">{entry.no_tm}</td>
      <td className="px-2 py-3">
        <div className="flex flex-nowrap justify-center gap-1.5 whitespace-nowrap">
          <button
            type="button"
            className="rounded-lg border border-primary/20 bg-primary-tint px-2.5 py-1.5 text-xs font-bold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white"
            onClick={() => setEditing(true)}
          >
            Edit
          </button>
          <button
            type="button"
            className="rounded-lg border border-danger/20 bg-danger-bg px-2.5 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
            disabled={deleteMutation.isPending}
            onClick={() => setConfirmDelete(true)}
          >
            Hapus
          </button>
        </div>
      </td>

      {editing && <EditModal entry={entry} onClose={() => setEditing(false)} />}

      <ConfirmDialog
        open={confirmDelete}
        title="Hapus entri penerimaan?"
        description={<>Catatan <strong>{entry.nama_gudang}</strong> ({formatTanggal(entry.tanggal_masuk)}) akan dihapus permanen. Lanjutkan?</>}
        confirmLabel="Hapus"
        loading={deleteMutation.isPending}
        error={deleteError}
        onCancel={() => setConfirmDelete(false)}
        onConfirm={() => deleteMutation.mutate()}
      />
    </tr>
  )
}

function EditModal({ entry, onClose }: { entry: DataGudang; onClose: () => void }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<GudangForm>({
    tanggal_masuk: entry.tanggal_masuk?.slice(0, 10) ?? '',
    nama_gudang: entry.nama_gudang,
    realisasi_hgl: entry.realisasi_hgl != null ? String(Number(entry.realisasi_hgl)) : '',
    no_tm: entry.no_tm,
  })
  const set = (key: keyof GudangForm, value: string) => setForm((prev) => ({ ...prev, [key]: value }))

  const mutation = useMutation({
    mutationFn: () => api.patch(`/api/gudang/${entry.id}`, toPayload(form)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['gudang-list'] })
      toast.success('Entri penerimaan diperbarui.')
      onClose()
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal memperbarui entri.')),
  })

  const errorMessage = (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message

  return (
    <td className="p-0">
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
        <form
          className="panel panel-pad w-full max-w-2xl"
          onSubmit={(e) => { e.preventDefault(); mutation.mutate() }}
        >
          <div className="mb-4">
            <h2 className="page-title">Edit Penerimaan Gudang</h2>
            <p className="page-subtitle">{entry.nama_gudang}</p>
          </div>

          {errorMessage && <div className="alert-danger mb-4">{errorMessage}</div>}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Tanggal Masuk"><input required type="date" className="input" value={form.tanggal_masuk} onChange={(e) => set('tanggal_masuk', e.target.value)} /></Field>
            <Field label="Nama Gudang"><input required className="input" value={form.nama_gudang} onChange={(e) => set('nama_gudang', e.target.value)} /></Field>
            <Field label="Kuantum Realisasi HGL (kg)"><input required type="number" step="0.01" min="0" className="input" value={form.realisasi_hgl} onChange={(e) => set('realisasi_hgl', e.target.value)} /></Field>
            <Field label="No. TM"><input required className="input" value={form.no_tm} onChange={(e) => set('no_tm', e.target.value)} /></Field>
          </div>

          <div className="mt-5 flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-ghost">Batal</button>
            <button type="submit" disabled={!isValid(form) || mutation.isPending} className="btn btn-primary">
              {mutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
            </button>
          </div>
        </form>
      </div>
    </td>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
