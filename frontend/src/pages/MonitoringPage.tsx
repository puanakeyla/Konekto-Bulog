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

type TitikTren = { bulan: string; label: string; jumlah: number; gabah_diolah: number; beras_hgl: number; rendemen: number }
type MakloonOlahan = { nama_maklon: string; jumlah: number; gabah_diolah: number; beras_hgl: number; rendemen: number }
type MonitoringPengolahan = {
  ringkasan: { berjalan: number; selesai: number; gabah_diolah: number; beras_hgl: number; rendemen: number; susut: number }
  sebaran_tahap: { skema: string; stages: StageCount[] }[]
  tren_bulanan: TitikTren[]
  makloon_teratas: MakloonOlahan[]
}

/**
 * Dua warna seri untuk grafik tren. Bukan token merek mentah: navy #283D73 gagal ambang
 * lightness & chroma sebagai isi grafik (terbaca hampir abu-abu), jadi dipakai turunannya
 * yang lebih terang. Pasangan ini lolos enam pemeriksaan palet, termasuk keterpisahan
 * buta warna (ΔE 24-29) dan kontras >= 3:1 terhadap latar putih.
 */
const WARNA_GABAH = '#4C74CE'
const WARNA_BERAS = '#C4841B'

const angka = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 })
const ribuan = (nilai: number) => (Math.abs(nilai) >= 1000 ? `${angka.format(Math.round(nilai / 1000))} rb` : angka.format(nilai))

const REFRESH_OPTIONS = {
  refetchInterval: 10000,
  refetchIntervalInBackground: true,
  refetchOnWindowFocus: true,
  staleTime: 0,
}

export default function MonitoringPage() {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<SkemaFilter>('semua')

  const { data: sebaran, isLoading: loadingSebaran } = useQuery({
    queryKey: ['monitoring-sebaran-tahap'],
    queryFn: async () => {
      const { data } = await api.get<{ data: SebaranTahap[] }>('/api/monitoring/sebaran-tahap')
      return data.data
    },
    ...REFRESH_OPTIONS,
  })

  const { data: pengolahan, isLoading: loadingPengolahan } = useQuery({
    queryKey: ['monitoring-pengolahan'],
    queryFn: async () => {
      const { data } = await api.get<{ data: MonitoringPengolahan }>('/api/monitoring/pengolahan')
      return data.data
    },
    ...REFRESH_OPTIONS,
  })

  const { data: makloonGroups, isLoading: loadingMakloon } = useQuery({
    queryKey: ['monitoring-makloon', search],
    queryFn: async () => {
      const { data } = await api.get<{ data: MakloonGroup[] }>('/api/monitoring/makloon', { params: { q: search || undefined } })
      return data.data
    },
    ...REFRESH_OPTIONS,
  })

  const maxStageTotal = useMemo(() => Math.max(1, ...((sebaran ?? []).flatMap((item) => item.stages.map((stage) => stage.total)))), [sebaran])
  const filteredGroups = useMemo(
    () => (makloonGroups ?? [])
      .map((group) => ({
        ...group,
        makloon: group.makloon.filter((item) => filter === 'semua' || item.transaksi_aktif[filter] > 0),
      }))
      .filter((group) => group.makloon.length > 0),
    [makloonGroups, filter],
  )

  return (
    <div className="page-shell">
      <div className="page-container">
        <header className="page-header">
          <div>
            <h1 className="page-title">Monitoring</h1>
            <p className="page-subtitle">Dua rantai sekaligus: transaksi SERGAB (TJP/MPP) dan pengolahan gabah (GDG/UBJ).</p>
          </div>
          <Link to="/dashboard" className="btn btn-ghost">Dashboard</Link>
        </header>

        <div className="work-layout">
          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div>
                <h2 className="section-title">SERGAB · Sebaran Tahap Saat Ini</h2>
                <p className="page-subtitle">Data otomatis diperbarui mengikuti transaksi aktif.</p>
              </div>
              <span className="badge">Auto refresh</span>
            </div>
            {loadingSebaran && <SkeletonSebaranTahap />}
            <div className="grid gap-4 lg:grid-cols-2">
              {(sebaran ?? []).map((item) => (
                <SebaranTahapKartu key={item.skema} judul={`Skema ${item.skema}`} stages={item.stages} maksimum={maxStageTotal} />
              ))}
            </div>
          </section>

          <PanelPengolahan data={pengolahan} isLoading={loadingPengolahan} />

          <section className="panel panel-pad">
            <div className="toolbar-card mb-4">
              <div>
                <h2 className="section-title">SERGAB · Makloon Terdaftar</h2>
                <p className="page-subtitle">Jumlah transaksi aktif per makloon mengikuti data terbaru.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(['semua', 'TJP', 'MPP'] as const).map((item) => (
                  <button key={item} type="button" className={`btn ${filter === item ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setFilter(item)}>
                    {item === 'semua' ? 'Semua' : item}
                  </button>
                ))}
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

/** Batang mendatar per tahap. Nol digambar nol -- lebar minimum bikin tahap kosong terlihat berisi. */
function SebaranTahapKartu({ judul, stages, maksimum }: { judul: string; stages: StageCount[]; maksimum: number }) {
  const total = stages.reduce((sum, stage) => sum + stage.total, 0)

  return (
    <div className="rounded-lg border border-border p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="section-title">{judul}</h3>
        <span className="badge">{total} aktif</span>
      </div>
      <div className="space-y-3">
        {stages.map((stage) => (
          <div key={stage.stage}>
            <div className="mb-1 flex justify-between gap-3 text-xs">
              <span className="font-semibold text-primary-dark">{stage.label}</span>
              <span>{stage.total}</span>
            </div>
            <div className="h-2 rounded bg-primary-tint">
              <div className="h-2 rounded bg-primary" style={{ width: `${(stage.total / maksimum) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Blok pengolahan: angka kunci, dua grafik tren, sebaran tahap GDG/UBJ, dan peringkat makloon.
 *
 * Kuantum (kg) dan rendemen (%) sengaja DIPISAH jadi dua grafik, bukan satu grafik dua sumbu-y.
 * Grafik sumbu ganda membuat perpotongan dua garis tampak bermakna padahal ia cuma akibat
 * pilihan skala.
 */
function PanelPengolahan({ data, isLoading }: { data?: MonitoringPengolahan; isLoading: boolean }) {
  if (isLoading && !data) {
    return (
      <section className="panel panel-pad">
        <h2 className="section-title mb-4">Pengolahan</h2>
        <SkeletonSebaranTahap />
      </section>
    )
  }

  if (!data) return null

  const { ringkasan, tren_bulanan: tren, makloon_teratas: peringkat, sebaran_tahap: sebaran } = data
  const maxTahap = Math.max(1, ...sebaran.flatMap((item) => item.stages.map((stage) => stage.total)))
  const adaOlahan = ringkasan.gabah_diolah > 0

  return (
    <section className="panel panel-pad">
      <div className="toolbar-card mb-4">
        <div>
          <h2 className="section-title">Pengolahan · Gabah menjadi Beras</h2>
          <p className="page-subtitle">
            Dihitung dari LHPK yang sudah <strong>diterima</strong> saja — yang masih menunggu review belum final.
          </p>
        </div>
        <span className="badge">Auto refresh</span>
      </div>

      <div className="stats-grid mb-6">
        <KartuAngka label="Pengolahan berjalan" nilai={angka.format(ringkasan.berjalan)} />
        <KartuAngka label="Pengolahan selesai" nilai={angka.format(ringkasan.selesai)} />
        <KartuAngka label="Gabah diolah" nilai={`${angka.format(ringkasan.gabah_diolah)} kg`} />
        <KartuAngka label="Beras HGL" nilai={`${angka.format(ringkasan.beras_hgl)} kg`} />
        <KartuAngka label="Rendemen keseluruhan" nilai={`${ringkasan.rendemen.toLocaleString('id-ID')}%`} catatan="Beras HGL ÷ gabah diolah" />
        <KartuAngka label="Susut timbangan" nilai={`${angka.format(ringkasan.susut)} kg`} catatan="HGL fisik gudang − beras HGL LHPK" />
      </div>

      {!adaOlahan && (
        <div className="empty-state mb-6">
          <div className="empty-title">Belum ada LHPK yang diterima</div>
          <p className="page-subtitle">Grafik terisi begitu data UB Jastasma diterima tahap berikutnya.</p>
        </div>
      )}

      {adaOlahan && (
        <div className="grid gap-4 mb-6 xl:grid-cols-2">
          <GrafikTren tren={tren} />
          <GrafikRendemen tren={tren} />
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {sebaran.map((item) => (
          <SebaranTahapKartu key={item.skema} judul={`Skema ${item.skema}`} stages={item.stages} maksimum={maxTahap} />
        ))}
      </div>

      {peringkat.length > 0 && <PeringkatMakloon peringkat={peringkat} />}
    </section>
  )
}

function KartuAngka({ label, nilai, catatan }: { label: string; nilai: string; catatan?: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{nilai}</div>
      {catatan && <p className="mt-1 text-[0.68rem] text-slate-500">{catatan}</p>}
    </div>
  )
}

/** Geometri bersama kedua grafik: satu viewBox, satu area gambar. */
const PLOT = { w: 720, h: 240, kiri: 56, kanan: 12, atas: 16, bawah: 34 }
const plotW = PLOT.w - PLOT.kiri - PLOT.kanan
const plotH = PLOT.h - PLOT.atas - PLOT.bawah

/** Label sumbu-x diselang-seling kalau titiknya banyak, supaya tidak saling tabrak. */
function labelSumbuX(jumlah: number) {
  return jumlah > 8 ? 2 : 1
}

/** Tren kuantum: dua seri satu satuan (kg), jadi satu sumbu-y saja. */
function GrafikTren({ tren }: { tren: TitikTren[] }) {
  const maks = Math.max(1, ...tren.flatMap((t) => [t.gabah_diolah, t.beras_hgl]))
  const x = (i: number) => PLOT.kiri + (i * plotW) / Math.max(1, tren.length - 1)
  const y = (nilai: number) => PLOT.atas + (1 - nilai / maks) * plotH
  const garis = (ambil: (t: TitikTren) => number) => tren.map((t, i) => `${x(i)},${y(ambil(t))}`).join(' ')
  const setiap = labelSumbuX(tren.length)

  return (
    <figure className="rounded-lg border border-border p-4">
      <figcaption className="mb-1 text-sm font-extrabold text-primary-dark">Tren Gabah Diolah vs Beras HGL</figcaption>
      <p className="mb-3 text-xs text-slate-500">12 bulan terakhir, mengikuti tanggal LHPK. Jarak kedua garis adalah gabah yang tidak menjadi beras.</p>

      <div className="mb-3 flex flex-wrap gap-4 text-xs font-semibold text-primary-dark">
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: WARNA_GABAH }} /> Gabah diolah
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ background: WARNA_BERAS }} /> Beras HGL
        </span>
      </div>

      <svg viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} className="w-full" role="img" aria-label="Grafik garis gabah diolah dan beras HGL per bulan">
        {[0, 0.25, 0.5, 0.75, 1].map((bagian) => (
          <g key={bagian}>
            <line x1={PLOT.kiri} x2={PLOT.w - PLOT.kanan} y1={y(maks * bagian)} y2={y(maks * bagian)} stroke="#DCE2EC" strokeWidth={1} />
            <text x={PLOT.kiri - 8} y={y(maks * bagian) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {ribuan(maks * bagian)}
            </text>
          </g>
        ))}

        <polyline points={garis((t) => t.gabah_diolah)} fill="none" stroke={WARNA_GABAH} strokeWidth={2} strokeLinejoin="round" />
        <polyline points={garis((t) => t.beras_hgl)} fill="none" stroke={WARNA_BERAS} strokeWidth={2} strokeLinejoin="round" />

        {tren.map((titik, i) => (
          <g key={titik.bulan}>
            <circle cx={x(i)} cy={y(titik.gabah_diolah)} r={4} fill={WARNA_GABAH} stroke="#fff" strokeWidth={2} />
            <circle cx={x(i)} cy={y(titik.beras_hgl)} r={4} fill={WARNA_BERAS} stroke="#fff" strokeWidth={2} />
            {/* Sasaran hover selebar satu bulan, jauh lebih besar dari titiknya. */}
            <rect x={x(i) - plotW / tren.length / 2} y={PLOT.atas} width={plotW / tren.length} height={plotH} fill="transparent">
              <title>{`${titik.label} — gabah ${angka.format(titik.gabah_diolah)} kg, beras ${angka.format(titik.beras_hgl)} kg (${titik.jumlah} LHPK)`}</title>
            </rect>
            {i % setiap === 0 && (
              <text x={x(i)} y={PLOT.h - 10} textAnchor="middle" className="fill-slate-500 text-[11px]">{titik.label}</text>
            )}
          </g>
        ))}
      </svg>
    </figure>
  )
}

/** Rendemen per bulan: satuan persen, karena itu grafiknya sendiri dan bukan sumbu kedua. */
function GrafikRendemen({ tren }: { tren: TitikTren[] }) {
  const maks = Math.max(10, ...tren.map((t) => t.rendemen))
  const lebarPita = plotW / tren.length
  const lebarBatang = Math.max(6, lebarPita - 10)
  const y = (nilai: number) => PLOT.atas + (1 - nilai / maks) * plotH
  const setiap = labelSumbuX(tren.length)
  const terakhir = [...tren].reverse().find((t) => t.rendemen > 0)

  return (
    <figure className="rounded-lg border border-border p-4">
      <figcaption className="mb-1 text-sm font-extrabold text-primary-dark">Rendemen Bulanan</figcaption>
      <p className="mb-3 text-xs text-slate-500">
        Beras HGL ÷ gabah diolah × 100.{terakhir ? ` Terakhir terisi: ${terakhir.label} pada ${terakhir.rendemen.toLocaleString('id-ID')}%.` : ''}
      </p>

      <svg viewBox={`0 0 ${PLOT.w} ${PLOT.h}`} className="w-full" role="img" aria-label="Grafik batang rendemen per bulan">
        {[0, 0.5, 1].map((bagian) => (
          <g key={bagian}>
            <line x1={PLOT.kiri} x2={PLOT.w - PLOT.kanan} y1={y(maks * bagian)} y2={y(maks * bagian)} stroke="#DCE2EC" strokeWidth={1} />
            <text x={PLOT.kiri - 8} y={y(maks * bagian) + 4} textAnchor="end" className="fill-slate-500 text-[11px]">
              {Math.round(maks * bagian)}%
            </text>
          </g>
        ))}

        {tren.map((titik, i) => {
          const tinggi = titik.rendemen > 0 ? PLOT.atas + plotH - y(titik.rendemen) : 0
          const kiri = PLOT.kiri + i * lebarPita + (lebarPita - lebarBatang) / 2

          return (
            <g key={titik.bulan}>
              {tinggi > 0 && (
                <rect x={kiri} y={y(titik.rendemen)} width={lebarBatang} height={tinggi} rx={4} fill={WARNA_GABAH}>
                  <title>{`${titik.label} — rendemen ${titik.rendemen.toLocaleString('id-ID')}%`}</title>
                </rect>
              )}
              {i % setiap === 0 && (
                <text x={kiri + lebarBatang / 2} y={PLOT.h - 10} textAnchor="middle" className="fill-slate-500 text-[11px]">{titik.label}</text>
              )}
            </g>
          )
        })}
      </svg>
    </figure>
  )
}

/** Peringkat volume olahan per makloon. Satu seri, jadi batang polos berlabel langsung. */
function PeringkatMakloon({ peringkat }: { peringkat: MakloonOlahan[] }) {
  const maks = Math.max(1, ...peringkat.map((item) => item.beras_hgl))

  return (
    <figure className="mt-4 rounded-lg border border-border p-4">
      <figcaption className="mb-1 text-sm font-extrabold text-primary-dark">Makloon dengan Beras HGL Terbanyak</figcaption>
      <p className="mb-4 text-xs text-slate-500">Kumulatif seluruh periode, urut dari yang terbesar.</p>

      <div className="space-y-3">
        {peringkat.map((item) => (
          <div key={item.nama_maklon}>
            <div className="mb-1 flex flex-wrap justify-between gap-2 text-xs">
              <span className="font-semibold text-primary-dark">{item.nama_maklon}</span>
              <span className="text-slate-500">
                {angka.format(item.beras_hgl)} kg · rendemen {item.rendemen.toLocaleString('id-ID')}% · {item.jumlah} LHPK
              </span>
            </div>
            <div className="h-2.5 rounded bg-primary-tint">
              <div className="h-2.5 rounded" style={{ width: `${(item.beras_hgl / maks) * 100}%`, background: WARNA_GABAH }} />
            </div>
          </div>
        ))}
      </div>
    </figure>
  )
}
