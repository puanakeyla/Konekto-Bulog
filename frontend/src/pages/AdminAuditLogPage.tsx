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

// ---- Peta label ramah-awam ------------------------------------------------

const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrator',
  jemput_pangan: 'Jemput Pangan',
  makloon: 'Makloon',
  ub_jastasma: 'UB Jastasma',
  pengadaan: 'Pengadaan',
  keuangan: 'Keuangan',
  operasi: 'Operasi',
  gudang: 'Gudang',
}

const STAGE_LABELS: Record<string, string> = {
  jemput_pangan: 'Jemput Pangan',
  makloon: 'Makloon',
  ub_jastasma: 'UB Jastasma',
  pengadaan: 'Pengadaan',
  keuangan: 'Keuangan',
  operasi: 'Operasi',
  gudang: 'Gudang',
}

// Label grup (level-1 pada snapshot rekap) untuk memperjelas asal field pada diff.
const GROUP_LABELS: Record<string, string> = {
  data_jemput_pangan: 'Jemput Pangan',
  data_makloon_tjp: 'Makloon',
  data_makloon_mpp: 'Makloon',
  data_ub_jastasma: 'UB Jastasma',
  data_pengadaan: 'Pengadaan',
  before: '',
  after: '',
}

const FIELD_LABELS: Record<string, string> = {
  id_pemasok: 'ID Pemasok',
  supir: 'Supir',
  plat_mobil: 'Plat Mobil',
  nama_poktan_gapoktan: 'Poktan/Gapoktan',
  desa: 'Desa',
  kecamatan: 'Kecamatan',
  kabupaten: 'Kabupaten',
  makloon_user_id: 'Makloon (ID)',
  tanggal_kirim: 'Tanggal Kirim',
  kuantum: 'Kuantum (kg)',
  jarak_ke_makloon_km: 'Jarak (km)',
  tanggal_bongkar: 'Tanggal Bongkar',
  kuantum_bongkar: 'Kuantum Bongkar (kg)',
  ka1: 'KA1',
  ka2: 'KA2',
  ka3: 'KA3',
  hampa: 'Hampa',
  butir_hijau: 'Butir Hijau',
  no_po: 'No. PO',
  no_in: 'No. IN',
  harga: 'Harga/kg',
  total_harga: 'Total Harga',
  no_spp: 'No. SPP',
  tanggal_bayar: 'Tanggal Bayar',
  status: 'Status',
  status_bayar: 'Status Bayar',
  current_stage: 'Tahap Saat Ini',
  status_keseluruhan: 'Status Keseluruhan',
  skema: 'Skema',
  id_transaksi: 'ID Transaksi',
  username: 'Username',
  role_id: 'Role (ID)',
  nama_maklon: 'Nama Makloon',
  nama_gudang: 'Nama Gudang',
  is_active: 'Status Aktif',
}

// ---- Kategori aksi (warna tag) --------------------------------------------

type Kategori = 'isi' | 'terima' | 'tolak' | 'ubah' | 'buat' | 'hapus' | 'bayar' | 'gabung' | 'impor' | 'lain'

const KATEGORI_STYLE: Record<Kategori, { tag: string; kelas: string }> = {
  isi: { tag: 'Isi Data', kelas: 'bg-amber-50 text-amber-700 ring-amber-200' },
  terima: { tag: 'Terima', kelas: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  tolak: { tag: 'Tolak', kelas: 'bg-rose-50 text-rose-700 ring-rose-200' },
  ubah: { tag: 'Ubah', kelas: 'bg-sky-50 text-sky-700 ring-sky-200' },
  buat: { tag: 'Buat', kelas: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  hapus: { tag: 'Hapus', kelas: 'bg-rose-50 text-rose-700 ring-rose-200' },
  bayar: { tag: 'Bayar', kelas: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  gabung: { tag: 'Gabung PO', kelas: 'bg-indigo-50 text-indigo-700 ring-indigo-200' },
  impor: { tag: 'Impor', kelas: 'bg-violet-50 text-violet-700 ring-violet-200' },
  lain: { tag: 'Aktivitas', kelas: 'bg-slate-100 text-slate-600 ring-slate-200' },
}

function d(detail: Record<string, unknown> | null, key: string): string {
  const value = detail?.[key]
  return value === null || value === undefined ? '' : String(value)
}

function stageLabel(value: string) {
  return STAGE_LABELS[value] ?? value.replaceAll('_', ' ')
}

function roleLabel(value: string | null) {
  if (!value) return '-'
  return ROLE_LABELS[value] ?? value.replaceAll('_', ' ')
}

type AksiConfig = {
  kategori: Kategori
  // Label singkat untuk dropdown filter.
  label: string
  // Kalimat lengkap untuk feed.
  kalimat: (log: AuditLog) => string
}

const AKSI_CONFIG: Record<string, AksiConfig> = {
  submit_stage: {
    kategori: 'isi',
    label: 'Isi & kirim data tahap',
    kalimat: (log) => `Mengisi & mengirim data tahap ${stageLabel(d(log.detail, 'stage'))}`,
  },
  terima: {
    kategori: 'terima',
    label: 'Terima tahap',
    kalimat: (log) => `Menerima & mengunci data tahap ${stageLabel(d(log.detail, 'stage'))}`,
  },
  tolak: {
    kategori: 'tolak',
    label: 'Tolak tahap',
    kalimat: (log) => `Menolak data tahap ${stageLabel(d(log.detail, 'stage'))} dan mengembalikannya untuk revisi`,
  },
  terima_po: {
    kategori: 'terima',
    label: 'Setujui PO',
    kalimat: () => 'Menyetujui PO',
  },
  tolak_po: {
    kategori: 'tolak',
    label: 'Tolak PO',
    kalimat: () => 'Menolak PO dan mengembalikannya untuk revisi',
  },
  gabungkan_po: {
    kategori: 'gabung',
    label: 'Gabungkan PO',
    kalimat: (log) => `Menggabungkan transaksi menjadi PO ${d(log.detail, 'no_po') || '(baru)'}`,
  },
  update_po: {
    kategori: 'ubah',
    label: 'Ubah data PO',
    kalimat: (log) => `Mengubah data PO ${d(log.detail, 'no_po') || ''}`.trim(),
  },
  isi_nomor_in: {
    kategori: 'isi',
    label: 'Isi No. IN',
    kalimat: () => 'Mengisi No. IN pada PO',
  },
  update_pembayaran: {
    kategori: 'bayar',
    label: 'Catat pembayaran',
    kalimat: (log) => {
      const spp = d(log.detail, 'no_spp')
      return spp ? `Mencatat pembayaran PO (No. SPP ${spp})` : 'Mencatat pembayaran PO'
    },
  },
  admin_rekap_update: {
    kategori: 'ubah',
    label: 'Edit data transaksi (admin)',
    kalimat: () => 'Mengedit data transaksi terkunci lewat rekap admin',
  },
  admin_rekap_delete: {
    kategori: 'hapus',
    label: 'Hapus transaksi (admin)',
    kalimat: () => 'Menghapus transaksi beserta data tahapnya',
  },
  admin_makloon_import: {
    kategori: 'impor',
    label: 'Impor makloon',
    kalimat: (log) => `Mengimpor data makloon: ${d(log.detail, 'created') || 0} dibuat, ${d(log.detail, 'updated') || 0} diperbarui, ${d(log.detail, 'errors') || 0} gagal`,
  },
  admin_user_create: {
    kategori: 'buat',
    label: 'Buat user',
    kalimat: (log) => `Membuat user "${d(log.detail, 'username')}" (${roleLabel(d(log.detail, 'role') || null)})`,
  },
  admin_user_update: {
    kategori: 'ubah',
    label: 'Ubah user',
    kalimat: (log) => `Mengubah data user${d(log.detail, 'password_changed') === 'true' || log.detail?.password_changed === true ? ' (termasuk reset password)' : ''}`,
  },
  admin_user_reset_password: {
    kategori: 'ubah',
    label: 'Reset password',
    kalimat: (log) => `Mereset password user "${d(log.detail, 'username')}"`,
  },
  admin_user_deactivate: {
    kategori: 'hapus',
    label: 'Nonaktifkan user',
    kalimat: (log) => `Menonaktifkan user "${d(log.detail, 'username')}"`,
  },
}

function configFor(aksi: string): AksiConfig {
  return AKSI_CONFIG[aksi] ?? {
    kategori: 'lain',
    label: aksi.replaceAll('_', ' '),
    kalimat: () => aksi.replaceAll('_', ' '),
  }
}

// ---- Diff Sebelum -> Sesudah ----------------------------------------------

type DiffRow = { label: string; sebelum: string; sesudah: string }

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

// Ratakan objek (maks 1 level nested) jadi peta "grup.field" -> nilai primitif.
function flatten(obj: unknown, prefix = ''): Record<string, unknown> {
  if (!isPlainObject(obj)) return {}
  const hasil: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (isPlainObject(value)) {
      Object.assign(hasil, flatten(value, path))
    } else {
      hasil[path] = value
    }
  }
  return hasil
}

function fieldLabelDariPath(path: string): string {
  const segmen = path.split('.')
  const field = segmen[segmen.length - 1]
  const grupKey = segmen.length > 1 ? segmen[segmen.length - 2] : ''
  const grup = GROUP_LABELS[grupKey]
  const labelField = FIELD_LABELS[field] ?? field.replaceAll('_', ' ')
  return grup ? `${grup} · ${labelField}` : labelField
}

function formatNilai(path: string, value: unknown): string {
  if (value === null || value === undefined || value === '') return '—'
  if (typeof value === 'boolean') return value ? 'Ya' : 'Tidak'
  const field = path.split('.').pop() ?? path
  if (/harga/.test(field) && Number.isFinite(Number(value))) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value))
  }
  if (/^tanggal/.test(field) && /^\d{4}-\d{2}-\d{2}/.test(String(value))) {
    return new Date(String(value)).toLocaleDateString('id-ID')
  }
  return String(value)
}

function hitungDiff(detail: Record<string, unknown> | null): DiffRow[] {
  const before = flatten(detail?.before)
  const after = flatten(detail?.after)
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])]
  const rows: DiffRow[] = []
  for (const key of keys) {
    const sebelum = before[key]
    const sesudah = after[key]
    if (String(sebelum ?? '') === String(sesudah ?? '')) continue
    rows.push({
      label: fieldLabelDariPath(key),
      sebelum: formatNilai(key, sebelum),
      sesudah: formatNilai(key, sesudah),
    })
  }
  return rows
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

// ---- Halaman ---------------------------------------------------------------

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
      <FormHero title="Riwayat Aktivitas" subtitle="Catatan siapa melakukan apa dan kapan — di seluruh alur transaksi dan administrasi." badge="Administrator" />

      <div className="relative mx-auto -mt-16 max-w-4xl px-6 pb-16">
        <section className="panel panel-pad mb-6 @container">
          <div className="grid gap-4 @md:grid-cols-[1fr_240px_auto] @md:items-end">
            <label className="block">
              <span className="label">ID Transaksi</span>
              <input className="input" placeholder="00001/07/2026/TJP" value={transaksiId} onChange={(event) => { setPage(1); setTransaksiId(event.target.value) }} />
            </label>
            <label className="block">
              <span className="label">Jenis aktivitas</span>
              <select className="input" value={aksi} onChange={(event) => { setPage(1); setAksi(event.target.value) }}>
                <option value="">Semua aktivitas</option>
                {Object.entries(AKSI_CONFIG).map(([key, cfg]) => (
                  <option key={key} value={key}>{cfg.label}</option>
                ))}
              </select>
            </label>
            <button type="button" className="btn btn-ghost" onClick={() => { setPage(1); setTransaksiId(''); setAksi('') }}>
              Reset
            </button>
          </div>
        </section>

        <section className="panel overflow-hidden">
          <div className="flex items-center justify-between border-b border-border p-6">
            <h2 className="section-title">Riwayat aktivitas</h2>
            <span className="badge">Halaman {currentPage}/{lastPage}</span>
          </div>

          {isLoading && <div className="p-6"><SkeletonTable rows={6} /></div>}
          {!isLoading && logs.length === 0 && <div className="p-8 text-center text-gray-400">Belum ada aktivitas tercatat.</div>}

          {!isLoading && logs.length > 0 && (
            <ol className="divide-y divide-border">
              {logs.map((log) => <AuditItem key={log.id} log={log} />)}
            </ol>
          )}

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

function AuditItem({ log }: { log: AuditLog }) {
  const [open, setOpen] = useState(false)
  const cfg = configFor(log.aksi)
  const gaya = KATEGORI_STYLE[cfg.kategori]
  const diff = hitungDiff(log.detail)
  const catatan = d(log.detail, 'catatan')
  const siapa = log.username ?? `User #${log.user_id ?? '-'}`

  return (
    <li className="px-6 py-4">
      <div className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <span className={`mt-0.5 inline-flex shrink-0 items-center rounded-md px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-wide ring-1 ring-inset ${gaya.kelas}`}>
          {gaya.tag}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-primary-dark">{cfg.kalimat(log)}</p>

          <p className="mt-0.5 text-xs text-gray-500">
            <span className="font-semibold text-gray-700">{siapa}</span>
            <span className="text-gray-400"> · {roleLabel(log.role)}</span>
            <span className="text-gray-400"> · {formatDateTime(log.created_at)}</span>
            {log.transaksi_id && <span className="text-gray-400"> · {log.transaksi_id}</span>}
          </p>

          {catatan && (
            <p className="mt-2 rounded-md border-l-2 border-rose-300 bg-rose-50/60 px-3 py-1.5 text-xs text-rose-700">
              Catatan: {catatan}
            </p>
          )}

          {diff.length > 0 && (
            <div className="mt-2">
              <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-semibold text-primary hover:underline">
                {open ? 'Sembunyikan perubahan' : `Lihat perubahan (${diff.length} field)`}
              </button>
              {open && (
                <div className="mt-2 overflow-hidden rounded-lg border border-border">
                  <table className="w-full text-xs">
                    <thead className="bg-surface text-left text-gray-500">
                      <tr>
                        <th className="px-3 py-1.5 font-semibold">Field</th>
                        <th className="px-3 py-1.5 font-semibold">Sebelum</th>
                        <th className="px-3 py-1.5 font-semibold">Sesudah</th>
                      </tr>
                    </thead>
                    <tbody>
                      {diff.map((row, i) => (
                        <tr key={i} className="border-t border-border">
                          <td className="px-3 py-1.5 font-medium text-primary-dark">{row.label}</td>
                          <td className="px-3 py-1.5 text-gray-500 line-through decoration-rose-300">{row.sebelum}</td>
                          <td className="px-3 py-1.5 font-semibold text-emerald-700">{row.sesudah}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
