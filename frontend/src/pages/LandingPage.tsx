import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import heroImage from '../assets/hero.png'

type Filter = 'semua' | 'TJP' | 'MPP'
type Region = { name: string; total: number; items: { name: string; area: string; tjp: number; mpp: number }[] }

const stages = [
  { label: 'Jemput pangan', tjp: 8, mpp: 0, note: 'Awal skema TJP dari petugas lapangan.' },
  { label: 'Makloon', tjp: 14, mpp: 9, note: 'Awal skema MPP dan lanjutan TJP.' },
  { label: 'UB Jastasma', tjp: 6, mpp: 6, note: 'Review dan validasi data.' },
  { label: 'Pengadaan', tjp: 10, mpp: 7, note: 'Gabung PO dan nomor IN.' },
  { label: 'Keuangan', tjp: 4, mpp: 3, note: 'Pembayaran PO.' },
  { label: 'Operasi', tjp: 3, mpp: 2, note: 'Input MO, TM, dan hasil lab.' },
  { label: 'Gudang', tjp: 22, mpp: 13, note: 'Penerimaan akhir.' },
]

const regions: Region[] = [
  { name: 'Bandar Lampung', total: 9, items: [
    { name: 'Makloon Sinar Jaya', area: 'Panjang', tjp: 6, mpp: 2 },
    { name: 'Makloon Bumi Waras', area: 'Teluk Betung', tjp: 3, mpp: 4 },
    { name: 'Makloon Way Lunik', area: 'Sukarame', tjp: 1, mpp: 2 },
  ] },
  { name: 'Lampung Selatan', total: 11, items: [
    { name: 'Makloon Natar Sejahtera', area: 'Natar', tjp: 5, mpp: 1 },
    { name: 'Makloon Jati Agung Makmur', area: 'Jati Agung', tjp: 2, mpp: 3 },
    { name: 'Makloon Tanjung Bintang', area: 'Tanjung Bintang', tjp: 4, mpp: 2 },
  ] },
]
function FilterTabs({ value, onChange }: { value: Filter; onChange: (value: Filter) => void }) {
  return (
    <div className="flex rounded-lg bg-primary-tint p-1 text-xs font-semibold text-primary">
      {(['semua', 'TJP', 'MPP'] as const).map((item) => (
        <button key={item} type="button" onClick={() => onChange(item)} className={`rounded px-4 py-2 ${value === item ? 'bg-white shadow-sm' : 'hover:bg-white/60'}`}>
          {item === 'semua' ? 'Semua' : item}
        </button>
      ))}
    </div>
  )
}
function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const width = max ? Math.max(8, Math.round((value / max) * 100)) : 0
  return (
    <div className="grid grid-cols-[112px_1fr_32px] items-center gap-3 text-xs">
      <span className="text-slate-600">{label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-primary-tint"><span className="block h-full rounded-full bg-primary transition-all" style={{ width: width + '%' }} /></span>
      <span className="text-right font-semibold text-primary-dark">{value}</span>
    </div>
  )
}
export default function LandingPage() {
  const [filter, setFilter] = useState<Filter>('semua')
  const [open, setOpen] = useState<Set<string>>(() => new Set(['Bandar Lampung', 'Lampung Selatan']))
  const maxTjp = Math.max(...stages.map((stage) => stage.tjp))
  const maxMpp = Math.max(...stages.map((stage) => stage.mpp))
  const shownRegions = useMemo(
    () => regions.map((region) => ({
      ...region,
      items: region.items.filter((item) => filter === 'TJP' ? item.tjp > 0 : filter === 'MPP' ? item.mpp > 0 : true),
    })).filter((region) => region.items.length),
    [filter],
  )
  const shownStages = stages.filter((stage) => filter === 'semua' || stage[filter.toLowerCase() as 'tjp' | 'mpp'] > 0)
  const toggle = (name: string) => setOpen((prev) => {
    const next = new Set(prev)
    next.has(name) ? next.delete(name) : next.add(name)
    return next
  })

  return (
    <div className="min-h-screen bg-surface text-slate-950">
      <header className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#tentang" className="flex items-center gap-3 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded bg-primary text-xs font-bold text-white">K</span>Konekto</a>
          <div className="hidden items-center gap-8 text-xs font-medium text-slate-700 md:flex">
            <a href="#tentang" className="border-b-2 border-primary pb-1 text-primary-dark">Tentang</a>
            <a href="#visi-misi">Visi & misi</a>
            <a href="#tata-nilai">Tata nilai</a>
            <a href="#kontak">Kontak</a>
          </div>
          <Link to="/login" className="rounded border border-primary px-5 py-2 text-xs font-semibold text-primary hover:bg-primary hover:text-white">Masuk</Link>
        </nav>
      </header>

      <main>
        <section id="tentang" className="border-b border-border bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-10 md:grid-cols-[1fr_0.9fr] md:py-14">
            <div><p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-primary">Perum Bulog Kanwil Lampung</p><h1 className="max-w-xl text-4xl font-semibold leading-tight text-slate-950 md:text-6xl">Konekto</h1><p className="mt-5 max-w-lg text-sm leading-7 text-slate-700 md:text-base">Sistem monitoring serap gabah yang membedakan alur TJP dan MPP dari input awal, review, PO, pembayaran, operasi, sampai penerimaan gudang.</p><div className="mt-7 flex flex-wrap gap-3"><Link to="/login" className="btn btn-primary">Masuk ke sistem</Link><a href="#alur" className="btn border border-border bg-white text-primary-dark">Lihat alur</a></div></div>
            <div className="overflow-hidden rounded-lg border border-border bg-surface"><img src={heroImage} alt="Ilustrasi pengadaan pangan" className="h-72 w-full object-cover md:h-80" /></div>
          </div>
        </section>
        <section className="border-b border-border bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-3 divide-x divide-border px-5">
            <div className="py-7 text-center"><p className="text-2xl font-semibold text-primary">42</p><p className="mt-1 text-xs font-medium text-slate-600">Mitra makloon</p></div>
            <div className="py-7 text-center"><p className="text-2xl font-semibold text-primary">2</p><p className="mt-1 text-xs font-medium text-slate-600">Skema pengadaan</p></div>
            <div className="py-7 text-center"><p className="text-2xl font-semibold text-primary">7</p><p className="mt-1 text-xs font-medium text-slate-600">Tahap tertelusur</p></div>
          </div>
        </section>

        <section id="visi-misi" className="border-b border-border bg-white">
          <div className="mx-auto grid max-w-6xl gap-6 px-5 py-10 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Visi</p>
              <h2 className="mt-3 text-2xl font-semibold text-slate-950">Pengadaan gabah yang tertelusur dan cepat divalidasi.</h2>
              <p className="mt-4 text-sm leading-7 text-slate-600">Konekto membantu setiap unit melihat posisi transaksi, dokumen pendukung, dan tanggung jawab tahap berikutnya dari satu layar kerja.</p>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Misi</p>
              <div className="mt-3 grid gap-3 text-sm text-slate-700">
                <p>Memisahkan alur TJP dan MPP dengan status yang jelas.</p>
                <p>Mengurangi perpindahan dokumen manual antarbagian.</p>
                <p>Mempercepat review dari Jemput Pangan sampai Gudang.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="tata-nilai" className="mx-auto max-w-6xl px-5 py-10">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-950">Tata nilai</h2>
            <p className="mt-1 text-sm text-slate-600">Prinsip kerja yang dijaga dalam setiap transaksi pengadaan.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            {['Akurat', 'Transparan', 'Tertib dokumen', 'Responsif'].map((value) => (
              <div key={value} className="rounded-lg border border-border bg-white p-5">
                <h3 className="text-sm font-semibold text-primary-dark">{value}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-600">Data, status, dan keputusan tahap dicatat agar mudah diaudit oleh unit terkait.</p>
              </div>
            ))}
          </div>
        </section>

        <section id="alur" className="mx-auto max-w-6xl px-5 py-10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
            <div><h2 className="text-lg font-semibold text-slate-950">Alur transaksi</h2><p className="mt-1 text-sm text-slate-600">TJP dimulai dari Jemput Pangan, sedangkan MPP dimulai langsung dari Makloon.</p></div>
            <FilterTabs value={filter} onChange={setFilter} />
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            {shownStages.map((stage, index) => (
              <div key={stage.label} className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs font-bold text-slate-400">{String(index + 1).padStart(2, '0')}</p>
                <h3 className="mt-3 text-sm font-semibold text-slate-950">{stage.label}</h3>
                <p className="mt-2 min-h-10 text-xs leading-5 text-slate-600">{stage.note}</p>
                <div className="mt-4 flex gap-2">
                  {stage.tjp > 0 && <span className={'rounded px-2 py-1 text-xs font-semibold ' + (filter === 'TJP' ? 'bg-primary text-white' : 'bg-primary-tint text-primary')}>TJP</span>}
                  {stage.mpp > 0 && <span className={'rounded px-2 py-1 text-xs font-semibold ' + (filter === 'MPP' ? 'bg-primary text-white' : 'bg-primary-tint text-primary')}>MPP</span>}
                </div>
              </div>
            ))}
          </div>
        </section>
        <section id="sebaran" className="mx-auto max-w-6xl px-5 pb-10">
          <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-slate-950">Sebaran tahap saat ini</h2>
            <p className="mt-1 text-sm text-slate-600">Jumlah transaksi berjalan per tahap, per skema.</p>
            <div className="mt-6 grid gap-5 md:grid-cols-2">
              {(filter === 'semua' || filter === 'TJP') && (
                <div className="rounded-lg border border-border bg-white p-5">
                  <p className="mb-4 text-sm font-semibold text-primary-dark">Skema TJP</p>
                  <div className="space-y-3">{stages.filter((stage) => stage.tjp > 0).map((stage) => <Bar key={stage.label} label={stage.label} value={stage.tjp} max={maxTjp} />)}</div>
                </div>
              )}
              {(filter === 'semua' || filter === 'MPP') && (
                <div className="rounded-lg border border-border bg-white p-5">
                  <p className="mb-4 text-sm font-semibold text-primary-dark">Skema MPP</p>
                  <div className="space-y-3">{stages.filter((stage) => stage.mpp > 0).map((stage) => <Bar key={stage.label} label={stage.label} value={stage.mpp} max={maxMpp} />)}</div>
                </div>
              )}
            </div>
          </div>
        </section>

        <section id="makloon" className="mx-auto max-w-6xl px-5 pb-14">
          <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div><h2 className="text-lg font-semibold text-slate-950">Makloon terdaftar</h2><p className="mt-1 text-sm text-slate-600">42 makloon, dikelompokkan per wilayah dan bisa difilter berdasarkan skema.</p></div>
              <FilterTabs value={filter} onChange={setFilter} />
            </div>
            <div className="mt-5 overflow-hidden rounded-lg border border-border">
              {shownRegions.map((region) => {
                const isOpen = open.has(region.name)
                return (
                  <div key={region.name} className="border-b border-border last:border-b-0">
                    <button type="button" onClick={() => toggle(region.name)} className="flex w-full items-center justify-between bg-surface px-4 py-3 text-left text-sm font-semibold text-primary-dark hover:bg-primary-tint">
                      <span>{region.name} ({region.total} makloon)</span>
                      <span>{isOpen ? '^' : 'v'}</span>
                    </button>
                    {isOpen && region.items.map((item) => (
                      <div key={item.name} className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-4 text-sm">
                        <p className="font-semibold text-slate-900">{item.name} <span className="font-normal text-slate-500">- {item.area}</span></p>
                        <div className="flex gap-2 text-xs font-semibold text-primary">
                          {(filter === 'semua' || filter === 'TJP') && <span className="rounded bg-primary-tint px-2 py-1">{item.tjp} TJP</span>}
                          {(filter === 'semua' || filter === 'MPP') && <span className="rounded bg-primary-tint px-2 py-1">{item.mpp} MPP</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })}
            </div>
          </div>
        </section>
      </main>

      <footer id="kontak" className="bg-primary-dark text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-3">
          <div><p className="font-semibold">Konekto</p><p className="mt-3 text-sm leading-6 text-white/75">Sistem informasi serap gabah Perum BULOG Kanwil Lampung.</p></div>
          <div><p className="text-sm font-semibold">Kantor wilayah</p><p className="mt-3 text-sm leading-6 text-white/75">Jl. Soekarno-Hatta, Bandar Lampung<br />(0721) 000-000</p></div>
          <div><p className="text-sm font-semibold">Akses</p><p className="mt-3 text-sm leading-6 text-white/75">Alur transaksi<br />Sebaran tahap<br />Makloon terdaftar</p></div>
        </div>
        <div className="border-t border-white/10 py-3 text-center text-xs text-white/60">2026 Perum BULOG Kanwil Lampung. Seluruh hak cipta dilindungi.</div>
      </footer>
    </div>
  )
}
