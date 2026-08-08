import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../hooks/useAuth'
import {
  LABEL_TAHAP,
  usePengolahanList,
  usePengolahanMutations,
  type PengolahanItem,
  type SkemaPengolahan,
} from '../hooks/usePengolahan'
import { pesanError } from '../lib/pesanError'
import { KERJAAN_KETERANGAN, KERJAAN_LABEL, KERJAAN_URUT, type KerjaanId } from '../lib/kerjaanTransaksi'
import { SkeletonTable } from '../components/Skeleton'
import MakloonCombobox from '../components/MakloonCombobox'

/** Role yang boleh memulai rantai, beserta skema yang jadi tanggung jawabnya. */
const SKEMA_PEMBUAT: Record<string, SkemaPengolahan> = { gudang: 'GDG', ub_jastasma: 'UBJ' }

type MakloonGroup = { nama: string; rows: PengolahanItem[]; gdg: number; ubj: number }

/**
 * Pengelompokan dilakukan atas baris HALAMAN INI, sama seperti Dashboard SerGab: pengurutan &
 * paginasi tetap milik server, kartu makloon hanya cara membacanya.
 */
function groupByMakloon(items: PengolahanItem[]): MakloonGroup[] {
  const map = new Map<string, MakloonGroup>()
  for (const row of items) {
    const nama = row.makloon?.nama_maklon ?? 'Tanpa makloon'
    let group = map.get(nama)
    if (!group) {
      group = { nama, rows: [], gdg: 0, ubj: 0 }
      map.set(nama, group)
    }
    group.rows.push(row)
    if (row.skema === 'GDG') group.gdg += 1
    else group.ubj += 1
  }
  return Array.from(map.values()).sort((a, b) => a.nama.localeCompare(b.nama, 'id'))
}

// Inisial 2 huruf, mengabaikan prefix "Makloon" (mis. "Makloon Sinar Jaya" -> "SJ").
function inisialMakloon(nama: string) {
  const kata = nama.replace(/^makloon\s+/i, '').trim().split(/\s+/).filter(Boolean)
  const dua = (kata[0]?.[0] ?? '') + (kata[1]?.[0] ?? kata[0]?.[1] ?? '')
  return (dua || nama.slice(0, 2)).toUpperCase()
}

function SkemaBadge({ skema }: { skema: SkemaPengolahan }) {
  const cls = skema === 'GDG' ? 'bg-primary-tint text-primary' : 'bg-warning-bg text-warning'
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{skema}</span>
}

function SkemaCount({ skema, count }: { skema: SkemaPengolahan; count: number }) {
  const cls = skema === 'GDG' ? 'bg-primary-tint text-primary' : 'bg-warning-bg text-warning'
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${cls}`}>{count} {skema}</span>
}

/** Chip filter antrean, dengan jumlah supaya terlihat mana yang menumpuk tanpa perlu diklik. */
function KerjaanChip({ label, jumlah, aktif, onClick }: { label: string; jumlah: number; aktif: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={aktif}
      className={`inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors ${aktif ? 'border-primary bg-primary text-white' : 'border-border bg-white text-slate-600 hover:border-primary/40 hover:text-primary'}`}
    >
      {label}
      <span className={`rounded-full px-1.5 py-0.5 text-[0.65rem] ${aktif ? 'bg-white/20' : 'bg-surface text-slate-500'}`}>{jumlah}</span>
    </button>
  )
}

const KERJAAN_CLS: Record<KerjaanId, string> = {
  periksa: 'badge badge-warning',
  isi: 'badge',
  draft: 'badge',
  ditolak: 'badge badge-danger',
}

/**
 * Badge memakai klasifikasi yang sama dengan chip (dihitung server). Dulu status di sini
 * diturunkan ulang dari kolom tahap, sehingga baris bisa berbadge "Menunggu digabung MO"
 * padahal ia terhitung di chip "Perlu dicek" -- satu badge = satu chip, tanpa kecuali.
 */
function StatusBadge({ row }: { row: PengolahanItem }) {
  if (row.status_keseluruhan === 'selesai') return <span className="badge badge-success">Selesai</span>
  if (!row.kerjaan) return <span className="badge">Berjalan</span>

  return (
    <span className={KERJAAN_CLS[row.kerjaan]} title={KERJAAN_KETERANGAN[row.kerjaan]}>
      {KERJAAN_LABEL[row.kerjaan]}
    </span>
  )
}

export default function PengolahanListPage() {
  const { user } = useAuth()
  const role = user?.role.nama_role ?? ''
  const [page, setPage] = useState(1)
  const [skema, setSkema] = useState<SkemaPengolahan | 'semua'>('semua')
  const [antrean, setAntrean] = useState(role !== 'admin')
  const [search, setSearch] = useState('')
  const [kerjaanFilter, setKerjaanFilter] = useState<KerjaanId | 'semua'>('semua')
  const [makloonBaru, setMakloonBaru] = useState<number | null>(null)

  const { data, isLoading } = usePengolahanList({ page, skema, antrean, search, kerjaan: kerjaanFilter })
  const { buat } = usePengolahanMutations()

  const skemaSaya = SKEMA_PEMBUAT[role]
  const bolehBuat = !!skemaSaya || role === 'admin'
  const rows = data?.data ?? []
  const hitung = data?.kerjaan_hitung
  const groups = groupByMakloon(rows)
  const tampilChip = KERJAAN_URUT.filter((id) => (hitung?.[id] ?? 0) > 0 || kerjaanFilter === id)

  const buatBaru = (e: React.FormEvent) => {
    e.preventDefault()
    if (!makloonBaru) return

    const skemaDipakai = skemaSaya ?? 'GDG'

    buat.mutate(
      { skema: skemaDipakai, makloon_user_id: makloonBaru },
      {
        onSuccess: (item) => {
          toast.success(`Pengolahan ${item.id_pengolahan} dibuat.`)
          setMakloonBaru(null)
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
            <MakloonCombobox value={makloonBaru} onChange={setMakloonBaru} reserveSpaceWhenOpen />
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

      {/* Angka chip datang dari server untuk SELURUH daftar -- kalau dihitung dari `rows`, ia
          hanya mencerminkan halaman yang kebetulan terbuka.
          Kategori kosong disembunyikan: chip bernilai 0 tidak bisa diapa-apakan, cuma bikin ramai.
          Chip yang sedang aktif tetap dirender walau jadi 0, kalau tidak filternya hilang sendiri
          dan tabel kosong tanpa jalan kembali. */}
      {tampilChip.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <KerjaanChip
            label="Semua"
            jumlah={hitung?.total ?? 0}
            aktif={kerjaanFilter === 'semua'}
            onClick={() => { setKerjaanFilter('semua'); setPage(1) }}
          />
          {tampilChip.map((id) => (
            <KerjaanChip
              key={id}
              label={KERJAAN_LABEL[id]}
              jumlah={hitung?.[id] ?? 0}
              aktif={kerjaanFilter === id}
              onClick={() => { setKerjaanFilter(id); setPage(1) }}
            />
          ))}
        </div>
      )}
      {kerjaanFilter !== 'semua' && <p className="page-subtitle mb-3">{KERJAAN_KETERANGAN[kerjaanFilter]}</p>}

      {isLoading && <SkeletonTable />}
      {!isLoading && rows.length === 0 && (
        <div className="panel px-4 py-3 text-sm text-gray-400">Tidak ada pengolahan untuk filter ini.</div>
      )}

      {!isLoading && rows.length > 0 && (
        <div className="space-y-3">
          {groups.map((group) => (
            <details key={group.nama} className="group panel overflow-hidden">
              <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
                <span className="grid h-[34px] w-[34px] shrink-0 place-items-center rounded-lg bg-primary-tint text-xs font-bold text-primary transition-colors group-open:bg-primary group-open:text-white">
                  {inisialMakloon(group.nama)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-primary-dark">{group.nama}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {group.gdg > 0 && <SkemaCount skema="GDG" count={group.gdg} />}
                  {group.ubj > 0 && <SkemaCount skema="UBJ" count={group.ubj} />}
                  <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-90"><path d="M7 5l6 5-6 5V5z" /></svg>
                </div>
              </summary>
              <div className="overflow-x-auto border-t border-border bg-surface">
                <table className="w-full text-sm">
                  <thead className="text-left text-[0.68rem] font-bold uppercase tracking-wide text-muted">
                    <tr>
                      <th className="py-2 pl-4 pr-4 sm:pl-16">ID Pengolahan</th>
                      <th className="px-4">Skema</th>
                      <th className="px-4">Tahap</th>
                      <th className="px-4">Status</th>
                      <th className="px-4">No. LHPK</th>
                      <th className="px-4"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {group.rows.map((row) => (
                      <tr key={row.id_pengolahan} className="border-t border-border">
                        <td className="py-2 pl-4 pr-4 font-medium text-primary-dark sm:pl-16">{row.id_pengolahan}</td>
                        <td className="px-4 py-2"><SkemaBadge skema={row.skema} /></td>
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
            </details>
          ))}
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
