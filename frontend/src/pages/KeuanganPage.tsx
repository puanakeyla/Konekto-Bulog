import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { usePoList, type PoItem } from '../hooks/usePoList'

export default function KeuanganPage() {
  const { data: poList, isLoading } = usePoList()

  const belumDibayar =
    poList?.filter((po) => po.status === 'lengkap' && po.data_keuangan?.status_bayar !== 'dibayarkan') ?? []

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium text-primary">Keuangan &mdash; Pembayaran PO</h1>
        <Link to="/" className="text-sm text-primary-dark">
          &larr; Dashboard
        </Link>
      </div>

      <div className="max-w-2xl space-y-4">
        {isLoading && <p className="text-sm text-gray-400">Memuat...</p>}
        {!isLoading && belumDibayar.length === 0 && (
          <p className="text-sm text-gray-400">Tidak ada PO yang menunggu pembayaran.</p>
        )}

        {belumDibayar.map((po) => (
          <PembayaranForm key={po.id} po={po} />
        ))}
      </div>
    </div>
  )
}

function PembayaranForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [tanggalBayar, setTanggalBayar] = useState('')
  const [noSpp, setNoSpp] = useState(po.no_spp ?? '')

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/pembayaran`, {
        status_bayar: 'dibayarkan',
        tanggal_bayar: tanggalBayar,
        no_spp: noSpp || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
    },
  })

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
        {po.no_po} &middot; {po.id_pemasok} &middot; Rp {po.total_harga}
      </div>

      {errorMessage && (
        <div className="bg-danger-bg text-danger text-sm rounded px-3 py-2">{errorMessage}</div>
      )}

      <label className="block">
        <span className="block text-sm text-primary-dark mb-1">No. SPP</span>
        <input className="input" value={noSpp} onChange={(e) => setNoSpp(e.target.value)} />
      </label>

      <label className="block">
        <span className="block text-sm text-primary-dark mb-1">Tanggal Bayar</span>
        <input
          required
          type="date"
          className="input"
          value={tanggalBayar}
          onChange={(e) => setTanggalBayar(e.target.value)}
        />
      </label>

      <button
        type="submit"
        disabled={!tanggalBayar || mutation.isPending}
        className="bg-primary text-white rounded px-4 py-2 text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
      >
        {mutation.isPending ? 'Menyimpan...' : 'Tandai Dibayarkan'}
      </button>
    </form>
  )
}
