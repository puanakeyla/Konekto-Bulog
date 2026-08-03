import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useGudangList, useGudangMutations, type Gudang } from '../hooks/useGudang'
import { pesanError } from '../lib/pesanError'

const KOSONG = { kode: '', nama: '', aktif: true }

/**
 * Master gudang. Gudang A/B/C/D adalah DATA, bukan akun user -- satu akun gudang pusat
 * memilih dari daftar ini saat mengisi.
 */
export default function AdminGudangPage() {
  const { user } = useAuth()
  const { data: daftar, isLoading } = useGudangList()
  const { simpan, hapus } = useGudangMutations()
  const [form, setForm] = useState<typeof KOSONG & { id?: number }>(KOSONG)

  if (user?.role.nama_role !== 'admin') return <Navigate to="/" replace />

  const reset = () => setForm(KOSONG)

  const kirim = (e: React.FormEvent) => {
    e.preventDefault()
    simpan.mutate(form, {
      onSuccess: () => {
        toast.success(form.id ? 'Gudang diperbarui.' : 'Gudang ditambahkan.')
        reset()
      },
      onError: (err) => toast.error(pesanError(err)),
    })
  }

  const hapusGudang = (item: Gudang) => {
    hapus.mutate(item.id, {
      onSuccess: () => toast.success('Gudang dihapus.'),
      // Gudang yang sudah dipakai ditolak server dengan saran menonaktifkan -- pesan itu
      // yang ditampilkan, bukan kalimat generik.
      onError: (err) => toast.error(pesanError(err)),
    })
  }

  return (
    <div className="mx-auto max-w-5xl px-6 py-8">
      <div className="mb-6">
        <h1 className="section-title">Master Gudang</h1>
        <p className="page-subtitle">
          Daftar gudang yang bisa dipilih saat mengisi data pengolahan. Satu akun Gudang memilih dari daftar ini.
        </p>
      </div>

      <form onSubmit={kirim} className="panel panel-pad mb-6 grid gap-4 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor="kode">Kode</label>
          <input
            id="kode"
            className="input"
            value={form.kode}
            onChange={(e) => setForm({ ...form, kode: e.target.value })}
            placeholder="ADA08001"
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="nama">Nama gudang</label>
          <input
            id="nama"
            className="input"
            value={form.nama}
            onChange={(e) => setForm({ ...form, nama: e.target.value })}
            placeholder="Gudang A"
            required
          />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="btn btn-primary" disabled={simpan.isPending}>
            {form.id ? 'Simpan' : 'Tambah'}
          </button>
          {form.id && (
            <button type="button" className="btn btn-ghost" onClick={reset}>Batal</button>
          )}
        </div>
      </form>

      <div className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-primary-tint text-left text-primary-dark">
            <tr>
              <th className="px-4 py-2">Kode</th>
              <th className="px-4 py-2">Nama</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2 text-right">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Memuat...</td></tr>}
            {!isLoading && (daftar ?? []).length === 0 && (
              <tr><td colSpan={4} className="px-4 py-6 text-center text-gray-400">Belum ada gudang.</td></tr>
            )}
            {(daftar ?? []).map((item) => (
              <tr key={item.id} className="border-t border-border">
                <td className="px-4 py-2 font-medium text-primary-dark">{item.kode}</td>
                <td className="px-4 py-2">{item.nama}</td>
                <td className="px-4 py-2">
                  <span className={`badge ${item.aktif ? 'badge-success' : 'badge-warning'}`}>
                    {item.aktif ? 'Aktif' : 'Nonaktif'}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-1 text-xs"
                      onClick={() => setForm({ id: item.id, kode: item.kode, nama: item.nama, aktif: item.aktif })}
                    >
                      Ubah
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost px-3 py-1 text-xs"
                      onClick={() => simpan.mutate({ id: item.id, aktif: !item.aktif })}
                    >
                      {item.aktif ? 'Nonaktifkan' : 'Aktifkan'}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-danger px-3 py-1 text-xs"
                      onClick={() => hapusGudang(item)}
                      disabled={hapus.isPending}
                    >
                      Hapus
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="page-subtitle mt-3">
        Gudang yang sudah dipakai pada data pengolahan tidak bisa dihapus — nonaktifkan saja supaya data lama tetap utuh.
      </p>
    </div>
  )
}
