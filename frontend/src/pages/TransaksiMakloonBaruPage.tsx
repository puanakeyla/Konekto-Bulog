import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import { uploadSemuaFoto } from '../lib/uploadFoto'
import FotoPicker from '../components/FotoPicker'

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
    onSuccess: ({ gagal }) => {
      setFotoGagal(gagal)
      if (gagal.length === 0) navigate('/')
    },
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message

  return (
    <div className="min-h-screen bg-surface p-8 flex justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-xl font-medium text-primary mb-6">Buat Baru (MPP)</h1>

        <form
          className="bg-white rounded-lg shadow p-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate(form)
          }}
        >
          {errorMessage && (
            <div className="bg-danger-bg text-danger text-sm rounded px-3 py-2">
              {errorMessage}
            </div>
          )}

          {mutation.isSuccess && fotoGagal.length > 0 && (
            <div className="bg-warning-bg text-warning text-sm rounded px-3 py-2">
              Data tersimpan, tapi {fotoGagal.length} foto gagal terupload. Buka transaksi ini lagi
              untuk mengulang foto yang gagal.
            </div>
          )}

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
            <input
              required
              className="input"
              value={form.kabupaten}
              onChange={(e) => setField('kabupaten', e.target.value)}
            />
          </Field>
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
            <input
              required
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={form.kuantum}
              onChange={(e) => setField('kuantum', e.target.value)}
            />
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

          <div className="border-t border-border pt-4 space-y-3">
            <div className="text-xs font-medium text-primary uppercase tracking-wide">Dokumen</div>
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

          <button
            type="submit"
            disabled={mutation.isPending}
            className="w-full bg-primary text-white rounded py-2.5 font-medium hover:bg-primary-dark disabled:opacity-50"
          >
            {mutation.isPending ? 'Mengirim...' : 'Simpan & Kirim'}
          </button>
        </form>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm text-primary-dark mb-1">{label}</span>
      {children}
    </label>
  )
}
