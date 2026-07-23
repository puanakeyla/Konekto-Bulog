import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { uploadSemuaFoto } from '../lib/uploadFoto'
import FotoPicker from '../components/FotoPicker'
import AngkaInput from '../components/AngkaInput'
import KabupatenSelect from '../components/KabupatenSelect'

type FormState = {
  id_pemasok: string
  supir: string
  plat_mobil: string
  desa: string
  kecamatan: string
  kabupaten: string
  tanggal_bongkar: string
  kuantum: string
  jarak_ke_makloon_km: string
}

const initialState: FormState = {
  id_pemasok: '',
  supir: '',
  plat_mobil: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  tanggal_bongkar: '',
  kuantum: '',
  jarak_ke_makloon_km: '',
}

const FOTO_FIELDS: { key: string; label: string }[] = [
  { key: 'foto_petani', label: 'Foto Petani' },
  { key: 'foto_gabah', label: 'Foto Gabah' },
  { key: 'foto_serah_terima', label: 'Foto Serah Terima' },
  { key: 'foto_pembayaran', label: 'Foto Pembayaran' },
  { key: 'foto_surat_pernyataan', label: 'Foto Surat Pernyataan' },
  { key: 'foto_surat_jalan', label: 'Foto Surat Jalan' },
  { key: 'foto_nota_timbang', label: 'Foto Nota Timbang' },
]

const fotoLabel = (key: string) => FOTO_FIELDS.find((f) => f.key === key)?.label ?? key

/**
 * Skema MPP: Makloon membuat transaksi baru langsung (bukan lanjutan dari Jemput Pangan),
 * mengisi data lengkap sekaligus di sini (Bagian 3.1).
 */
export default function TransaksiMakloonBaruPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(initialState)
  const [fotos, setFotos] = useState<Record<string, File | null>>({})
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [fotoGagal, setFotoGagal] = useState<string[]>([])

  const mutation = useMutation({
    mutationFn: async (values: FormState) => {
      const { data: created } = await api.post<{ data: { id_transaksi: string } }>('/api/transaksi')
      const idTransaksi = created.data.id_transaksi

      await api.patch(`/api/transaksi/${encodeURIComponent(idTransaksi)}/makloon`, {
        ...values,
        kuantum: Number(values.kuantum),
        jarak_ke_makloon_km: Number(values.jarak_ke_makloon_km),
      })

      const { gagal } = await uploadSemuaFoto(idTransaksi, fotos, (jenisFoto, percent) =>
        setProgress((prev) => ({ ...prev, [jenisFoto]: percent })),
      )

      return { idTransaksi, gagal }
    },
    onSuccess: ({ idTransaksi, gagal }) => {
      setFotoGagal(gagal)
      toast.success(`Transaksi ${idTransaksi} dibuat & dikirim ke Makloon Terima.`)
      gagal.forEach((f) => toast.error(`Foto "${fotoLabel(f)}" gagal diupload, coba ulangi.`))
      if (gagal.length === 0) navigate('/dashboard')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal membuat transaksi MPP.')),
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message

  return (
    <div className="min-h-screen bg-surface">
      {/* Hero band navy -- menyatu dengan AppNav di atasnya, gaya landing page. */}
      <section className="relative overflow-hidden bg-gradient-to-br from-[#14213f] via-primary-dark to-primary text-white">
        <div
          aria-hidden
          className="absolute inset-0 opacity-50"
          style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
        />
        <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -left-28 bottom-0 h-64 w-64 rounded-full bg-primary/50 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-7">
          <Link
            to="/dashboard"
            className="flex w-fit items-center gap-1.5 text-xs font-semibold text-white/70 transition-colors hover:text-white"
          >
            <span aria-hidden className="text-base leading-none">&larr;</span>
            Kembali ke dashboard
          </Link>

          <span className="mt-6 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3.5 py-1.5 text-xs font-semibold text-white">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            Skema MPP &middot; Makloon
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            Buat Transaksi MPP<span className="text-accent">.</span>
          </h1>
          <p className="mt-3 max-w-lg text-sm leading-6 text-white/70">
            Makloon membuat transaksi dan mengisi data bongkar, lokasi asal, kuantum, dan dokumen.
            Transaksi masuk ke Makloon Terima setelah disimpan, lalu diteruskan ke UB Jastasma setelah diterima.
          </p>
        </div>
      </section>

      {/* Kartu form ditarik naik menimpa hero. */}
      <div className="relative mx-auto -mt-16 max-w-4xl px-6 pb-16">
        <form
          className="panel @container overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate(form)
          }}
        >
          {(errorMessage || (mutation.isSuccess && fotoGagal.length > 0)) && (
            <div className="space-y-3 px-5 pt-5">
              {errorMessage && <div className="alert-danger">{errorMessage}</div>}
              {mutation.isSuccess && fotoGagal.length > 0 && (
                <div className="alert-warning">
                  Data tersimpan, tapi {fotoGagal.length} foto gagal terupload. Buka transaksi ini lagi
                  untuk mengulang foto yang gagal.
                </div>
              )}
            </div>
          )}

          <Section step={1} title="Pemasok & kendaraan" desc="Identitas pemasok dan armada pengangkut.">
            <div className="grid gap-4 @md:grid-cols-2">
              <Field label="ID Pemasok">
                <input
                  required
                  className="input"
                  value={form.id_pemasok}
                  onChange={(e) => setField('id_pemasok', e.target.value)}
                />
              </Field>
              <Field label="Supir">
                <input
                  required
                  className="input"
                  value={form.supir}
                  onChange={(e) => setField('supir', e.target.value)}
                />
              </Field>
              <Field label="Plat Mobil">
                <input
                  required
                  className="input"
                  value={form.plat_mobil}
                  onChange={(e) => setField('plat_mobil', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section step={2} title="Lokasi asal" desc="Tempat gabah dijemput.">
            <div className="grid gap-4 @md:grid-cols-2">
              <Field label="Desa">
                <input
                  required
                  className="input"
                  value={form.desa}
                  onChange={(e) => setField('desa', e.target.value)}
                />
              </Field>
              <Field label="Kecamatan">
                <input
                  required
                  className="input"
                  value={form.kecamatan}
                  onChange={(e) => setField('kecamatan', e.target.value)}
                />
              </Field>
              <Field label="Kabupaten">
                <KabupatenSelect value={form.kabupaten} onChange={(value) => setField('kabupaten', value)} />
              </Field>
            </div>
          </Section>

          <Section step={3} title="Bongkar & kuantum" desc="Jadwal bongkar, kuantum, dan jarak.">
            <div className="grid gap-4 @md:grid-cols-2">
              <Field label="Tanggal Bongkar">
                <input
                  required
                  type="date"
                  className="input"
                  value={form.tanggal_bongkar}
                  onChange={(e) => setField('tanggal_bongkar', e.target.value)}
                />
              </Field>
              <Field label="Kuantum (kg)">
                <AngkaInput required value={form.kuantum} onChange={(v) => setField('kuantum', v)} />
              </Field>
              <Field label="Jarak ke Makloon (km)">
                <input
                  required
                  type="number"
                  step="0.01"
                  min="0"
                  className="input"
                  value={form.jarak_ke_makloon_km}
                  onChange={(e) => setField('jarak_ke_makloon_km', e.target.value)}
                />
              </Field>
            </div>
          </Section>

          <Section step={4} title="Dokumen" desc="Unggah foto pendukung transaksi.">
            <div className="grid gap-4 @md:grid-cols-2">
              {FOTO_FIELDS.map(({ key, label }) => (
                <FotoPicker
                  key={key}
                  label={label}
                  file={fotos[key] ?? null}
                  onChange={(file) => setFotos((prev) => ({ ...prev, [key]: file }))}
                  progress={progress[key]}
                  error={fotoGagal.includes(key) ? 'Gagal terupload' : undefined}
                />
              ))}
            </div>
          </Section>

          <div className="flex flex-col gap-3 bg-primary-tint/40 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-500">Transaksi akan dikirim ke Makloon Terima setelah disimpan.</p>
            <button
              type="submit"
              disabled={mutation.isPending}
              className="rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-primary-dark shadow-sm transition-all hover:bg-primary hover:text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              {mutation.isPending ? 'Mengirim...' : 'Simpan & Kirim'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Satu bagian form: nomor langkah + judul + isi. Menyeragamkan tampilan tiap kelompok field.
function Section({
  step,
  title,
  desc,
  children,
}: {
  step: number
  title: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <section className="border-b border-border px-5 py-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-tint text-sm font-bold text-primary">
          {step}
        </span>
        <div>
          <h2 className="section-title">{title}</h2>
          {desc && <p className="mt-0.5 text-xs text-slate-500">{desc}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
    </label>
  )
}
