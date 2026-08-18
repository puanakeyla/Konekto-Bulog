import { useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from '../lib/toast'
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
  const [page, setPage] = useState(1)
  const { data: usersResult, isLoading: loadingUsers } = useAdminUsers(page, 10)
  const { data: roles, isLoading: loadingRoles } = useAdminRoles()
  const queryClient = useQueryClient()
  const users = usersResult?.items ?? []
  const meta = usersResult?.meta

  const [form, setForm] = useState<UserForm>(emptyForm)
  const [editing, setEditing] = useState<AdminUser | null>(null)
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importInputKey, setImportInputKey] = useState(0)
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
      if (!editing) setPage(1)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (target: AdminUser) => api.delete(`/api/admin/users/${target.id}`),
    onSuccess: (_data, target) => {
      toast.success(`User ${target.username} dihapus.`)
      setPage((prev) => Math.max(1, prev))
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
    },
    onError: (err) => toast.error(errorMessage(err)),
  })

  // Beri jatah perbaikan data terkunci milik satu user. Dipakai saat petugas salah input
  // (mis. foto keliru): admin menentukan BERAPA KALI simpan yang diizinkan, user memperbaiki
  // bagiannya sendiri, dan jatahnya berkurang tiap penyimpanan sampai habis. `sisa: 0`
  // mengunci kembali seketika.
  const aksesMutation = useMutation({
    mutationFn: ({ target, sisa }: { target: AdminUser; sisa: number }) =>
      api.patch(`/api/admin/users/${target.id}/akses-edit`, { sisa }),
    onSuccess: (_data, { target, sisa }) => {
      toast.success(sisa > 0
        ? `${target.username} diberi jatah ${sisa} kali simpan.`
        : `Akses edit ${target.username} dikunci.`)
      queryClient.invalidateQueries({ queryKey: ['admin-users'] })
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
      setPage(1)
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
            className="grid gap-4 @md:grid-cols-[minmax(0,1fr)_auto] @md:items-end"
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
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Nama Mitra/Gudang</th>
                  <th className="px-5 py-3 text-xs font-bold uppercase tracking-wide">Status</th>
                  <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wide">Jatah Edit Rekap</th>
                  <th className="px-5 py-3 text-center text-xs font-bold uppercase tracking-wide">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border bg-white">
                {loadingUsers && Array.from({ length: 4 }, (_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-4" colSpan={6}><Skeleton className="h-4 w-full" /></td>
                  </tr>
                ))}
                {!loadingUsers && users.length === 0 && (
                  <tr>
                    <td className="px-5 py-4 text-gray-400" colSpan={6}>
                      Belum ada user.
                    </td>
                  </tr>
                )}
                {users.map((target) => {
                  const aksesTerbuka = target.akses_edit_sisa > 0
                  const isAdminRow = target.role.nama_role === 'admin'

                  return (
                  // Baris ditandai merah selama akses perbaikan masih terbuka, supaya yang
                  // lupa dikunci kelihatan sekali lihat.
                  <tr key={target.id} className={aksesTerbuka ? 'bg-danger-bg/60' : 'transition-colors hover:bg-surface'}>
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
                      <JatahEditAkses
                        target={target}
                        isAdminRow={isAdminRow}
                        isPending={aksesMutation.isPending}
                        onSimpan={(sisa) => aksesMutation.mutate({ target, sisa })}
                      />
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex justify-center gap-2">
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
                            if (window.confirm(`Hapus user ${target.username}? Riwayat transaksi tetap tersimpan.`)) {
                              deleteMutation.mutate(target)
                            }
                          }}
                        >
                          Hapus
                        </button>
                      </div>
                    </td>
                  </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          {meta && meta.last_page > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-white px-5 py-4 text-sm text-muted">
              <span>Menampilkan {meta.from ?? 0}-{meta.to ?? 0} dari {meta.total} user</span>
              <div className="flex items-center gap-2">
                <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((prev) => Math.max(1, prev - 1))}>Sebelumnya</button>
                <span className="badge">Halaman {meta.current_page}/{meta.last_page}</span>
                <button className="btn btn-ghost" disabled={page >= meta.last_page} onClick={() => setPage((prev) => prev + 1)}>Berikutnya</button>
              </div>
            </div>
          )}
        </section>
      </div>
      </div>
    </div>
  )
}

/**
 * Jatah edit rekap: berapa kali user boleh menyimpan perbaikan data yang sudah terkunci.
 * Dulu ini saklar sekali pakai -- satu koreksi lalu terkunci lagi -- padahal petugas yang
 * salah input biasanya punya beberapa baris yang harus dibenahi sekaligus.
 *
 * Angkanya bebas diketik (backend membatasi 0-99); tombol pintas 1/3/5 ada karena itulah
 * yang dipakai sehari-hari.
 */
function JatahEditAkses({
  target,
  isAdminRow,
  isPending,
  onSimpan,
}: {
  target: AdminUser
  isAdminRow: boolean
  isPending: boolean
  onSimpan: (sisa: number) => void
}) {
  const [draft, setDraft] = useState('3')

  if (isAdminRow) {
    return <p className="text-center text-xs text-gray-400">Akses penuh</p>
  }

  const jumlah = Math.min(99, Math.max(1, Number(draft) || 1))

  return (
    <div className="flex flex-col items-center gap-2">
      {target.akses_edit_sisa > 0 && (
        <span className="inline-flex rounded-full bg-danger-bg px-2.5 py-1 text-xs font-bold text-danger">
          Sisa {target.akses_edit_sisa}x simpan
        </span>
      )}
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          min={1}
          max={99}
          aria-label={`Jumlah perubahan untuk ${target.username}`}
          className="input h-8 w-16 px-2 py-1 text-center text-xs"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
        />
        <button
          type="button"
          disabled={isPending}
          title={`Izinkan ${target.username} menyimpan ${jumlah} kali perbaikan pada data tahapnya sendiri`}
          className="rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-bold text-primary-dark transition-colors hover:border-primary hover:bg-primary-tint disabled:cursor-not-allowed disabled:opacity-50"
          onClick={() => onSimpan(jumlah)}
        >
          Beri Akses
        </button>
        {target.akses_edit_sisa > 0 && (
          <button
            type="button"
            disabled={isPending}
            title="Kunci kembali sekarang, sisa jatah hangus"
            className="rounded-lg border border-danger bg-danger px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-danger/90 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={() => onSimpan(0)}
          >
            Kunci
          </button>
        )}
      </div>
    </div>
  )
}
