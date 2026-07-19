import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useAdminMakloon, type AdminUser } from '../hooks/useAdminUsers'
import { Skeleton } from '../components/Skeleton'
import FormHero from '../components/FormHero'

type MakloonForm = {
  username: string
  password: string
  password_confirmation: string
  nama_maklon: string
  kecamatan: string
  kabupaten: string
  is_active: boolean
}

type ImportResult = {
  created: number
  updated: number
  errors: { baris: number; pesan: string }[]
  default_password: string
}

const emptyForm: MakloonForm = {
  username: '',
  password: '',
  password_confirmation: '',
  nama_maklon: '',
  kecamatan: '',
  kabupaten: '',
  is_active: true,
}

function errorMessage(error: unknown) {
  return (
    (error as { response?: { data?: { message?: string } } } | null)?.response?.data?.message ??
    'Terjadi kesalahan. Periksa input lalu coba lagi.'
  )
}

export default function AdminMakloonPage() {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [form, setForm] = useState<MakloonForm>(emptyForm)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importInputKey, setImportInputKey] = useState(0)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const { data: makloon, isLoading } = useAdminMakloon(search)

  const refreshMakloon = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-makloon'] })
    queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    queryClient.invalidateQueries({ queryKey: ['makloon-options'] })
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        username: form.username,
        nama_maklon: form.nama_maklon,
        kecamatan: form.kecamatan || null,
        kabupaten: form.kabupaten || null,
        is_active: form.is_active,
        ...(form.password
          ? { password: form.password, password_confirmation: form.password_confirmation }
          : {}),
      }

      if (editing) return api.patch(`/api/admin/makloon/${editing.id}`, payload)

      return api.post('/api/admin/makloon', payload)
    },
    onSuccess: () => {
      toast.success(`${form.nama_maklon} ${editing ? 'diperbarui' : 'ditambahkan'}.`)
      setForm(emptyForm)
      setEditing(null)
      refreshMakloon()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (target: AdminUser) => api.delete(`/api/admin/makloon/${target.id}`),
    onSuccess: (_data, target) => {
      toast.success(`${target.nama_maklon ?? target.username} dihapus.`)
      refreshMakloon()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('Pilih file CSV atau Excel terlebih dahulu.')

      const body = new FormData()
      body.append('file', importFile)

      const { data } = await api.post<{ data: ImportResult }>('/api/admin/users/import-makloon', body)

      return data.data
    },
    onSuccess: (result) => {
      setImportResult(result)
      setImportFile(null)
      setImportInputKey((prev) => prev + 1)
      toast.success(`Import selesai: ${result.created} baru, ${result.updated} diperbarui.`)
      refreshMakloon()
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (user?.role.nama_role !== 'admin') return <Navigate to="/" replace />

  const startEdit = (target: AdminUser) => {
    saveMutation.reset()
    setEditing(target)
    setForm({
      username: target.username,
      password: '',
      password_confirmation: '',
      nama_maklon: target.nama_maklon ?? '',
      kecamatan: target.kecamatan ?? '',
      kabupaten: target.kabupaten ?? '',
      is_active: target.is_active,
    })
  }

  const cancelEdit = () => {
    saveMutation.reset()
    setEditing(null)
    setForm(emptyForm)
  }

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Admin Makloon"
        subtitle="Tambah, ubah, dan hapus akun makloon."
        badge="Administrator"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl px-6 pb-16">
        <div className="grid items-start gap-6 xl:grid-cols-[380px_minmax(0,1fr)]">
          <div className="grid content-start gap-6">
            <section className="panel panel-pad">
              <h2 className="section-title mb-4">Tambah Makloon</h2>

              {!editing && saveMutation.error && <div className="alert-danger mb-4">{errorMessage(saveMutation.error)}</div>}

              <form
                className="grid gap-4"
                onSubmit={(event) => {
                  event.preventDefault()
                  saveMutation.mutate()
                }}
              >
                <label className="block">
                  <span className="label">Nama Makloon</span>
                  <input
                    required
                    className="input"
                    value={form.nama_maklon}
                    onChange={(event) => setForm((prev) => ({ ...prev, nama_maklon: event.target.value }))}
                  />
                </label>

                <label className="block">
                  <span className="label">Username</span>
                  <input
                    required
                    className="input"
                    value={form.username}
                    onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <label className="block">
                    <span className="label">Kecamatan</span>
                    <input
                      className="input"
                      value={form.kecamatan}
                      onChange={(event) => setForm((prev) => ({ ...prev, kecamatan: event.target.value }))}
                    />
                  </label>

                  <label className="block">
                    <span className="label">Kabupaten</span>
                    <input
                      className="input"
                      value={form.kabupaten}
                      onChange={(event) => setForm((prev) => ({ ...prev, kabupaten: event.target.value }))}
                    />
                  </label>
                </div>

                <label className="block">
                  <span className="label">Password</span>
                  <input
                    required
                    type="password"
                    className="input"
                    value={form.password}
                    onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                  />
                </label>

                <label className="block">
                  <span className="label">Konfirmasi Password</span>
                  <input
                    required
                    type="password"
                    className="input"
                    value={form.password_confirmation}
                    onChange={(event) => setForm((prev) => ({ ...prev, password_confirmation: event.target.value }))}
                  />
                </label>

                <div className="flex flex-wrap gap-3">
                  <button type="submit" disabled={saveMutation.isPending} className="btn btn-primary">
                    {saveMutation.isPending ? 'Menyimpan...' : 'Tambah Makloon'}
                  </button>
                </div>
              </form>
            </section>

            <section className="panel panel-pad @container">
            <div className="mb-4 flex flex-col gap-1">
              <h2 className="section-title">Import Makloon</h2>
              <p className="text-xs text-slate-500">
                Upload CSV atau Excel dengan kolom nama_maklon, kecamatan, kabupaten. Kolom username dan password boleh dikosongkan.
              </p>
            </div>

            {importMutation.error && (
              <div className="alert-danger mb-4">
                {errorMessage(importMutation.error)}
              </div>
            )}

            {importResult && (
              <div className="alert-warning mb-4">
                Import terakhir: {importResult.created} makloon baru, {importResult.updated} makloon diperbarui. Password default makloon baru: {importResult.default_password}.
                {importResult.errors.length > 0 && (
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {importResult.errors.slice(0, 5).map((item) => (
                      <li key={`${item.baris}-${item.pesan}`}>Baris {item.baris}: {item.pesan}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <form
              className="grid gap-4"
              onSubmit={(event) => {
                event.preventDefault()
                importMutation.mutate()
              }}
            >
              <label className="block">
                <span className="label">File CSV/Excel Makloon</span>
                <input
                  key={importInputKey}
                  required
                  type="file"
                  accept=".csv,.xlsx,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  className="input"
                  onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
                />
              </label>
              <button
                type="submit"
                disabled={importMutation.isPending || !importFile}
                className="btn btn-primary"
              >
                {importMutation.isPending ? 'Mengimport...' : 'Import File'}
              </button>
            </form>

            <div className="mt-4 rounded-lg border border-border bg-primary-tint/30 p-3 text-xs text-slate-600">
              Contoh: nama_maklon,kecamatan,kabupaten.
            </div>
            </section>
          </div>

          <section className="panel overflow-hidden">
            <div className="border-b border-border bg-white px-6 py-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div>
                  <h2 className="section-title">Daftar Makloon</h2>
                  <p className="text-xs text-slate-500">Kelola data akun makloon yang terdaftar.</p>
                </div>
                <input
                  className="input md:max-w-xs"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Cari makloon"
                />
              </div>
            </div>

            {deleteMutation.error && <div className="alert-danger rounded-none px-6 py-3">{errorMessage(deleteMutation.error)}</div>}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] table-fixed text-sm">
                <thead className="bg-primary-tint text-left text-primary-dark">
                  <tr>
                    <th className="w-[23%] px-4 py-3 text-xs font-bold uppercase tracking-wide">Nama Makloon</th>
                    <th className="w-[27%] px-4 py-3 text-xs font-bold uppercase tracking-wide">Username</th>
                    <th className="w-[25%] px-4 py-3 text-xs font-bold uppercase tracking-wide">Wilayah</th>
                    <th className="w-[86px] px-3 py-3 text-xs font-bold uppercase tracking-wide">Status</th>
                    <th className="w-[132px] px-4 py-3 text-right text-xs font-bold uppercase tracking-wide">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-white">
                  {isLoading && Array.from({ length: 4 }, (_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-4" colSpan={5}><Skeleton className="h-4 w-full" /></td>
                    </tr>
                  ))}
                  {!isLoading && makloon?.length === 0 && (
                    <tr>
                      <td className="px-4 py-4 text-gray-400" colSpan={5}>Belum ada makloon.</td>
                    </tr>
                  )}
                  {makloon?.map((target) => (
                    <tr key={target.id} className="transition-colors hover:bg-surface">
                      <td className="px-4 py-3 font-semibold leading-snug text-primary-dark">{target.nama_maklon ?? '-'}</td>
                      <td className="break-all px-4 py-3 text-gray-600">{target.username}</td>
                      <td className="px-4 py-3 leading-snug text-gray-600">{[target.kecamatan, target.kabupaten].filter(Boolean).join(', ') || '-'}</td>
                      <td className="px-3 py-3">
                        <span className={target.is_active ? 'inline-flex rounded-full bg-success-bg px-2.5 py-1 text-xs font-semibold text-success' : 'inline-flex rounded-full bg-danger-bg px-2.5 py-1 text-xs font-semibold text-danger'}>
                          {target.is_active ? 'Aktif' : 'Nonaktif'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-nowrap justify-end gap-2 whitespace-nowrap">
                          <button
                            type="button"
                            className="rounded-lg border border-primary/20 bg-primary-tint px-3 py-1.5 text-xs font-bold text-primary transition-colors hover:border-primary hover:bg-primary hover:text-white"
                            onClick={() => startEdit(target)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rounded-lg border border-danger/20 bg-danger-bg px-3 py-1.5 text-xs font-bold text-danger transition-colors hover:border-danger hover:bg-danger hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (window.confirm(`Hapus makloon ${target.nama_maklon ?? target.username}?`)) {
                                deleteMutation.mutate(target)
                              }
                            }}
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
          </section>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <form
            className="panel panel-pad w-full max-w-2xl"
            onSubmit={(event) => {
              event.preventDefault()
              saveMutation.mutate()
            }}
          >
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h2 className="page-title">Edit Makloon</h2>
                <p className="page-subtitle">{editing.nama_maklon ?? editing.username}</p>
              </div>
              <span className={form.is_active ? 'rounded bg-success-bg px-2 py-1 text-xs text-success' : 'rounded bg-danger-bg px-2 py-1 text-xs text-danger'}>
                {form.is_active ? 'Aktif' : 'Nonaktif'}
              </span>
            </div>

            {saveMutation.error && <div className="alert-danger mb-4">{errorMessage(saveMutation.error)}</div>}

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="label">Nama Makloon</span>
                <input
                  required
                  className="input"
                  value={form.nama_maklon}
                  onChange={(event) => setForm((prev) => ({ ...prev, nama_maklon: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="label">Username</span>
                <input
                  required
                  className="input"
                  value={form.username}
                  onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="label">Status</span>
                <select
                  className="input"
                  value={form.is_active ? 'active' : 'inactive'}
                  onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.value === 'active' }))}
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Nonaktif</option>
                </select>
              </label>

              <label className="block">
                <span className="label">Kecamatan</span>
                <input
                  className="input"
                  value={form.kecamatan}
                  onChange={(event) => setForm((prev) => ({ ...prev, kecamatan: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="label">Kabupaten</span>
                <input
                  className="input"
                  value={form.kabupaten}
                  onChange={(event) => setForm((prev) => ({ ...prev, kabupaten: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="label">Password baru</span>
                <input
                  type="password"
                  className="input"
                  value={form.password}
                  onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
                />
              </label>

              <label className="block">
                <span className="label">Konfirmasi Password</span>
                <input
                  required={form.password !== ''}
                  type="password"
                  className="input"
                  value={form.password_confirmation}
                  onChange={(event) => setForm((prev) => ({ ...prev, password_confirmation: event.target.value }))}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-3">
              <button type="button" onClick={cancelEdit} className="btn btn-ghost">
                Batal
              </button>
              <button type="submit" disabled={saveMutation.isPending} className="btn btn-primary">
                {saveMutation.isPending ? 'Menyimpan...' : 'Simpan Perubahan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
