import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import api from '../lib/api'
import { SkeletonMakloonGroups, SkeletonSebaranTahap } from '../components/Skeleton'

type StageCount = { stage: string; label: string; total: number }
type SebaranTahap = { skema: 'TJP' | 'MPP'; stages: StageCount[] }
type MakloonRow = {
  id: number
  nama_maklon: string | null
  kecamatan: string | null
  kabupaten: string | null
  is_active: boolean
  transaksi_aktif: { TJP: number; MPP: number }
}
type MakloonGroup = { wilayah: string; total_makloon: number; makloon: MakloonRow[] }
type SkemaFilter = 'semua' | 'TJP' | 'MPP'

export default function MonitoringPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<SkemaFilter>('semua')

  const { data: sebaran, isLoading: loadingSebaran } = useQuery({
    queryKey: ['monitoring-sebaran-tahap'],
    queryFn: async () => {
      const { data } = await api.get<{ data: SebaranTahap[] }>('/api/monitoring/sebaran-tahap')
      return data.data
    },
  })

  const { data: makloonGroups, isLoading: loadingMakloon } = useQuery({
    queryKey: ['monitoring-makloon', search],
    queryFn: async () => {
      const { data } = await api.get<{ data: MakloonGroup[] }>('/api/monitoring/makloon', { params: { q: search || undefined } })
      return data.data
    },
  })

  const maxStageTotal = useMemo(() => Math.max(1, ...((sebaran ?? []).flatMap((item) => item.stages.map((stage) => stage.total)))), [sebaran])
  const filteredGroups = useMemo(
    () => (makloonGroups ?? []).map((group) => ({
      ...group,
      makloon: group.makloon.filter((item) => filter === 'semua' || item.transaksi_aktif[filter] > 0),
    })).filter((group) => group.makloon.length > 0),
    [makloonGroups, filter],
  )

  return (
    <div className="page-shell">
      <div className="page-container">
        <header className="page-header">
          <div>
            <h1 className="page-title">Monitoring SERGAB</h1>
            <p className="page-subtitle">Sebaran transaksi aktif per tahap dan daftar makloon berdasarkan wilayah.</p>
          </div>
          <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
        </header>

        <div className="work-layout">
          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">Sebaran Tahap Saat Ini</h2><p className="page-subtitle">Data tersambung ke GET /api/monitoring/sebaran-tahap.</p></div>
            </div>
            {loadingSebaran && <SkeletonSebaranTahap />}
            <div className="grid gap-4 lg:grid-cols-2">
              {(sebaran ?? []).map((item) => (
                <div key={item.skema} className="rounded-lg border border-border p-4">
                  <div className="mb-3 flex items-center justify-between"><h3 className="section-title">Skema {item.skema}</h3><span className="badge">{item.stages.reduce((sum, stage) => sum + stage.total, 0)} aktif</span></div>
                  <div className="space-y-3">
                    {item.stages.map((stage) => (
                      <div key={stage.stage}>
                        <div className="mb-1 flex justify-between gap-3 text-xs"><span className="font-semibold text-primary-dark">{stage.label}</span><span>{stage.total}</span></div>
                        <div className="h-2 rounded bg-primary-tint"><div className="h-2 rounded bg-primary" style={{ width: `${Math.max(4, (stage.total / maxStageTotal) * 100)}%` }} /></div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div><h2 className="section-title">Makloon Terdaftar</h2><p className="page-subtitle">Data tersambung ke GET /api/monitoring/makloon.</p></div>
              <div className="flex flex-wrap gap-2">
                {(['semua', 'TJP', 'MPP'] as const).map((item) => <button key={item} className={`btn ${filter === item ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(item)}>{item === 'semua' ? 'Semua' : item}</button>)}
              </div>
            </div>
            <input className="input mb-4" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Cari nama makloon" />
            {loadingMakloon && <SkeletonMakloonGroups />}
            {!loadingMakloon && filteredGroups.length === 0 && <div className="empty-state"><div className="empty-title">Tidak ada makloon sesuai filter</div></div>}
            <div className="space-y-4">
              {filteredGroups.map((group) => (
                <details key={group.wilayah} className="rounded-lg border border-border bg-white" open>
                  <summary className="cursor-pointer px-4 py-3 text-sm font-bold text-primary-dark">{group.wilayah} ({group.makloon.length} makloon)</summary>
                  <div className="data-table-wrap mx-4 mb-4">
                    <table className="data-table">
                      <thead><tr><th>Nama Makloon</th><th>Kecamatan</th><th>Status</th><th className="text-right">TJP Aktif</th><th className="text-right">MPP Aktif</th></tr></thead>
                      <tbody>
                        {group.makloon.map((item) => (
                          <tr key={item.id}>
                            <td className="font-semibold text-primary-dark">{item.nama_maklon ?? '-'}</td>
                            <td>{item.kecamatan ?? '-'}</td>
                            <td><span className={`badge ${item.is_active ? 'badge-success' : 'badge-danger'}`}>{item.is_active ? 'Aktif' : 'Nonaktif'}</span></td>
                            <td className="text-right">{item.transaksi_aktif.TJP}</td>
                            <td className="text-right">{item.transaksi_aktif.MPP}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
