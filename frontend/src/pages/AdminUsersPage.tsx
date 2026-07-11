import { useMemo, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { useAdminRoles, useAdminUsers, type AdminUser } from '../hooks/useAdminUsers'

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
  const [resetUser, setResetUser] = useState<AdminUser | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetConfirmation, setResetConfirmation] = useState('')
  const [notice, setNotice] = useState('')

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
      setForm(emptyForm)
      setEditing(null)
      setNotice(editing ? 'User berhasil diperbarui.' : 'User berhasil ditambahkan.')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const deactivateMutation = useMutation({
    mutationFn: (target: AdminUser) => api.patch(`/api/admin/users/${target.id}/deactivate`),
    onSuccess: () => {
      setNotice('User berhasil dinonaktifkan.')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (target: AdminUser) => api.delete(`/api/admin/users/${target.id}`),
    onSuccess: () => {
      setNotice('User berhasil dihapus.')
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
  })

  const resetMutation = useMutation({
    mutationFn: () =>
      api.patch(`/api/admin/users/${resetUser?.id}/reset-password`, {
        password: resetPassword,
        password_confirmation: resetConfirmation,
      }),
    onSuccess: () => {
      setResetUser(null)
      setResetPassword('')
      setResetConfirmation('')
      setNotice('Password berhasil direset.')
    },
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
    setNotice('')
  }

  const cancelEdit = () => {
    setEditing(null)
    setForm(emptyForm)
  }

  return (
    <div className="min-h-screen bg-surface p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-medium text-primary">Admin User</h1>
          <p className="text-sm text-gray-500 mt-1">Kelola akun, role, dan status akses.</p>
        </div>
        <Link to="/" className="text-sm text-primary-dark">
          &larr; Dashboard
        </Link>
      </div>

      <div className="grid gap-6 max-w-6xl">
        <section className="bg-white rounded-lg shadow p-6">
          <h2 className="text-sm font-medium text-primary uppercase tracking-wide mb-4">
            {editing ? `Edit User ${editing.username}` : 'Tambah User'}
          </h2>

          {notice && <div className="bg-success-bg text-success text-sm rounded px-3 py-2 mb-4">{notice}</div>}
          {saveMutation.error && (
            <div className="bg-danger-bg text-danger text-sm rounded px-3 py-2 mb-4">
              {errorMessage(saveMutation.error)}
            </div>
          )}

          <form
            className="grid gap-4 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              saveMutation.mutate()
            }}
          >
            <label className="block">
              <span className="block text-sm text-primary-dark mb-1">Username</span>
              <input
                required
                className="input"
                value={form.username}
                onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              />
            </label>

            <label className="block">
              <span className="block text-sm text-primary-dark mb-1">Role</span>
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
              <label className="block md:col-span-2">
                <span className="block text-sm text-primary-dark mb-1">Nama Makloon</span>
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
              <span className="block text-sm text-primary-dark mb-1">Kecamatan</span>
              <input
                className="input"
                value={form.kecamatan}
                onChange={(event) => setForm((prev) => ({ ...prev, kecamatan: event.target.value }))}
              />
            </label>

            <label className="block">
              <span className="block text-sm text-primary-dark mb-1">Kabupaten</span>
              <input
                className="input"
                value={form.kabupaten}
                onChange={(event) => setForm((prev) => ({ ...prev, kabupaten: event.target.value }))}
              />
            </label>

            <label className="block">
              <span className="block text-sm text-primary-dark mb-1">
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
              <span className="block text-sm text-primary-dark mb-1">Konfirmasi Password</span>
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

            <div className="flex items-center gap-3 md:col-span-2">
              <button
                type="submit"
                disabled={saveMutation.isPending || loadingRoles}
                className="bg-primary text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {saveMutation.isPending ? 'Menyimpan...' : editing ? 'Simpan Perubahan' : 'Tambah User'}
              </button>
              {editing && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="border border-border rounded px-4 py-2 text-sm text-primary-dark"
                >
                  Batal
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="bg-white rounded-lg shadow overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="text-sm font-medium text-primary uppercase tracking-wide">Daftar User</h2>
          </div>

          {(deactivateMutation.error || deleteMutation.error) && (
            <div className="bg-danger-bg text-danger text-sm px-6 py-3">
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
              {loadingUsers && (
                <tr>
                  <td className="px-4 py-3 text-gray-400" colSpan={5}>
                    Memuat user...
                  </td>
                </tr>
              )}
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
            className="bg-white rounded-lg shadow p-6 w-full max-w-md"
            onSubmit={(event) => {
              event.preventDefault()
              resetMutation.mutate()
            }}
          >
            <h2 className="text-lg font-medium text-primary mb-4">
              Reset Password {resetUser.username}
            </h2>
            {resetMutation.error && (
              <div className="bg-danger-bg text-danger text-sm rounded px-3 py-2 mb-4">
                {errorMessage(resetMutation.error)}
              </div>
            )}
            <label className="block mb-3">
              <span className="block text-sm text-primary-dark mb-1">Password Baru</span>
              <input
                required
                type="password"
                className="input"
                value={resetPassword}
                onChange={(event) => setResetPassword(event.target.value)}
              />
            </label>
            <label className="block mb-4">
              <span className="block text-sm text-primary-dark mb-1">Konfirmasi Password</span>
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
                className="border border-border rounded px-4 py-2 text-sm text-primary-dark"
                onClick={() => setResetUser(null)}
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={resetMutation.isPending}
                className="bg-primary text-white rounded px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {resetMutation.isPending ? 'Menyimpan...' : 'Reset Password'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
