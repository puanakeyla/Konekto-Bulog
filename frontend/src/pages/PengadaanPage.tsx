import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useTransaksiList, type TransaksiListItem } from '../hooks/useTransaksiList'
import { usePoList, type PoItem } from '../hooks/usePoList'

function groupKeyOf(t: TransaksiListItem) {
  if (t.data_makloon_mpp) {
    return {
      id_pemasok: t.data_makloon_mpp.id_pemasok,
      tanggal_bongkar: t.data_makloon_mpp.tanggal_bongkar,
      kuantum: t.data_makloon_mpp.kuantum,
    }
  }
  if (t.data_makloon_tjp && t.data_jemput_pangan) {
    return {
      id_pemasok: t.data_jemput_pangan.id_pemasok,
      tanggal_bongkar: t.data_makloon_tjp.tanggal_bongkar,
      kuantum: t.data_makloon_tjp.kuantum_bongkar,
    }
  }
  return { id_pemasok: '-', tanggal_bongkar: '-', kuantum: '-' }
}

export default function PengadaanPage() {
  const { data: transaksiList, isLoading: loadingTransaksi } = useTransaksiList()
  const { data: poList, isLoading: loadingPo } = usePoList()
  const queryClient = useQueryClient()

  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [noPo, setNoPo] = useState('')
  const [harga, setHarga] = useState('')

  const gabungMutation = useMutation({
    mutationFn: () =>
      api.post('/api/pengadaan/gabungkan-po', {
        transaksi_ids: Array.from(selected),
        no_po: noPo,
        harga: harga ? Number(harga) : undefined,
      }),
    onSuccess: () => {
      setSelected(new Set())
      setNoPo('')
      setHarga('')
      queryClient.invalidateQueries({ queryKey: ['transaksi-list'] })
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
    },
  })

  const errorMessage =
    (gabungMutation.error as { response?: { data?: { message?: string } } } | null)?.response
      ?.data?.message

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const poBelumLengkap = poList?.filter((po) => po.status === 'proses') ?? []

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-medium text-primary">Pengadaan</h1>
        <Link to="/" className="text-sm text-primary-dark">
          &larr; Dashboard
        </Link>
      </div>

      <div className="grid gap-6 max-w-4xl">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-medium text-primary uppercase tracking-wide mb-4">
            Gabungkan Transaksi Menjadi PO
          </h2>

          {errorMessage && (
            <div className="bg-danger-bg text-danger text-sm rounded px-3 py-2 mb-4">
              {errorMessage}
            </div>
          )}

          {loadingTransaksi && <p className="text-sm text-gray-400">Memuat...</p>}
          {!loadingTransaksi && transaksiList?.length === 0 && (
            <p className="text-sm text-gray-400">
              Tidak ada transaksi yang menunggu digabung menjadi PO.
            </p>
          )}

          {transaksiList && transaksiList.length > 0 && (
            <>
              <div className="border border-border rounded-md overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead className="bg-primary-tint text-primary-dark text-left">
                    <tr>
                      <th className="px-3 py-2 w-8"></th>
                      <th className="px-3 py-2">ID Transaksi</th>
                      <th className="px-3 py-2">ID Pemasok</th>
                      <th className="px-3 py-2">Tanggal Bongkar</th>
                      <th className="px-3 py-2">Kuantum</th>
                    </tr>
                  </thead>
                  <tbody>
                    {transaksiList.map((t) => {
                      const key = groupKeyOf(t)
                      return (
                        <tr key={t.id_transaksi} className="border-t border-border">
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selected.has(t.id_transaksi)}
                              onChange={() => toggle(t.id_transaksi)}
                            />
                          </td>
                          <td className="px-3 py-2">{t.id_transaksi}</td>
                          <td className="px-3 py-2">{key.id_pemasok}</td>
                          <td className="px-3 py-2">{key.tanggal_bongkar}</td>
                          <td className="px-3 py-2">{key.kuantum}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <p className="text-xs text-gray-500 mb-4">
                Pilih transaksi dengan ID Pemasok &amp; Tanggal Bongkar yang sama untuk digabung
                menjadi satu PO.
              </p>

              <form
                className="flex flex-wrap items-end gap-3"
                onSubmit={(e) => {
                  e.preventDefault()
                  gabungMutation.mutate()
                }}
              >
                <label className="block">
                  <span className="block text-sm text-primary-dark mb-1">No. PO</span>
                  <input
                    required
                    className="input"
                    value={noPo}
                    onChange={(e) => setNoPo(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="block text-sm text-primary-dark mb-1">
                    Harga/kg (default 6500)
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className="input"
                    value={harga}
                    onChange={(e) => setHarga(e.target.value)}
                  />
                </label>
                <button
                  type="submit"
                  disabled={selected.size === 0 || !noPo || gabungMutation.isPending}
                  className="bg-primary text-white rounded px-4 py-2.5 text-sm font-medium hover:bg-primary-dark disabled:opacity-50"
                >
                  {gabungMutation.isPending ? 'Menggabungkan...' : `Gabungkan (${selected.size})`}
                </button>
              </form>
            </>
          )}
        </section>

        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-medium text-primary uppercase tracking-wide mb-4">
            PO Belum Lengkap &mdash; Isi Nomor IN
          </h2>

          {loadingPo && <p className="text-sm text-gray-400">Memuat...</p>}
          {!loadingPo && poBelumLengkap.length === 0 && (
            <p className="text-sm text-gray-400">Tidak ada PO yang menunggu nomor IN.</p>
          )}

          <div className="space-y-4">
            {poBelumLengkap.map((po) => (
              <PoInForm key={po.id} po={po} />
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function PoInForm({ po }: { po: PoItem }) {
  const queryClient = useQueryClient()
  const [values, setValues] = useState<Record<number, string>>({})

  const mutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/po/${po.id}/in`, {
        items: Object.entries(values)
          .filter(([, no_in]) => no_in.trim() !== '')
          .map(([po_detail_id, no_in]) => ({ po_detail_id: Number(po_detail_id), no_in })),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
    },
  })

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message

  const isiCount = Object.values(values).filter((v) => v.trim() !== '').length

  return (
    <form
      className="border border-border rounded-md p-4"
      onSubmit={(e) => {
        e.preventDefault()
        mutation.mutate()
      }}
    >
      <div className="flex justify-between items-center mb-3">
        <div className="text-sm font-medium text-primary-dark">
          {po.no_po} &middot; {po.id_pemasok} &middot; {po.total_kuantum} kg
        </div>
      </div>

      {errorMessage && (
        <div className="bg-danger-bg text-danger text-sm rounded px-3 py-2 mb-3">
          {errorMessage}
        </div>
      )}

      <div className="space-y-2 mb-3">
        {po.po_detail.map((d) => (
          <div key={d.id} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 w-40 truncate">{d.transaksi_id}</span>
            <input
              className="input"
              placeholder={d.no_in ?? 'Nomor IN'}
              disabled={!!d.no_in}
              value={values[d.id] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [d.id]: e.target.value }))}
            />
          </div>
        ))}
      </div>

      <button
        type="submit"
        disabled={isiCount === 0 || mutation.isPending}
        className="bg-primary text-white rounded px-4 py-2 text-sm disabled:opacity-50"
      >
        {mutation.isPending ? 'Menyimpan...' : 'Simpan Nomor IN'}
      </button>
    </form>
  )
}
