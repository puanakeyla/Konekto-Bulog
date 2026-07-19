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

  const deleteMutation = useMutation({
    mutationFn: (target: AdminUser) => api.delete(`/api/admin/users/${target.id}`),
    onSuccess: (_data, target) => {
      toast.success(`User ${target.username} dihapus.`)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
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

        <section className="panel overflow-hidden">
          <div className="border-b border-border bg-white px-6 py-5">
            <h2 className="section-title">Daftar User</h2>
          </div>

          {deleteMutation.error && (
            <div className="alert-danger rounded-none px-6 py-3">
              {errorMessage(deleteMutation.error)}
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="bg-primary-tint text-left text-primary-dark">
                <tr>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Username</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Role</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Nama Makloon</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wide">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {loadingUsers && Array.from({ length: 4 }, (_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4" colSpan={5}><Skeleton className="h-4 w-full" /></td>
                  </tr>
                ))}
                {!loadingUsers && users?.length === 0 && (
                  <tr>
                    <td className="px-5 py-4 text-gray-400" colSpan={5}>
                      Belum ada user.
                    </td>
                  </tr>
                )}
                {users?.map((target) => (
                  <tr key={target.id} className="transition-colors hover:bg-surface">
                    <td className="px-5 py-3 font-semibold text-primary-dark">{target.username}</td>
                    <td className="px-5 py-3 capitalize text-gray-600">{target.role.nama_role.replaceAll('_', ' ')}</td>
                    <td className="px-5 py-3 text-gray-600">{target.nama_maklon ?? '-'}</td>
                    <td className="px-5 py-3">
                      <span
                        className={
                          'inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ' +
                          (target.is_active
                            ? 'bg-success-bg text-success'
                            : 'bg-danger-bg text-danger')
                        }
                      >
                        {target.is_active ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-2">
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
          </div>
        </section>
      </div>
      </div>
    </div>
  )
}
