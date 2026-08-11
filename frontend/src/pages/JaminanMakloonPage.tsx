import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import AngkaInput from '../components/AngkaInput'
import MakloonCombobox from '../components/MakloonCombobox'
import { apiErrorMessage } from '../lib/apiError'
import { useAuth } from '../hooks/useAuth'
import { useJaminanMakloon, useSimpanJaminanMakloon } from '../hooks/useJaminanMakloon'

const formatKg = (value: number) => `${new Intl.NumberFormat('id-ID').format(Math.round(value))} kg`
const formatRp = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

type FormState = {
  makloon_user_id: number | null
  jaminan_rp: string
  kapasitas_per_hari_kg: string
  batas_hari: string
}

const initialForm: FormState = {
  makloon_user_id: null,
  jaminan_rp: '',
  kapasitas_per_hari_kg: '',
  batas_hari: '',
}

export default function JaminanMakloonPage() {
  const { user } = useAuth()
  const [q, setQ] = useState('')
  const [form, setForm] = useState<FormState>(initialForm)
  const [warning, setWarning] = useState<string | null>(null)
  const { data = [], isLoading } = useJaminanMakloon(q)
  const mutation = useSimpanJaminanMakloon()

  const selected = useMemo(
    () => data.find((item) => item.makloon_user_id === form.makloon_user_id),
    [data, form.makloon_user_id],
  )

  if (user?.role.nama_role !== 'operasi') return <Navigate to="/dashboard" replace />

  const pilihMakloon = (id: number | null) => {
    const item = data.find((row) => row.makloon_user_id === id)
    setForm({
      makloon_user_id: id,
      jaminan_rp: item?.jaminan ? String(Math.round(item.jaminan.jaminan_rp)) : '',
      kapasitas_per_hari_kg: item?.jaminan ? String(Math.round(item.jaminan.kapasitas_per_hari_kg)) : '',
      batas_hari: item?.jaminan ? String(item.jaminan.batas_hari) : '',
    })
    setWarning(null)
  }

  const simpan = () => {
    if (!form.makloon_user_id || !form.jaminan_rp || !form.kapasitas_per_hari_kg || !form.batas_hari) {
      setWarning('Pilih makloon dan lengkapi jaminan, kapasitas per hari, serta batas hari sebelum menyimpan.')
      toast.error('Data jaminan makloon belum lengkap.')
      return
    }

    mutation.mutate({
      makloon_user_id: form.makloon_user_id,
      jaminan_rp: Number(form.jaminan_rp),
      kapasitas_per_hari_kg: Number(form.kapasitas_per_hari_kg),
      batas_hari: Number(form.batas_hari),
    }, {
      onSuccess: (item) => {
        setWarning(null)
        setForm(initialForm)
        toast.success(`Jaminan ${item.nama_maklon} tersimpan.`)
      },
      onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan jaminan makloon.')),
    })
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="section-title">Jaminan Makloon</h1>
        <p className="page-subtitle">Atur jaminan, kapasitas harian, dan batas hari untuk makloon aktif.</p>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <input className="input ml-auto max-w-xs bg-white" placeholder="Cari makloon" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      <main className="grid gap-6 lg:grid-cols-[22rem_1fr]">
        <form className="panel panel-pad h-fit" onSubmit={(e) => { e.preventDefault(); simpan() }}>
          <h2 className="section-title">Input Jaminan</h2>
          <div className="mt-4 space-y-4">
            {warning && <div className="alert-warning">{warning}</div>}
            <Field label="Makloon">
              <MakloonCombobox value={form.makloon_user_id} onChange={pilihMakloon} />
            </Field>
            <Field label="Jaminan (Rp)">
              <AngkaInput required prefix="Rp " value={form.jaminan_rp} onChange={(value) => setForm((prev) => ({ ...prev, jaminan_rp: value }))} />
            </Field>
            <Field label="Kapasitas per hari (kg)">
              <AngkaInput required value={form.kapasitas_per_hari_kg} onChange={(value) => setForm((prev) => ({ ...prev, kapasitas_per_hari_kg: value }))} />
            </Field>
            <Field label="Batas hari">
              <AngkaInput required value={form.batas_hari} onChange={(value) => setForm((prev) => ({ ...prev, batas_hari: value }))} />
            </Field>

            {selected && (
              <div className="rounded-lg border border-border bg-primary-tint/40 p-3 text-xs text-slate-600">
                <div className="flex justify-between gap-4"><span>Kapasitas total</span><strong className="text-primary-dark">{formatKg(Number(form.kapasitas_per_hari_kg || 0) * Number(form.batas_hari || 0))}</strong></div>
                <div className="mt-2 flex justify-between gap-4">
                  <span>Belum Administrasi, Belum Olah</span>
                  <strong className={selected.pantauan.melewati_batas ? 'text-danger' : 'text-primary-dark'}>{formatKg(selected.pantauan.belum_adm_belum_olah)}</strong>
                </div>
              </div>
            )}

            <button type="submit" disabled={mutation.isPending} className="btn btn-primary w-full">
              {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
            </button>
          </div>
        </form>

        <section className="panel overflow-hidden">
          <div className="border-b border-border bg-white px-5 py-4">
            <h2 className="section-title">Pantauan Makloon</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-primary-tint text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Makloon</th>
                  <th className="px-4 py-3 text-right">Jaminan</th>
                  <th className="px-4 py-3 text-right">Kapasitas/Hari</th>
                  <th className="px-4 py-3 text-right">Batas Hari</th>
                  <th className="px-4 py-3 text-right">Batas Total</th>
                  <th className="px-4 py-3 text-right">Belum Administrasi, Belum Olah</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Memuat data...</td></tr>}
                {!isLoading && data.map((item) => {
                  const j = item.jaminan
                  return (
                    <tr key={item.makloon_user_id} className="border-t border-border odd:bg-white even:bg-surface hover:bg-primary-tint/60">
                      <td className="px-4 py-3">
                        <button type="button" className="text-left font-semibold text-primary-dark hover:text-primary" onClick={() => pilihMakloon(item.makloon_user_id)}>{item.nama_maklon}</button>
                        <div className="text-xs text-slate-500">{[item.kecamatan, item.kabupaten].filter(Boolean).join(', ') || item.username}</div>
                      </td>
                      <td className="px-4 py-3 text-right">{j ? formatRp(j.jaminan_rp) : '-'}</td>
                      <td className="px-4 py-3 text-right">{j ? formatKg(j.kapasitas_per_hari_kg) : '-'}</td>
                      <td className="px-4 py-3 text-right">{j ? j.batas_hari : '-'}</td>
                      <td className="px-4 py-3 text-right">{j ? formatKg(j.kapasitas_total_kg) : '-'}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${item.pantauan.melewati_batas ? 'text-danger' : 'text-primary-dark'}`}>{formatKg(item.pantauan.belum_adm_belum_olah)}</td>
                    </tr>
                  )
                })}
                {!isLoading && data.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-slate-500">Tidak ada makloon aktif.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
