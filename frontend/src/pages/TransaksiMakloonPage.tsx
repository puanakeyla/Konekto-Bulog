import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { uploadSemuaFoto } from '../lib/uploadFoto'
import FotoPicker from '../components/FotoPicker'

type FormState = {
  tanggal_bongkar: string
  kuantum_bongkar: string
}

const initialState: FormState = {
  tanggal_bongkar: '',
  kuantum_bongkar: '',
}

const FOTO_FIELDS: { key: string; label: string }[] = [
  { key: 'foto_surat_jalan_paraf', label: 'Foto Surat Jalan (Diparaf)' },
  { key: 'foto_nota_timbang', label: 'Foto Nota Timbang' },
]

/**
 * Lanjutan skema TJP: transaksi sudah dibuat oleh Jemput Pangan, Makloon
 * melanjutkan mengisi data bongkar mereka sendiri di sini.
 */
export default function TransaksiMakloonPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(initialState)
  const [fotos, setFotos] = useState<Record<string, File | null>>({})
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [fotoGagal, setFotoGagal] = useState<string[]>([])

  const mutation = useMutation({
    mutationFn: async () => {
      await api.patch(`/api/transaksi/${encodeURIComponent(id!)}/makloon`, {
        tanggal_bongkar: form.tanggal_bongkar,
        kuantum_bongkar: Number(form.kuantum_bongkar),
      })

      const { gagal } = await uploadSemuaFoto(id!, fotos, (jenisFoto, percent) =>
        setProgress((prev) => ({ ...prev, [jenisFoto]: percent })),
      )

      return { gagal }
    },
    onSuccess: ({ gagal }) => {
      setFotoGagal(gagal)
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      if (gagal.length === 0) {
        queryClient.invalidateQueries({ queryKey: ['transaksi', id] })
        navigate(`/transaksi/${encodeURIComponent(id!)}`)
      }
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
        <h1 className="text-xl font-medium text-primary mb-6">Isi Data Makloon &mdash; {id}</h1>

        <form
          className="bg-white rounded-lg shadow p-8 space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            mutation.mutate()
          }}
        >
          {errorMessage && (
            <div className="bg-danger-bg text-danger text-sm rounded px-3 py-2">
              {errorMessage}
            </div>
          )}

          {mutation.isSuccess && fotoGagal.length > 0 && (
            <div className="bg-warning-bg text-warning text-sm rounded px-3 py-2">
              Data tersimpan, tapi {fotoGagal.length} foto gagal terupload. Coba lagi di bawah.
            </div>
          )}

          <Field label="Tanggal Bongkar">
            <input
              required
              type="date"
              className="input"
              value={form.tanggal_bongkar}
              onChange={(e) => setField('tanggal_bongkar', e.target.value)}
            />
          </Field>
          <Field label="Kuantum Bongkar (kg)">
            <input
              required
              type="number"
              step="0.01"
              min="0"
              className="input"
              value={form.kuantum_bongkar}
              onChange={(e) => setField('kuantum_bongkar', e.target.value)}
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
