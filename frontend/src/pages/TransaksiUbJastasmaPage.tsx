import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { uploadSemuaFoto } from '../lib/uploadFoto'
import FotoPicker from '../components/FotoPicker'

type FormState = {
  ka1: string
  ka2: string
  ka3: string
  hampa: string
  butir_hijau: string
}

const initialState: FormState = {
  ka1: '',
  ka2: '',
  ka3: '',
  hampa: '',
  butir_hijau: '',
}

const FOTO_FIELDS = [{ key: 'foto_lhpk_hpk', label: 'Foto LHPK/HPK' }]
type AksiSimpan = 'draft' | 'submit'

const angkaAtauNull = (value: string) => value === '' ? null : Number(value)

const fotoKurang = (fotos: Record<string, File | null>) =>
  FOTO_FIELDS.filter(({ key }) => !fotos[key]).map(({ label }) => label)

export default function TransaksiUbJastasmaPage() {
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
      await api.patch(`/api/transaksi/${encodeURIComponent(id!)}/ub-jastasma`, {
        aksi: 'draft',
        ka1: angkaAtauNull(form.ka1),
        ka2: angkaAtauNull(form.ka2),
        ka3: angkaAtauNull(form.ka3),
        hampa: angkaAtauNull(form.hampa),
        butir_hijau: angkaAtauNull(form.butir_hijau),
      })

      const { gagal } = await uploadSemuaFoto(id!, fotos, (jenisFoto, percent) =>
        setProgress((prev) => ({ ...prev, [jenisFoto]: percent })),
      )

      if (aksi === 'submit' && gagal.length === 0) {
        await api.patch(`/api/transaksi/${encodeURIComponent(id!)}/ub-jastasma`, {
          aksi: 'submit',
          ka1: Number(form.ka1),
          ka2: Number(form.ka2),
          ka3: Number(form.ka3),
          hampa: Number(form.hampa),
          butir_hijau: Number(form.butir_hijau),
        })
      }

      return { gagal, aksi }
    },
    onSuccess: ({ gagal, aksi }) => {
      setFotoGagal(gagal)
      queryClient.invalidateQueries({ queryKey: ['transaksi', id] })
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      toast.success(aksi === 'draft' ? 'Data UB Jastasma tersimpan sebagai draft.' : 'Data UB Jastasma dikirim ke Pengadaan.')
      if (gagal.length === 0) navigate(`/transaksi/${encodeURIComponent(id!)}`)
    },
    onSettled: () => setAksiBerjalan(null),
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message
  const dataLengkap = !!(form.ka1 && form.ka2 && form.ka3 && form.hampa && form.butir_hijau)
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
            <h1 className="page-title">Isi Data UB Jastasma</h1>
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

          <div className="form-grid">
            <Field label="KA1"><input required type="number" step="0.01" min="0" max="100" className="input" value={form.ka1} onChange={(e) => setField('ka1', e.target.value)} /></Field>
            <Field label="KA2"><input required type="number" step="0.01" min="0" max="100" className="input" value={form.ka2} onChange={(e) => setField('ka2', e.target.value)} /></Field>
            <Field label="KA3"><input required type="number" step="0.01" min="0" max="100" className="input" value={form.ka3} onChange={(e) => setField('ka3', e.target.value)} /></Field>
            <Field label="Hampa"><input required type="number" step="0.01" min="0" max="100" className="input" value={form.hampa} onChange={(e) => setField('hampa', e.target.value)} /></Field>
            <Field label="Butir Hijau"><input required type="number" step="0.01" min="0" max="100" className="input" value={form.butir_hijau} onChange={(e) => setField('butir_hijau', e.target.value)} /></Field>
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
