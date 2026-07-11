import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import api from '../lib/api'
import MakloonCombobox from '../components/MakloonCombobox'

type FormState = {
  id_pemasok: string
  supir: string
  plat_mobil: string
  nama_poktan_gapoktan: string
  desa: string
  kecamatan: string
  kabupaten: string
  makloon_user_id: number | null
  tanggal_kirim: string
  kuantum: string
  jarak_ke_makloon_km: string
}

const initialState: FormState = {
  id_pemasok: '',
  supir: '',
  plat_mobil: '',
  nama_poktan_gapoktan: '',
  desa: '',
  kecamatan: '',
  kabupaten: '',
  makloon_user_id: null,
  tanggal_kirim: '',
  kuantum: '',
  jarak_ke_makloon_km: '',
}

export default function TransaksiJemputPanganPage() {
  const navigate = useNavigate()
  const [form, setForm] = useState<FormState>(initialState)

  const mutation = useMutation({
    mutationFn: async (values: FormState) => {
      const { data: created } = await api.post<{ data: { id_transaksi: string } }>('/api/transaksi')
      const idTransaksi = created.data.id_transaksi

      await api.patch(`/api/transaksi/${encodeURIComponent(idTransaksi)}/jemput-pangan`, {
        ...values,
        kuantum: Number(values.kuantum),
        jarak_ke_makloon_km: Number(values.jarak_ke_makloon_km),
      })

      return idTransaksi
    },
    onSuccess: () => navigate('/'),
  })

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const errorMessage =
    (mutation.error as { response?: { data?: { message?: string } } } | null)?.response?.data
      ?.message

  return (
    <div className="min-h-screen bg-surface p-8 flex justify-center">
      <div className="w-full max-w-xl">
        <h1 className="text-xl font-medium text-primary mb-6">Buat Transaksi Jemput Pangan</h1>

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
          <Field label="Nama Poktan/Gapoktan">
            <input
              required
              className="input"
              value={form.nama_poktan_gapoktan}
              onChange={(e) => setField('nama_poktan_gapoktan', e.target.value)}
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
          <Field label="Makloon Tujuan">
            <MakloonCombobox
              value={form.makloon_user_id}
              onChange={(id) => setField('makloon_user_id', id)}
            />
          </Field>
          <Field label="Tanggal Kirim">
            <input
              required
              type="date"
              className="input"
              value={form.tanggal_kirim}
              onChange={(e) => setField('tanggal_kirim', e.target.value)}
            />
          </Field>
          <Field label="Kuantum (kg)">
            <input
              required
              type="number"
              step="0.01"
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
              className="input"
              value={form.jarak_ke_makloon_km}
              onChange={(e) => setField('jarak_ke_makloon_km', e.target.value)}
            />
          </Field>

          <button
            type="submit"
            disabled={mutation.isPending || !form.makloon_user_id}
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
