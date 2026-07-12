import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useAdminRoles, useAdminUsers, type AdminUser } from '../hooks/useAdminUsers'
import { Skeleton } from '../components/Skeleton'
import FormHero from '../components/FormHero'

type UserForm = {
  username: string
  password: string
  password_confirmation: string
  role_id: string
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

const emptyForm: UserForm = {
  username: '',
  password: '',
  password_confirmation: '',
  role_id: '',
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

export default function AdminUsersPage() {
  const { user } = useAuth()
  const { data: users, isLoading: loadingUsers } = useAdminUsers()
  const { data: roles, isLoading: loadingRoles } = useAdminRoles()
  const queryClient = useQueryClient()

  const [form, setForm] = useState<UserForm>(emptyForm)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [resetUser, setResetUser] = useState<AdminUser | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmation, setResetConfirmation] = useState('')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)

  const selectedRole = useMemo(
    () => roles?.find((role) => String(role.id) === form.role_id),
    [form.role_id, roles],
  )
  const isMakloon = selectedRole?.nama_role === 'makloon'

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload = {
        username: form.username,
        role_id: Number(form.role_id),
        nama_maklon: isMakloon ? form.nama_maklon : null,
        kecamatan: form.kecamatan || null,
        kabupaten: form.kabupaten || null,
        is_active: form.is_active,
        ...(form.password
          ? { password: form.password, password_confirmation: form.password_confirmation }
          : {}),
      }

      if (editing) return api.patch(`/api/admin/users/${editing.id}`, payload)

      return api.post('/api/admin/users', payload)
    },
    onSuccess: () => {
      toast.success(`User ${form.username} ${editing ? 'diperbarui' : 'ditambahkan'}.`)
      setForm(emptyForm)
      setEditing(null)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const deactivateMutation = useMutation({
    mutationFn: (target: AdminUser) => api.patch(`/api/admin/users/${target.id}/deactivate`),
    onSuccess: (_data, target) => {
      toast.success(`User ${target.username} dinonaktifkan.`)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (target: AdminUser) => api.delete(`/api/admin/users/${target.id}`),
    onSuccess: (_data, target) => {
      toast.success(`User ${target.username} dihapus.`)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const resetMutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/admin/users/${resetUser?.id}/reset-password`, {
        password: resetPassword,
        password_confirmation: resetConfirmation,
      }),
    onSuccess: () => {
      toast.success(`Password ${resetUser?.username} direset.`)
      setResetUser(null)
      setResetPassword('')
      setResetConfirmation('')
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const importMutation = useMutation({
    mutationFn: async () => {
      if (!importFile) throw new Error('Pilih file CSV terlebih dahulu.')

      const body = new FormData()
      body.append('file', importFile)

      const { data } = await api.post<{ data: ImportResult }>('/api/admin/users/import-makloon', body)

      return data.data
    },
    onSuccess: (result) => {
      setImportResult(result)
      setImportFile(null)
      toast.success(`Import selesai: ${result.created} baru, ${result.updated} diperbarui.`)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
      queryClient.invalidateQueries({ queryKey: ['makloon-options'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  if (user?.role.nama_role !== 'admin') return <Navigate to="/" replace />

  const startEdit = (target: AdminUser) => {
    setEditing(target)
    setForm({
      username: target.username,
      password: '',
      password_confirmation: '',
      role_id: String(target.role_id),
      nama_maklon: target.nama_maklon ?? '',
      kecamatan: target.kecamatan ?? '',
      kabupaten: target.kabupaten ?? '',
      is_active: target.is_active,
    })
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm(emptyForm)
  }

  return (
    <div className="min-h-screen bg-surface">
      <FormHero
        title="Admin User"
        subtitle="Kelola akun, role, dan status akses."
        badge="Administrator"
      />

      <div className="relative mx-auto -mt-16 max-w-6xl px-6 pb-16">
      <div className="grid gap-6">
        <section className="panel panel-pad @container">
          <h2 className="section-title mb-4">
            {editing ? `Edit User ${editing.username}` : 'Tambah User'}
          </h2>

          {saveMutation.error && (
            <div className="alert-danger mb-4">
              {errorMessage(saveMutation.error)}
            </div>
          )}

          <form
            className="grid gap-4 @md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              saveMutation.mutate()
            }}
          >
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
              <span className="label">Role</span>
              <select
                required
                className="input"
                value={form.role_id}
                onChange={(event) => setForm((prev) => ({ ...prev, role_id: event.target.value }))}
              >
                <option value="">Pilih role</option>
                {roles?.map((role) => (
                  <option key={role.id} value={role.id}>
                    {role.nama_role}
                  </option>
                ))}
              </select>
            </label>

            {isMakloon && (
              <label className="block @md:col-span-2">
                <span className="label">Nama Makloon</span>
                <input
                  required
                  className="input"
                  value={form.nama_maklon}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, nama_maklon: event.target.value }))
                  }
                />
              </label>
            )}

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
              <span className="label">
                Password {editing ? 'baru' : ''}
              </span>
              <input
                required={!editing}
                type="password"
                className="input"
                value={form.password}
                onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              />
            </label>

            <label className="block">
              <span className="label">Konfirmasi Password</span>
              <input
                required={!editing || form.password !== ''}
                type="password"
                className="input"
                value={form.password_confirmation}
                onChange={(event) =>
                  setForm((prev) => ({ ...prev, password_confirmation: event.target.value }))
                }
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-primary-dark">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm((prev) => ({ ...prev, is_active: event.target.checked }))}
              />
              Aktif
            </label>

            <div className="flex items-center gap-3 @md:col-span-2">
              <button
                type="submit"
                disabled={saveMutation.isPending || loadingRoles}
                className="btn btn-primary"
              >
                {saveMutation.isPending ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah User'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="btn btn-ghost"
                >
                  Batal
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="panel panel-pad @container">
          <div className="mb-4 flex flex-col gap-1">
            <h2 className="section-title">Import Makloon</h2>
            <p className="text-xs text-slate-500">
              Upload CSV dengan kolom nama_maklon, kecamatan, kabupaten. Kolom username dan password boleh dikosongkan.
            </p>
          </div>

          {importMutation.error && (
            <div className="alert-danger mb-4">
              {errorMessage(importMutation.error)}
            </div>
          )}

          {importResult && (
            <div className="alert-warning mb-4">
              Import terakhir: {importResult.created} user baru, {importResult.updated} user diperbarui. Password default user baru: {importResult.default_password}.
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
            className="grid gap-4 @md:grid-cols-[1fr_auto] @md:items-end"
            onSubmit={(event) => {
              event.preventDefault()
              importMutation.mutate()
            }}
          >
            <label className="block">
              <span className="label">File CSV Makloon</span>
              <input
                required
                type="file"
                accept=".csv,text/csv,text/plain"
                className="input"
                onChange={(event) => setImportFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <button
              type="submit"
              disabled={importMutation.isPending || !importFile}
              className="btn btn-primary"
            >
              {importMutation.isPending ? 'Mengimport...' : 'Import CSV'}
            </button>
          </form>

          <div className="mt-4 rounded-lg border border-border bg-primary-tint/30 p-3 text-xs text-slate-600">
            Contoh: nama_maklon,kecamatan,kabupaten.
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="section-title">Daftar User</h2>
          </div>

          {(deactivateMutation.error || deleteMutation.error) && (
            <div className="alert-danger rounded-none px-6 py-3">
              {errorMessage(deactivateMutation.error || deleteMutation.error)}
            </div>
          )}

          <table className="w-full text-sm">
            <thead className="bg-primary-tint text-primary-dark text-left">
              <tr>
                <th className="px-4 py-2">Username</th>
                <th className="px-4 py-2">Role</th>
                <th className="px-4 py-2">Nama Makloon</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2 text-right">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {loadingUsers && Array.from({ length: 4 }, (_, i) => (
                <tr key={i} className="border-t border-border">
                  <td className="px-4 py-3" colSpan={5}><Skeleton className="h-4 w-full" /></td>
                </tr>
              ))}
              {!loadingUsers && users?.length === 0 && (
                <tr>
                  <td className="px-4 py-3 text-gray-400" colSpan={5}>
                    Belum ada user.
                  </td>
                </tr>
              )}
              {users?.map((target) => (
                <tr key={target.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium text-primary-dark">{target.username}</td>
                  <td className="px-4 py-2">{target.role.nama_role}</td>
                  <td className="px-4 py-2">{target.nama_maklon ?? '-'}</td>
                  <td className="px-4 py-2">
                    <span
                      className={
                        target.is_active
                          ? 'text-success bg-success-bg rounded px-2 py-1 text-xs'
                          : 'text-danger bg-danger-bg rounded px-2 py-1 text-xs'
                      }
                    >
                      {target.is_active ? 'Aktif' : 'Nonaktif'}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex justify-end gap-2">
                      <button className="text-primary font-medium" onClick={() => startEdit(target)}>
                        Edit
                      </button>
                      <button className="text-primary-dark" onClick={() => setResetUser(target)}>
                        Reset
                      </button>
                      <button
                        className="text-warning"
                        disabled={!target.is_active || deactivateMutation.isPending}
                        onClick={() => deactivateMutation.mutate(target)}
                      >
                        Nonaktifkan
                      </button>
                      <button
                        className="text-danger"
                        disabled={deleteMutation.isPending}
                        onClick={() => {
                          if (window.confirm(`Hapus user ${target.username}?`)) {
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
        </section>
      </div>

      {resetUser && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center p-4">
          <form
            className="panel panel-pad w-full max-w-md"
            onSubmit={(event) => {
              event.preventDefault()
              resetMutation.mutate()
            }}
          >
            <h2 className="page-title mb-4">
              Reset Password {resetUser.username}
            </h2>
            {resetMutation.error && (
              <div className="alert-danger mb-4">
                {errorMessage(resetMutation.error)}
              </div>
            )}
            <label className="block mb-3">
              <span className="label">Password Baru</span>
              <input
                required
                type="password"
                className="input"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
            </label>
            <label className="block mb-4">
              <span className="label">Konfirmasi Password</span>
              <input
                required
                type="password"
                className="input"
                value={resetConfirmation}
                onChange={(event) => setResetConfirmation(event.target.value)}
              />
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => setResetUser(null)}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={resetMutation.isPending}
                className="btn btn-primary"
              >
                {resetMutation.isPending ? 'Menyimpan...' : 'Reset Password'}
              </button>
            </div>
          </form>
        </div>
      )}
      </div>
    </div>
  )
}
