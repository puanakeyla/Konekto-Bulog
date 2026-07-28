import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { apiErrorMessage } from '../lib/apiError'
import { uploadSemuaFoto } from '../lib/uploadFoto'
import MakloonCombobox from '../components/MakloonCombobox'
import AngkaInput from '../components/AngkaInput'
import FotoPicker from '../components/FotoPicker'
import FormHero from '../components/FormHero'
import KabupatenSelect from '../components/KabupatenSelect'

type FormState = {
  id_pemasok: string
  supir: string
  plat_mobil: string
  nama_poktan_gapoktan: string
  desa: string
  kecamatan: string
  kabupaten: string
  makloon_user_id: number | null
  tanggal_kirim: string
  kuantum: string
  jarak_ke_makloon_km: string
}

const initialState: FormState = {
  id_pemasok: '',
  supir: '',
  plat_mobil: '',
  nama_poktan_gapoktan: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  makloon_user_id: null,
  tanggal_kirim: '',
  kuantum: '',
  jarak_ke_makloon_km: '',
}

const FOTO_FIELDS: { key: string; label: string }[] = [
  { key: 'foto_petani', label: 'Foto Petani' },
  { key: 'foto_gabah', label: 'Foto Gabah' },
  { key: 'foto_serah_terima', label: 'Foto Serah Terima' },
  { key: 'foto_kwitansi', label: 'Foto Kwitansi' },
  { key: 'foto_surat_pernyataan', label: 'Foto Surat Pernyataan' },
  { key: 'foto_surat_jalan', label: 'Foto Surat Jalan' },
]

const fotoLabel = (key: string) => FOTO_FIELDS.find((f) => f.key === key)?.label ?? key
type AksiSimpan = 'draft' | 'submit'

const angkaAtauNull = (value: string) => value === '' ? null : Number(value)

const fotoKurang = (fotos: Record<string, File | null>) =>
  FOTO_FIELDS.filter(({ key }) => !fotos[key]).map(({ label }) => label)

export default function TransaksiJemputPanganPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(initialState)
  const [fotos, setFotos] = useState<Record<string, File | null>>({})
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [fotoGagal, setFotoGagal] = useState<string[]>([])
  const [warning, setWarning] = useState<string | null>(null)
  const [aksiBerjalan, setAksiBerjalan] = useState<AksiSimpan | null>(null)

  const mutation = useMutation({
    mutationFn: async ({ values, aksi }: { values: FormState; aksi: AksiSimpan }) => {
      setAksiBerjalan(aksi)
      const { data: created } = await api.post<{ data: { id_transaksi: string } }>('/api/transaksi')
      const idTransaksi = created.data.id_transaksi

      await api.patch(`/api/transaksi/${encodeURIComponent(idTransaksi)}/jemput-pangan`, {
        ...values,
        aksi: 'draft',
        kuantum: angkaAtauNull(values.kuantum),
        jarak_ke_makloon_km: angkaAtauNull(values.jarak_ke_makloon_km),
      })

      const { gagal } = await uploadSemuaFoto(idTransaksi, fotos, (jenisFoto, percent) =>
        setProgress((prev) => ({ ...prev, [jenisFoto]: percent })),
      )

      if (aksi === 'submit' && gagal.length === 0) {
        await api.patch(`/api/transaksi/${encodeURIComponent(idTransaksi)}/jemput-pangan`, {
          ...values,
          aksi: 'submit',
          kuantum: Number(values.kuantum),
          jarak_ke_makloon_km: Number(values.jarak_ke_makloon_km),
        })
      }

      return { idTransaksi, gagal, aksi }
    },
    onSuccess: ({ idTransaksi, gagal, aksi }) => {
      setFotoGagal(gagal)
      toast.success(aksi === 'draft' ? `Transaksi ${idTransaksi} tersimpan sebagai draft.` : `Transaksi ${idTransaksi} dibuat & dikirim ke Makloon.`)
      gagal.forEach((f) => toast.error(`Foto "${fotoLabel(f)}" gagal diupload, coba ulangi.`))
      if (gagal.length === 0) navigate('/dashboard')
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal membuat transaksi Jemput Pangan.')),
    onSettled: () => setAksiBerjalan(null),
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message
  const dataLengkap = !!(form.id_pemasok && form.supir && form.plat_mobil && form.nama_poktan_gapoktan && form.desa && form.kecamatan && form.kabupaten && form.makloon_user_id && form.tanggal_kirim && form.kuantum && form.jarak_ke_makloon_km)
  const dokumenKurang = fotoKurang(fotos)

  const simpan = (aksi: AksiSimpan) => {
    if (aksi === 'submit') {
      if (!dataLengkap) {
        setWarning('Data belum lengkap. Lengkapi semua field sebelum mengirim.')
        toast.error('Data belum lengkap. Lengkapi semua field sebelum mengirim.')
        return
      }
      if (dokumenKurang.length > 0) {
        setWarning(`Dokumen belum lengkap: ${dokumenKurang.join(', ')}.`)
        toast.error('Dokumen belum lengkap, transaksi belum dapat dikirim.')
        return
      }
    }

    setWarning(null)
    mutation.mutate({ values: form, aksi })
  }

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        eyebrow="Perum Bulog Kanwil Lampung"
        badge="Skema TJP · Jemput Pangan"
        title="Buat Transaksi Jemput Pangan"
        subtitle="Isi data pemasok, lokasi asal, tujuan makloon, dan dokumen. Transaksi langsung dikirim ke Makloon setelah disimpan."
        widthClass="max-w-4xl"
      />

      {/* Kartu form ditarik naik menimpa hero. */}
      <div className="relative mx-auto -mt-16 max-w-4xl px-6 pb-16">
        <form
          className="panel @container overflow-hidden"
          onSubmit={(e) => {
            e.preventDefault()
            simpan('submit')
          }}
        >
          {(warning || errorMessage || (mutation.isSuccess && fotoGagal.length > 0)) && (
            <div className="space-y-3 px-5 pt-5">
              {warning && <div className="alert-warning">{warning}</div>}
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
                  placeholder="505374 - CV. CANDRA JAYA PRAKASA"
                  value={form.id_pemasok}
                  onChange={(e) => setField('id_pemasok', e.target.value)}
                />
              </Field>
              <Field label="Nama Poktan/Gapoktan">
                <input
                  required
                  className="input"
                  value={form.nama_poktan_gapoktan}
                  onChange={(e) => setField('nama_poktan_gapoktan', e.target.value)}
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

          <Section step={3} title="Tujuan & pengiriman" desc="Makloon tujuan, jadwal, dan kuantum.">
            <div className="grid gap-4 @md:grid-cols-2">
              <Field label="Makloon Tujuan">
                <MakloonCombobox
                  value={form.makloon_user_id}
                  onChange={(id) => setField('makloon_user_id', id)}
                />
              </Field>
              <Field label="Tanggal Kirim">
                <input
                  required
                  type="date"
                  className="input"
                  value={form.tanggal_kirim}
                  onChange={(e) => setField('tanggal_kirim', e.target.value)}
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
            <p className="text-xs text-slate-500">
              Simpan sebagai draft bila data atau dokumen belum lengkap. Kirim hanya aktif setelah semua dokumen terisi.
            </p>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <button type="button" disabled={mutation.isPending} onClick={() => simpan('draft')} className="btn btn-ghost border border-border bg-white">
                {mutation.isPending && aksiBerjalan === 'draft' ? 'Menyimpan...' : 'Simpan'}
              </button>
              <button
                type="button"
                disabled={mutation.isPending}
                onClick={() => simpan('submit')}
                className={`rounded-lg bg-accent px-6 py-2.5 text-sm font-bold text-primary-dark shadow-sm transition-all hover:bg-primary hover:text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60 ${(!dataLengkap || dokumenKurang.length > 0) ? 'opacity-70' : ''}`}
              >
                {mutation.isPending && aksiBerjalan === 'submit' ? 'Mengirim...' : 'Kirim'}
              </button>
            </div>
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
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-primary to-primary-dark text-sm font-bold text-white shadow-sm shadow-primary/20">
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
