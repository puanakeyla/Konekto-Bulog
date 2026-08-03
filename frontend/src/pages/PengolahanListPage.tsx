import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import { useMakloonOptions } from '../hooks/useMakloonOptions'
import {
  LABEL_TAHAP,
  usePengolahanList,
  usePengolahanMutations,
  type PengolahanItem,
  type SkemaPengolahan,
} from '../hooks/usePengolahan'
import { pesanError } from '../lib/pesanError'
import { SkeletonTable } from '../components/Skeleton'

/** Role yang boleh memulai rantai, beserta skema yang jadi tanggung jawabnya. */
const SKEMA_PEMBUAT: Record<string, SkemaPengolahan> = { gudang: 'GDG', ub_jastasma: 'UBJ' }

function SkemaBadge({ skema }: { skema: SkemaPengolahan }) {
  const cls = skema === 'GDG' ? 'bg-primary-tint text-primary' : 'bg-warning-bg text-warning'
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{skema}</span>
}

function StatusBadge({ row }: { row: PengolahanItem }) {
  if (row.status_keseluruhan === 'selesai') return <span className="badge badge-success">Selesai</span>

  const data = row.current_stage === 'gudang' ? row.data_gudang : row.current_stage === 'ub_jastasma' ? row.data_lhpk : null

  // Tahap operasi & pengadaan bekerja di level MO, jadi tidak punya status per baris.
  if (row.current_stage === 'operasi') return <span className="badge">Menunggu digabung MO</span>
  if (row.current_stage === 'pengadaan') return <span className="badge badge-warning">MO di Pengadaan</span>

  if (data?.status === 'ditolak') return <span className="badge badge-danger">Perlu diperbaiki</span>
  if (data?.status === 'menunggu_review') return <span className="badge badge-warning">Perlu dicek</span>
  if (data?.status === 'draft') return <span className="badge">Draft</span>
  return <span className="badge">Perlu diisi</span>
}

export default function PengolahanListPage() {
  const { user } = useAuth()
  const role = user?.role.nama_role ?? ''
  const [page, setPage] = useState(1)
  const [skema, setSkema] = useState<SkemaPengolahan | 'semua'>('semua')
  const [antrean, setAntrean] = useState(role !== 'admin')
  const [search, setSearch] = useState('')
  const [makloonBaru, setMakloonBaru] = useState('')

  const { data, isLoading } = usePengolahanList({ page, skema, antrean, search })
  const { data: makloonOptions } = useMakloonOptions()
  const { buat } = usePengolahanMutations()

  const skemaSaya = SKEMA_PEMBUAT[role]
  const bolehBuat = !!skemaSaya || role === 'admin'
  const rows = data?.data ?? []

  const buatBaru = (e: React.FormEvent) => {
    e.preventDefault()
    const skemaDipakai = skemaSaya ?? 'GDG'

    buat.mutate(
      { skema: skemaDipakai, makloon_user_id: Number(makloonBaru) },
      {
        onSuccess: (item) => {
          toast.success(`Pengolahan ${item.id_pengolahan} dibuat.`)
          setMakloonBaru('')
        },
        onError: (err) => toast.error(pesanError(err)),
      },
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8">
      <div className="mb-6">
        <h1 className="section-title">Alur Pengolahan</h1>
        <p className="page-subtitle">
          Rantai hasil olah: Gudang, UB Jastasma, Operasi, lalu Pengadaan menerbitkan Nomor OUT.
        </p>
      </div>

      {bolehBuat && (
        <form onSubmit={buatBaru} className="panel panel-pad mb-6 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <label className="label" htmlFor="makloon">
              Makloon {skemaSaya && <span className="text-muted">— skema {skemaSaya}</span>}
            </label>
            <select
              id="makloon"
              className="input"
              value={makloonBaru}
              onChange={(e) => setMakloonBaru(e.target.value)}
              required
            >
              <option value="">Pilih makloon...</option>
              {(makloonOptions ?? []).map((item) => (
                <option key={item.id} value={item.id}>{item.nama_maklon}</option>
              ))}
            </select>
          </div>
          <button type="submit" className="btn btn-primary" disabled={buat.isPending || !makloonBaru}>
            Mulai pengolahan
          </button>
        </form>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg bg-primary-tint p-1 text-xs font-semibold text-primary">
          {(['semua', 'GDG', 'UBJ'] as const).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setSkema(item); setPage(1) }}
              className={'rounded px-4 py-2 ' + (skema === item ? 'bg-white shadow-sm' : 'hover:bg-white/60')}
            >
              {item === 'semua' ? 'Semua' : item}
            </button>
          ))}
        </div>

        {role !== 'admin' && (
          <label className="flex items-center gap-2 text-xs font-semibold text-slate-600">
            <input type="checkbox" checked={antrean} onChange={(e) => { setAntrean(e.target.checked); setPage(1) }} />
            Hanya giliran saya
          </label>
        )}

        <input
          className="input ml-auto max-w-xs bg-white"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1) }}
          placeholder="Cari ID, makloon, No. LHPK"
        />
      </div>

      {isLoading && <SkeletonTable />}
      {!isLoading && rows.length === 0 && (
        <div className="panel px-4 py-3 text-sm text-gray-400">Tidak ada pengolahan untuk filter ini.</div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="panel overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-primary-tint text-left text-primary-dark">
              <tr>
                <th className="px-4 py-2">ID Pengolahan</th>
                <th className="px-4 py-2">Skema</th>
                <th className="px-4 py-2">Makloon</th>
                <th className="px-4 py-2">Tahap</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">No. LHPK</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id_pengolahan} className="border-t border-border">
                  <td className="px-4 py-2 font-medium text-primary-dark">{row.id_pengolahan}</td>
                  <td className="px-4 py-2"><SkemaBadge skema={row.skema} /></td>
                  <td className="px-4 py-2 text-gray-600">{row.makloon?.nama_maklon ?? '-'}</td>
                  <td className="px-4 py-2 text-gray-600">{LABEL_TAHAP[row.current_stage]}</td>
                  <td className="px-4 py-2"><StatusBadge row={row} /></td>
                  <td className="px-4 py-2 text-gray-600">{row.data_lhpk?.no_lhpk ?? '-'}</td>
                  <td className="px-4 py-2 text-right">
                    <Link
                      to={`/pengolahan/${encodeURIComponent(row.id_pengolahan)}`}
                      className="font-medium text-primary hover:underline"
                    >
                      Lihat
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data && data.last_page > 1 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span>Menampilkan {data.from ?? 0}-{data.to ?? 0} dari {data.total}</span>
          <div className="flex gap-2">
            <button className="btn btn-ghost" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>Sebelumnya</button>
            <span className="badge">Halaman {data.current_page}/{data.last_page}</span>
            <button className="btn btn-ghost" disabled={page >= data.last_page} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
          </div>
        </div>
      )}
    </div>
  )
}
