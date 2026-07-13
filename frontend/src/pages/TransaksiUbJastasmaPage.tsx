import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'

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

export default function TransaksiUbJastasmaPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(initialState)

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/transaksi/${encodeURIComponent(id!)}/ub-jastasma`, {
        ka1: Number(form.ka1),
        ka2: Number(form.ka2),
        ka3: Number(form.ka3),
        hampa: Number(form.hampa),
        butir_hijau: Number(form.butir_hijau),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transaksi', id] })
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      navigate(`/transaksi/${encodeURIComponent(id!)}`)
    },
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message

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
            mutation.mutate()
          }}
        >
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

          <button
            type="submit"
            disabled={mutation.isPending}
            className="btn btn-primary w-full"
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
      <span className="label">{label}</span>
      {children}
    </label>
  )
}
