import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem } from '../hooks/usePoList'

type FormState = {
  no_mo: string
  no_tm: string
  hgl_persen: string
  broken_persen: string
  menir_persen: string
  katul_persen: string
  rendemen_persen: string
}

const initialState: FormState = {
  no_mo: '',
  no_tm: '',
  hgl_persen: '',
  broken_persen: '',
  menir_persen: '',
  katul_persen: '',
  rendemen_persen: '',
}

export default function OperasiPage() {
  const { data: poList, isLoading } = usePoList()

  const menungguOperasi =
    poList?.filter((po) => po.data_keuangan?.status_bayar === 'dibayarkan' && !po.data_operasi) ?? []

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium text-primary">Operasi &mdash; Input MO/TM</h1>
        <Link to="/" className="text-sm text-primary-dark">
          &larr; Dashboard
        </Link>
      </div>

      <div className="max-w-2xl space-y-4">
        {isLoading && <p className="text-sm text-gray-400">Memuat...</p>}
        {!isLoading && menungguOperasi.length === 0 && (
          <p className="text-sm text-gray-400">Tidak ada PO yang menunggu data Operasi.</p>
        )}

        {menungguOperasi.map((po) => (
          <OperasiForm key={po.id} po={po} />
        ))}
      </div>
    </div>
  )
}

function OperasiForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>(initialState)

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/po/${po.id}/operasi`, {
        no_mo: form.no_mo,
        no_tm: form.no_tm,
        hgl_persen: form.hgl_persen ? Number(form.hgl_persen) : undefined,
        broken_persen: form.broken_persen ? Number(form.broken_persen) : undefined,
        menir_persen: form.menir_persen ? Number(form.menir_persen) : undefined,
        katul_persen: form.katul_persen ? Number(form.katul_persen) : undefined,
        rendemen_persen: form.rendemen_persen ? Number(form.rendemen_persen) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
    },
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message

  return (
    <form
      className="bg-white rounded-lg shadow p-6 space-y-3"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <div className="text-sm font-medium text-primary-dark">
        {po.no_po} &middot; {po.id_pemasok} &middot; {po.total_kuantum} kg
      </div>

      {errorMessage && (
        <div className="bg-danger-bg text-danger text-sm rounded px-3 py-2">{errorMessage}</div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="No. MO">
          <input
            required
            className="input"
            value={form.no_mo}
            onChange={(e) => setField('no_mo', e.target.value)}
          />
        </Field>
        <Field label="No. TM">
          <input
            required
            className="input"
            value={form.no_tm}
            onChange={(e) => setField('no_tm', e.target.value)}
          />
        </Field>
        <Field label="HGL (%)">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="input"
            value={form.hgl_persen}
            onChange={(e) => setField('hgl_persen', e.target.value)}
          />
        </Field>
        <Field label="Broken (%)">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="input"
            value={form.broken_persen}
            onChange={(e) => setField('broken_persen', e.target.value)}
          />
        </Field>
        <Field label="Menir (%)">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="input"
            value={form.menir_persen}
            onChange={(e) => setField('menir_persen', e.target.value)}
          />
        </Field>
        <Field label="Katul (%)">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="input"
            value={form.katul_persen}
            onChange={(e) => setField('katul_persen', e.target.value)}
          />
        </Field>
        <Field label="Rendemen (%)">
          <input
            type="number"
            step="0.01"
            min="0"
            max="100"
            className="input"
            value={form.rendemen_persen}
            onChange={(e) => setField('rendemen_persen', e.target.value)}
          />
        </Field>
      </div>

      <button
        type="submit"
        disabled={!form.no_mo || !form.no_tm || mutation.isPending}
        className="bg-primary text-white rounded px-4 py-2 text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
      >
        {mutation.isPending ? 'Menyimpan...' : 'Simpan Data Operasi'}
      </button>
    </form>
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
