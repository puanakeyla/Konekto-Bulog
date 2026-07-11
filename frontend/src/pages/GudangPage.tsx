import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem } from '../hooks/usePoList'

type FormState = {
  tanggal_masuk: string
  nama_gudang: string
  realisasi_hgl: string
  no_tm: string
}

const initialState: FormState = {
  tanggal_masuk: '',
  nama_gudang: '',
  realisasi_hgl: '',
  no_tm: '',
}

export default function GudangPage() {
  const { data: poList, isLoading } = usePoList()

  const menungguGudang = poList?.filter((po) => po.data_operasi && !po.data_operasi.data_gudang) ?? []

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium text-primary">Gudang &mdash; Penerimaan</h1>
        <Link to="/" className="text-sm text-primary-dark">
          &larr; Dashboard
        </Link>
      </div>

      <div className="max-w-2xl space-y-4">
        {isLoading && <p className="text-sm text-gray-400">Memuat...</p>}
        {!isLoading && menungguGudang.length === 0 && (
          <p className="text-sm text-gray-400">Tidak ada PO yang menunggu penerimaan Gudang.</p>
        )}

        {menungguGudang.map((po) => (
          <GudangForm key={po.id} po={po} />
        ))}
      </div>
    </div>
  )
}

function GudangForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<FormState>({
    ...initialState,
    no_tm: po.data_operasi?.no_tm ?? '',
  })

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/api/operasi/${po.data_operasi!.id}/gudang`, {
        tanggal_masuk: form.tanggal_masuk,
        nama_gudang: form.nama_gudang,
        realisasi_hgl: form.realisasi_hgl ? Number(form.realisasi_hgl) : undefined,
        no_tm: form.no_tm,
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
        {po.no_po} &middot; {po.id_pemasok} &middot; MO {po.data_operasi?.no_mo}
      </div>

      {errorMessage && (
        <div className="bg-danger-bg text-danger text-sm rounded px-3 py-2">{errorMessage}</div>
      )}

      <label className="block">
        <span className="block text-sm text-primary-dark mb-1">Tanggal Masuk</span>
        <input
          required
          type="date"
          className="input"
          value={form.tanggal_masuk}
          onChange={(e) => setField('tanggal_masuk', e.target.value)}
        />
      </label>

      <label className="block">
        <span className="block text-sm text-primary-dark mb-1">Nama Gudang</span>
        <input
          required
          className="input"
          value={form.nama_gudang}
          onChange={(e) => setField('nama_gudang', e.target.value)}
        />
      </label>

      <label className="block">
        <span className="block text-sm text-primary-dark mb-1">Realisasi HGL (%)</span>
        <input
          type="number"
          step="0.01"
          min="0"
          className="input"
          value={form.realisasi_hgl}
          onChange={(e) => setField('realisasi_hgl', e.target.value)}
        />
      </label>

      <label className="block">
        <span className="block text-sm text-primary-dark mb-1">No. TM</span>
        <input
          required
          className="input"
          value={form.no_tm}
          onChange={(e) => setField('no_tm', e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={!form.tanggal_masuk || !form.nama_gudang || !form.no_tm || mutation.isPending}
        className="bg-primary text-white rounded px-4 py-2 text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
      >
        {mutation.isPending ? 'Menyimpan...' : 'Simpan Penerimaan'}
      </button>
    </form>
  )
}
