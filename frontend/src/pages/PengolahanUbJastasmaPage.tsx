import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { apiErrorMessage } from '../lib/apiError'
import FormHero from '../components/FormHero'
import MakloonCombobox from '../components/MakloonCombobox'
import { SkeletonTable } from '../components/Skeleton'
import {
  useAjukanUlangPengolahan,
  useBuatPengolahan,
  useKuantumIn,
  usePengolahanList,
  type Pengolahan,
  type PengolahanForm,
} from '../hooks/usePengolahan'

const STATUS_BADGE: Record<Pengolahan['status'], { cls: string; label: string }> = {
  menunggu_operasi: { cls: 'badge-warning', label: 'Menunggu Operasi' },
  ditolak: { cls: 'badge-danger', label: 'Ditolak' },
  digabung: { cls: 'badge-success', label: 'Digabung ke MO' },
}

const numOrNull = (value: string): number | null => (value.trim() === '' ? null : Number(value))

function fmt(value: string | null): string {
  if (value === null || value.trim() === '') return '-'
  return new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(value))
}

const KOSONG = { kuantumOlah: '', noLhpk: '', tanggal: '', ka1: '', ka2: '', ka3: '', hgl: '', broken: '', menir: '', katul: '' }

export default function PengolahanUbJastasmaPage() {
  const { data: listResult, isLoading } = usePengolahanList()
  const buat = useBuatPengolahan()
  const ajukanUlang = useAjukanUlangPengolahan()

  const [makloonId, setMakloonId] = useState<number | null>(null)
  const [form, setForm] = useState({ ...KOSONG })
  const [editId, setEditId] = useState<number | null>(null)

  const { data: kuantumIn } = useKuantumIn(makloonId)
  const jumlahKuantum = kuantumIn?.total ?? null

  const rendemen = useMemo(() => {
    const hgl = Number(form.hgl)
    if (!form.hgl.trim() || !jumlahKuantum || jumlahKuantum <= 0) return '-'
    return ((hgl / jumlahKuantum) * 100).toFixed(2)
  }, [form.hgl, jumlahKuantum])

  const set = (key: keyof typeof KOSONG) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }))

  const valid = makloonId != null && Number(form.kuantumOlah) > 0 && form.noLhpk.trim() !== '' && form.tanggal !== ''
  const pending = buat.isPending || ajukanUlang.isPending

  const items = listResult?.items ?? []

  function reset() {
    setMakloonId(null)
    setForm({ ...KOSONG })
    setEditId(null)
  }

  function isiDariBaris(row: Pengolahan) {
    setEditId(row.id)
    setMakloonId(row.makloon_user_id)
    setForm({
      kuantumOlah: row.kuantum_olah ?? '',
      noLhpk: row.no_lhpk ?? '',
      tanggal: row.tanggal ?? '',
      ka1: row.ka1 ?? '',
      ka2: row.ka2 ?? '',
      ka3: row.ka3 ?? '',
      hgl: row.hgl ?? '',
      broken: row.broken ?? '',
      menir: row.menir ?? '',
      katul: row.katul ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!valid || makloonId == null) return

    const payload: PengolahanForm = {
      makloon_user_id: makloonId,
      kuantum_olah: Number(form.kuantumOlah),
      no_lhpk: form.noLhpk.trim(),
      tanggal: form.tanggal,
      ka1: numOrNull(form.ka1),
      ka2: numOrNull(form.ka2),
      ka3: numOrNull(form.ka3),
      hgl: numOrNull(form.hgl),
      broken: numOrNull(form.broken),
      menir: numOrNull(form.menir),
      katul: numOrNull(form.katul),
    }

    const onSuccess = () => {
      toast.success(editId ? 'Pengolahan diajukan ulang ke Operasi.' : 'Pengolahan dikirim ke Operasi.')
      reset()
    }
    const onError = (err: unknown) => toast.error(apiErrorMessage(err, 'Gagal menyimpan pengolahan.'))

    if (editId) ajukanUlang.mutate({ id: editId, form: payload }, { onSuccess, onError })
    else buat.mutate(payload, { onSuccess, onError })
  }

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Role UB Jastasma"
        title="Pengolahan"
        subtitle="Ajukan data pengolahan per LHPK ke Operasi. Jumlah kuantum diambil otomatis dari total kuantum yang sudah masuk IN pada makloon terpilih."
      />

      <div className="relative mx-auto -mt-16 max-w-5xl space-y-6 px-6 pb-16">
        <form onSubmit={submit} className="panel panel-pad space-y-5">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">{editId ? 'Edit & Ajukan Ulang' : 'Buat Pengolahan Baru'}</h2>
            {editId && (
              <button type="button" onClick={reset} className="btn btn-ghost border border-border bg-white">
                Batal edit
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="block">
              <span className="label">Makloon</span>
              <MakloonCombobox value={makloonId} onChange={setMakloonId} />
            </label>
            <label className="block">
              <span className="label">Jumlah Kuantum (kg) — otomatis</span>
              <input className="input bg-surface" readOnly value={makloonId == null ? '' : (jumlahKuantum ?? 0)} placeholder="Pilih makloon dulu" />
            </label>
            <label className="block">
              <span className="label">Kuantum Olah (kg)</span>
              <input className="input" type="number" step="0.01" min="0" value={form.kuantumOlah} onChange={set('kuantumOlah')} />
            </label>
            <label className="block">
              <span className="label">No. LHPK</span>
              <input className="input" value={form.noLhpk} onChange={set('noLhpk')} placeholder="Nomor LHPK" />
            </label>
            <label className="block">
              <span className="label">Tanggal</span>
              <input className="input" type="date" value={form.tanggal} onChange={set('tanggal')} />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block"><span className="label">KA 1</span><input className="input" type="number" step="0.01" value={form.ka1} onChange={set('ka1')} /></label>
            <label className="block"><span className="label">KA 2</span><input className="input" type="number" step="0.01" value={form.ka2} onChange={set('ka2')} /></label>
            <label className="block"><span className="label">KA 3</span><input className="input" type="number" step="0.01" value={form.ka3} onChange={set('ka3')} /></label>
          </div>

          <div className="grid gap-4 sm:grid-cols-4">
            <label className="block"><span className="label">HGL (kg)</span><input className="input" type="number" step="0.01" value={form.hgl} onChange={set('hgl')} /></label>
            <label className="block"><span className="label">Broken (kg)</span><input className="input" type="number" step="0.01" value={form.broken} onChange={set('broken')} /></label>
            <label className="block"><span className="label">Menir (kg)</span><input className="input" type="number" step="0.01" value={form.menir} onChange={set('menir')} /></label>
            <label className="block"><span className="label">Katul (kg)</span><input className="input" type="number" step="0.01" value={form.katul} onChange={set('katul')} /></label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">Rendemen (%) — otomatis (HGL ÷ Jumlah Kuantum × 100)</span>
              <input className="input bg-surface" readOnly value={rendemen} />
            </label>
          </div>

          <div className="flex justify-end">
            <button type="submit" disabled={!valid || pending} className="btn btn-primary">
              {pending ? 'Mengirim...' : editId ? 'Ajukan Ulang' : 'Kirim ke Operasi'}
            </button>
          </div>
        </form>

        <section className="panel panel-pad">
          <div className="toolbar-card mb-4">
            <div>
              <h2 className="section-title">Daftar Pengolahan</h2>
              <p className="page-subtitle">Baris yang ditolak Operasi bisa diedit lalu diajukan ulang.</p>
            </div>
            <span className="badge">{items.length} baris</span>
          </div>

          {isLoading && <SkeletonTable />}
          {!isLoading && items.length === 0 && (
            <div className="empty-state"><div className="empty-title">Belum ada pengolahan</div><p className="empty-copy">Buat pengolahan baru lewat formulir di atas.</p></div>
          )}

          {!isLoading && items.length > 0 && (
            <div className="panel overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-primary-tint text-left text-primary-dark">
                  <tr>
                    <th className="px-4 py-2">No. LHPK</th>
                    <th className="px-4 py-2">Makloon</th>
                    <th className="px-4 py-2">Tanggal</th>
                    <th className="px-4 py-2 text-right">Kuantum Olah</th>
                    <th className="px-4 py-2 text-right">HGL</th>
                    <th className="px-4 py-2 text-right">Rendemen</th>
                    <th className="px-4 py-2">Status</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((row) => (
                    <tr key={row.id} className="border-t border-border align-top">
                      <td className="px-4 py-2 font-medium text-primary-dark">{row.no_lhpk}</td>
                      <td className="px-4 py-2">{row.makloon?.nama_maklon ?? '-'}</td>
                      <td className="px-4 py-2">{row.tanggal}</td>
                      <td className="px-4 py-2 text-right">{fmt(row.kuantum_olah)}</td>
                      <td className="px-4 py-2 text-right">{fmt(row.hgl)}</td>
                      <td className="px-4 py-2 text-right">{row.rendemen ? `${fmt(row.rendemen)}%` : '-'}</td>
                      <td className="px-4 py-2">
                        <span className={`badge ${STATUS_BADGE[row.status].cls}`}>{STATUS_BADGE[row.status].label}</span>
                        {row.status === 'ditolak' && row.catatan_penolakan && (
                          <div className="mt-1 max-w-xs text-xs text-danger">{row.catatan_penolakan}</div>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        {row.status === 'ditolak' && (
                          <button type="button" onClick={() => isiDariBaris(row)} className="font-medium text-primary">
                            Edit &amp; Ajukan Ulang
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
