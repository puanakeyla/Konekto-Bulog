import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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

type AksiSimpan = 'draft' | 'submit'

const angkaAtauNull = (value: string) => value === '' ? null : Number(value)

const fotoKurang = (fotos: Record<string, File | null>) =>
  FOTO_FIELDS.filter(({ key }) => !fotos[key]).map(({ label }) => label)

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
  const [warning, setWarning] = useState<string | null>(null)
  const [aksiBerjalan, setAksiBerjalan] = useState<AksiSimpan | null>(null)

  const mutation = useMutation({
    mutationFn: async (aksi: AksiSimpan) => {
      setAksiBerjalan(aksi)
      await api.patch(`/api/transaksi/${encodeURIComponent(id!)}/makloon`, {
        aksi: 'draft',
        tanggal_bongkar: form.tanggal_bongkar,
        kuantum_bongkar: angkaAtauNull(form.kuantum_bongkar),
      })

      const { gagal } = await uploadSemuaFoto(id!, fotos, (jenisFoto, percent) =>
        setProgress((prev) => ({ ...prev, [jenisFoto]: percent })),
      )

      if (aksi === 'submit' && gagal.length === 0) {
        await api.patch(`/api/transaksi/${encodeURIComponent(id!)}/makloon`, {
          aksi: 'submit',
          tanggal_bongkar: form.tanggal_bongkar,
          kuantum_bongkar: Number(form.kuantum_bongkar),
        })
      }

      return { gagal, aksi }
    },
    onSuccess: ({ gagal, aksi }) => {
      setFotoGagal(gagal)
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      toast.success(aksi === 'draft' ? 'Data Makloon tersimpan sebagai draft.' : 'Data Makloon dikirim ke UB Jastasma.')
      if (gagal.length === 0) {
        queryClient.invalidateQueries({ queryKey: ['transaksi', id] })
        navigate(`/transaksi/${encodeURIComponent(id!)}`)
      }
    },
    onSettled: () => setAksiBerjalan(null),
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message
  const dataLengkap = !!(form.tanggal_bongkar && form.kuantum_bongkar)
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
    mutation.mutate(aksi)
  }

  return (
    <div className="page-shell">
      <div className="page-container-narrow">
        <header className="page-header">
          <div>
            <h1 className="page-title">Makloon — sedang diisi</h1>
            <p className="page-subtitle">Transaksi {id}</p>
          </div>
          <span className="badge">Giliran Anda</span>
        </header>

        <form
          className="panel panel-pad space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            simpan('submit')
          }}
        >
          {warning && <div className="alert-warning">{warning}</div>}
          {errorMessage && (
            <div className="alert-danger">{errorMessage}</div>
          )}

          {mutation.isSuccess && fotoGagal.length > 0 && (
            <div className="alert-warning">
              Data tersimpan, tapi {fotoGagal.length} foto gagal terupload. Coba lagi di bawah.
            </div>
          )}

          <div className="form-grid">
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
          </div>

          <div className="border-t border-border pt-4 space-y-3">
            <div className="section-title">Dokumen</div>
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

          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" disabled={mutation.isPending} onClick={() => simpan('draft')} className="btn btn-ghost border border-border bg-white">
              {mutation.isPending && aksiBerjalan === 'draft' ? 'Menyimpan...' : 'Simpan'}
            </button>
            <button
              type="button"
              disabled={mutation.isPending}
              onClick={() => simpan('submit')}
              className={`btn btn-primary w-full ${(!dataLengkap || dokumenKurang.length > 0) ? 'opacity-80' : ''}`}
            >
              {mutation.isPending && aksiBerjalan === 'submit' ? 'Mengirim...' : 'Kirim'}
            </button>
          </div>
        </form>
      </div>
    </div>
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
