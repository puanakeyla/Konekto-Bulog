import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { useAuth } from '../hooks/useAuth'
import { SkeletonTable } from '../components/Skeleton'
import FormHero from '../components/FormHero'

type AuditLog = {
  id: number
  transaksi_id: string | null
  user_id: number | null
  username: string | null
  role: string | null
  aksi: string
  detail: Record<string, unknown> | null
  created_at: string
}

type Paginated<T> = {
  data: T[]
  meta: {
    current_page: number
    last_page: number
  }
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

function labelAksi(value: string) {
  return value.replaceAll('_', ' ')
}

export default function AdminAuditLogPage() {
  const { user } = useAuth()
  const [page, setPage] = useState(1)
  const [transaksiId, setTransaksiId] = useState('')
  const [aksi, setAksi] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin-audit-logs', page, transaksiId, aksi],
    queryFn: async () => {
      const res = await api.get<Paginated<AuditLog>>('/api/admin/audit-logs', {
        params: {
          page,
          per_page: 20,
          ...(transaksiId.trim() ? { transaksi_id: transaksiId.trim() } : {}),
          ...(aksi.trim() ? { aksi: aksi.trim() } : {}),
        },
      })
      return res.data
    },
  })

  if (user?.role.nama_role !== 'admin') return <Navigate to="/" replace />

  const logs = data?.data ?? []
  const currentPage = data?.meta.current_page ?? page
  const lastPage = data?.meta.last_page ?? 1

  return (
    <div className="min-h-screen bg-surface">
      <FormHero title="Audit Log" subtitle="Jejak aksi penting di alur transaksi dan administrasi." badge="Administrator" />

      <div className="relative mx-auto -mt-16 max-w-6xl px-6 pb-16">
        <section className="panel panel-pad mb-6 @container">
          <div className="grid gap-4 @md:grid-cols-[1fr_220px_auto] @md:items-end">
            <label className="block">
              <span className="label">ID Transaksi</span>
              <input className="input" placeholder="00001/07/2026/TJP" value={transaksiId} onChange={(event) => { setPage(1); setTransaksiId(event.target.value) }} />
            </label>
            <label className="block">
              <span className="label">Aksi</span>
              <input className="input" placeholder="tolak" value={aksi} onChange={(event) => { setPage(1); setAksi(event.target.value) }} />
            </label>
            <button type="button" className="btn btn-ghost" onClick={() => { setPage(1); setTransaksiId(''); setAksi('') }}>
              Reset
            </button>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="border-b border-border p-6">
            <h2 className="section-title">Daftar Audit</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-primary-tint text-left text-primary-dark">
                <tr>
                  <th className="px-4 py-2">Waktu</th>
                  <th className="px-4 py-2">Aksi</th>
                  <th className="px-4 py-2">Transaksi</th>
                  <th className="px-4 py-2">User</th>
                  <th className="px-4 py-2">Detail</th>
                </tr>
              </thead>
              <tbody>
                {isLoading && <tr><td className="px-4 py-3" colSpan={5}><SkeletonTable rows={5} /></td></tr>}
                {!isLoading && logs.length === 0 && <tr><td className="px-4 py-4 text-gray-400" colSpan={5}>Belum ada audit log.</td></tr>}
                {logs.map((log) => (
                  <tr key={log.id} className="border-t border-border align-top">
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDateTime(log.created_at)}</td>
                    <td className="px-4 py-3 font-semibold capitalize text-primary-dark">{labelAksi(log.aksi)}</td>
                    <td className="px-4 py-3 font-medium">{log.transaksi_id ?? '-'}</td>
                    <td className="px-4 py-3">{log.username ?? `User #${log.user_id ?? '-'}`}<div className="text-xs text-gray-500">{log.role ?? '-'}</div></td>
                    <td className="px-4 py-3"><pre className="max-w-md whitespace-pre-wrap rounded bg-surface p-2 text-xs text-gray-700">{JSON.stringify(log.detail ?? {}, null, 2)}</pre></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-border px-6 py-4 text-sm">
            <span className="text-gray-500">Halaman {currentPage} dari {lastPage}</span>
            <div className="flex gap-2">
              <button className="btn btn-ghost" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Sebelumnya</button>
              <button className="btn btn-primary" disabled={currentPage >= lastPage} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
