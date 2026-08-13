import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import AngkaInput from '../components/AngkaInput'
import MakloonCombobox from '../components/MakloonCombobox'
import TautanDashboard from '../components/TautanDashboard'
import { apiErrorMessage } from '../lib/apiError'
import { useAuth } from '../hooks/useAuth'
import { useJaminanMakloon, useSimpanJaminanMakloon } from '../hooks/useJaminanMakloon'

const formatKg = (value: number) => `${new Intl.NumberFormat('id-ID').format(Math.round(value))} kg`
const formatRp = (value: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value)

type FormState = {
  makloon_user_id: number | null
  bentuk_jaminan: string
  jaminan_rp: string
  kapasitas_per_hari_kg: string
  batas_hari: string
}

const initialForm: FormState = {
  makloon_user_id: null,
  bentuk_jaminan: '',
  jaminan_rp: '',
  kapasitas_per_hari_kg: '',
  batas_hari: '',
}

/** "13 - 15 Agu 2026". Rentang berlaku dihitung server, di sini tinggal dirapikan. */
function rentangBerlaku(mulai: string | null, sampai: string | null) {
  if (!mulai || !sampai) return '-'
  const f = (iso: string, pakaiTahun: boolean) =>
    new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', ...(pakaiTahun ? { year: 'numeric' } : {}) })
  return `${f(mulai, false)} - ${f(sampai, true)}`
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
      bentuk_jaminan: item?.jaminan?.bentuk_jaminan ?? '',
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
      bentuk_jaminan: form.bentuk_jaminan.trim() || null,
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
      <TautanDashboard className="mb-4" />
      <div className="mb-6">
        <h1 className="section-title">Jaminan Makloon</h1>
        <p className="page-subtitle">Atur bentuk jaminan, kapasitas harian, dan batas hari untuk makloon aktif.</p>
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
            <Field label="Bentuk jaminan">
              <input className="input" placeholder="Bank Garansi BNI No. 0012/BG/2026" value={form.bentuk_jaminan} onChange={(e) => setForm((prev) => ({ ...prev, bentuk_jaminan: e.target.value }))} />
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
                <div className="flex justify-between gap-4"><span>Plafon tunggakan</span><strong className="text-primary-dark">{formatKg(Number(form.kapasitas_per_hari_kg || 0) * Number(form.batas_hari || 0))}</strong></div>
                <div className="mt-2 flex justify-between gap-4">
                  <span>Belum diolah UB</span>
                  <strong className={selected.pantauan.melewati_batas ? 'text-danger' : 'text-primary-dark'}>{formatKg(selected.pantauan.tunggakan_kg)}</strong>
                </div>
                <p className="mt-2 text-[0.6875rem] leading-relaxed text-slate-500">
                  Kuota makloon terbuka kembali setiap UB Jastasma mengirim hasil olahan. Berganti hari tidak membukanya.
                </p>
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
              {/* Dua baris kepala: baris atas mengelompokkan kolom jadi tiga blok
                  (identitas / aturan Operasi / posisi makloon saat ini) supaya tabelnya
                  tidak terbaca sebagai deretan angka datar. */}
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr className="bg-primary-tint/60">
                  <th className="px-4 pt-3 pb-1" />
                  <th className="border-l border-border px-4 pt-3 pb-1 font-bold text-primary-dark" colSpan={4}>Aturan dari Operasi</th>
                  <th className="border-l border-border px-4 pt-3 pb-1 font-bold text-primary-dark" colSpan={2}>Posisi Makloon</th>
                </tr>
                <tr className="bg-primary-tint">
                  <th className="px-4 pb-3 pt-1">Makloon</th>
                  <th className="border-l border-border px-4 pb-3 pt-1">Bentuk Jaminan</th>
                  <th className="px-4 pb-3 pt-1 text-right">Nilai</th>
                  <th className="px-4 pb-3 pt-1 text-right">Kuota/Hari</th>
                  <th className="px-4 pb-3 pt-1">Berlaku</th>
                  <th className="border-l border-border px-4 pb-3 pt-1 text-right">Belum Diolah</th>
                  <th className="px-4 pb-3 pt-1 text-right">Sisa Dapat Dikirim</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Memuat data...</td></tr>}
                {!isLoading && data.map((item) => {
                  const j = item.jaminan
                  return (
                    <tr key={item.makloon_user_id} className="border-t border-border odd:bg-white even:bg-surface hover:bg-primary-tint/60">
                      <td className="px-4 py-3">
                        <button type="button" className="text-left font-semibold text-primary-dark hover:text-primary" onClick={() => pilihMakloon(item.makloon_user_id)}>{item.nama_maklon}</button>
                        <div className="text-xs text-slate-500">{[item.kecamatan, item.kabupaten].filter(Boolean).join(', ') || item.username}</div>
                      </td>
                      <td className="border-l border-border px-4 py-3 text-slate-600">{j?.bentuk_jaminan || <span className="text-slate-400">belum dicatat</span>}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{j ? formatRp(j.jaminan_rp) : '-'}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{j ? formatKg(j.kapasitas_per_hari_kg) : '-'}</td>
                      <td className="px-4 py-3 text-slate-600">
                        {j ? (
                          <>
                            <div className="whitespace-nowrap">{rentangBerlaku(j.berlaku_mulai, j.berlaku_sampai)}</div>
                            <span className={`badge ${j.masih_berlaku ? 'badge-success' : 'badge-danger'}`}>
                              {j.masih_berlaku ? `Aktif - ${j.batas_hari} hari` : 'Kedaluwarsa'}
                            </span>
                          </>
                        ) : '-'}
                      </td>
                      <td className={`border-l border-border px-4 py-3 text-right tabular-nums font-semibold ${item.pantauan.melewati_batas ? 'text-danger' : 'text-primary-dark'}`}>
                        {formatKg(item.pantauan.tunggakan_kg)}
                        {j && <div className="text-xs font-normal text-slate-500">plafon {formatKg(j.plafon_tunggakan_kg)}</div>}
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">
                        {j ? (
                          <>
                            <strong className={item.pantauan.sisa_dapat_diinput_kg <= 0 ? 'text-danger' : 'text-success'}>
                              {formatKg(item.pantauan.sisa_dapat_diinput_kg)}
                            </strong>
                            <div className="text-xs text-slate-500">hari ini terpakai {formatKg(item.pantauan.terpakai_hari_ini_kg)}</div>
                          </>
                        ) : <span className="text-slate-400">jaminan belum diatur</span>}
                      </td>
                    </tr>
                  )
                })}
                {!isLoading && data.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-500">Tidak ada makloon aktif.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="border-t border-border bg-surface px-5 py-3 text-xs leading-relaxed text-slate-500">
            <strong>Belum Diolah</strong> = Gabah Sudah IN &minus; Sudah Diolah, rumus yang sama persis dengan kolom
            &ldquo;Belum Administrasi, Belum Olah&rdquo; di neraca makloon &mdash; karena itu bisa bernilai minus.
            <strong className="ml-2">Sisa Dapat Dikirim</strong> = yang terkecil antara sisa kuota hari ini dan sisa plafon.
          </p>
        </section>
      </main>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="label">{label}</span>{children}</label>
}
