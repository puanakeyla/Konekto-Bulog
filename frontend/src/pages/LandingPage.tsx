import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import logoKonekto from '../assets/logo-konekto.png'

// Halaman publik murni informasional (Bagian 7.3) -- TANPA data transaksi.
// Sebaran tahap & daftar makloon adalah fitur halaman internal (MonitoringPage),
// tidak ditampilkan di sini. Konten di bawah bersifat statis/struktural.

const alurStages = [
  { label: 'Jemput Pangan', note: 'Awal skema TJP dari petugas lapangan.', schemes: ['TJP'] },
  { label: 'Makloon', note: 'Awal skema MPP dan lanjutan TJP.', schemes: ['TJP', 'MPP'] },
  { label: 'UB Jastasma', note: 'Review dan validasi mutu gabah.', schemes: ['TJP', 'MPP'] },
  { label: 'Pengadaan', note: 'Penggabungan PO dan nomor IN.', schemes: ['TJP', 'MPP'] },
  { label: 'Keuangan', note: 'Proses pembayaran PO.', schemes: ['TJP', 'MPP'] },
  { label: 'Operasi', note: 'Input MO, TM, dan hasil lab.', schemes: ['TJP', 'MPP'] },
  { label: 'Gudang', note: 'Penerimaan akhir di gudang.', schemes: ['TJP', 'MPP'] },
] as const

const misi = [
  'Mendukung Pemerintah menjamin ketersediaan, keterjangkauan, dan stabilitas pangan.',
  'Menciptakan jaringan supply chain yang efisien didukung teknologi digital.',
  'Mengembangkan bisnis komersial berkelanjutan dengan tanggung jawab sosial.',
  'Memperkuat manajemen risiko, talenta, dan budaya kinerja didukung teknologi.',
]

const akhlak = [
  { name: 'Amanah', desc: 'Memegang teguh kepercayaan yang diberikan.' },
  { name: 'Kompeten', desc: 'Terus belajar dan mengembangkan kapabilitas.' },
  { name: 'Harmonis', desc: 'Saling peduli dan menghargai perbedaan.' },
  { name: 'Loyal', desc: 'Berdedikasi bagi bangsa dan negara.' },
  { name: 'Adaptif', desc: 'Terus berinovasi dan antusias menghadapi perubahan.' },
  { name: 'Kolaboratif', desc: 'Membangun kerja sama yang sinergis.' },
]

const stats = [
  { value: '40+', label: 'Mitra makloon' },
  { value: '2', label: 'Skema pengadaan' },
  { value: '7', label: 'Tahap tertelusur' },
]

// Eyebrow label dengan garis aksen emas -- dipakai konsisten di tiap section.
function Eyebrow({ children, tone = 'light' }: { children: ReactNode; tone?: 'light' | 'dark' }) {
  return (
    <p className={`flex items-center gap-2.5 text-xs font-bold uppercase tracking-[0.18em] ${tone === 'dark' ? 'text-accent' : 'text-primary'}`}>
      <span className="h-px w-7 bg-accent" />
      {children}
    </p>
  )
}

// Grafis hero: komposisi lingkaran bertingkat + ikon gudang & truk (Bagian 7.1/7.3),
// memakai token warna navy resmi + sentuhan aksen emas (matahari & butir gabah).
function HeroGrafis() {
  return (
    <svg viewBox="0 0 440 360" role="img" aria-label="Ilustrasi alur logistik pengadaan gabah" className="h-64 w-full md:h-72">
      <defs>
        <linearGradient id="warehouseFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-primary)" />
          <stop offset="1" stopColor="var(--color-primary-dark)" />
        </linearGradient>
      </defs>
      <circle cx="220" cy="180" r="160" fill="var(--color-primary-tint)" />
      <circle cx="220" cy="180" r="120" fill="none" stroke="var(--color-primary)" strokeOpacity="0.14" strokeWidth="2" strokeDasharray="3 7" />
      <circle cx="220" cy="180" r="82" fill="var(--color-primary)" fillOpacity="0.06" />

      {/* Matahari aksen emas di belakang gudang */}
      <circle cx="316" cy="104" r="30" fill="var(--color-accent)" fillOpacity="0.9" />
      <circle cx="316" cy="104" r="42" fill="none" stroke="var(--color-accent)" strokeOpacity="0.3" strokeWidth="2" strokeDasharray="2 6" />

      {/* Butir gabah / partikel */}
      <circle cx="352" cy="200" r="7" fill="var(--color-accent)" fillOpacity="0.55" />
      <circle cx="360" cy="248" r="5" fill="var(--color-primary)" fillOpacity="0.2" />
      <circle cx="92" cy="262" r="10" fill="var(--color-primary)" fillOpacity="0.16" />
      <circle cx="104" cy="132" r="6" fill="var(--color-accent)" fillOpacity="0.45" />

      {/* Gudang */}
      <polygon points="150,150 236,110 322,150" fill="var(--color-primary-dark)" />
      <rect x="166" y="150" width="140" height="74" rx="5" fill="url(#warehouseFill)" />
      <rect x="214" y="182" width="44" height="42" rx="3" fill="var(--color-primary-tint)" />
      <rect x="180" y="164" width="24" height="18" rx="2" fill="#ffffff" fillOpacity="0.35" />
      <rect x="268" y="164" width="24" height="18" rx="2" fill="#ffffff" fillOpacity="0.35" />
      <rect x="222" y="192" width="4" height="24" rx="2" fill="var(--color-accent)" fillOpacity="0.7" />

      {/* Truk */}
      <rect x="128" y="232" width="92" height="50" rx="5" fill="var(--color-primary)" />
      <path d="M220 244 h34 l26 26 v12 h-60 z" fill="var(--color-primary-dark)" />
      <rect x="228" y="250" width="30" height="20" rx="2" fill="var(--color-primary-tint)" />
      <circle cx="158" cy="290" r="13" fill="#14213f" />
      <circle cx="158" cy="290" r="5" fill="var(--color-accent)" />
      <circle cx="262" cy="290" r="13" fill="#14213f" />
      <circle cx="262" cy="290" r="5" fill="var(--color-accent)" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen scroll-smooth bg-surface text-slate-950">
      <header className="sticky top-0 z-20 border-b border-white/10 bg-primary-dark/90 backdrop-blur-md">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <a href="#tentang" className="flex items-center">
            <img src={logoKonekto} alt="Konekto" className="h-8 w-auto" />
          </a>
          <div className="hidden items-center gap-8 text-xs font-medium text-white/60 md:flex">
            <a href="#tentang" className="border-b-2 border-accent pb-1 text-white">Tentang</a>
            <a href="#visi-misi" className="pb-1 transition-colors hover:text-white">Visi &amp; misi</a>
            <a href="#tata-nilai" className="pb-1 transition-colors hover:text-white">Tata nilai</a>
            <a href="#kontak" className="pb-1 transition-colors hover:text-white">Kontak</a>
          </div>
          <Link to="/login" className="rounded-lg bg-accent px-5 py-2 text-xs font-bold text-primary-dark shadow-sm transition-all hover:bg-white hover:shadow-md">Masuk</Link>
        </nav>
      </header>

      <main>
        {/* Hero -- navy gelap dramatis. Tanpa CTA (entry point tunggal: "Masuk" di navbar). */}
        <section id="tentang" className="relative overflow-hidden bg-gradient-to-br from-[#14213f] via-primary-dark to-primary text-white">
          {/* pola titik halus */}
          <div
            aria-hidden
            className="absolute inset-0 opacity-50"
            style={{ backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.10) 1px, transparent 1px)', backgroundSize: '22px 22px' }}
          />
          {/* blob cahaya */}
          <div aria-hidden className="pointer-events-none absolute -right-28 -top-24 h-96 w-96 rounded-full bg-accent/15 blur-3xl" />
          <div aria-hidden className="pointer-events-none absolute -left-32 bottom-0 h-80 w-80 rounded-full bg-primary/50 blur-3xl" />
          {/* cincin dekoratif */}
          <div aria-hidden className="pointer-events-none absolute right-10 top-10 h-72 w-72 rounded-full border border-white/5" />
          <div aria-hidden className="pointer-events-none absolute right-24 top-24 h-44 w-44 rounded-full border border-white/5" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 md:grid-cols-[1fr_0.85fr] md:py-28">
            <div>
              <Eyebrow tone="dark">Perum Bulog Kanwil Lampung</Eyebrow>
              <h1 className="mt-6 text-6xl font-bold leading-[0.95] tracking-tight md:text-8xl">
                Konekto<span className="text-accent">.</span>
              </h1>
              <div className="mt-5 h-1 w-20 rounded-full bg-accent" />
              <p className="mt-7 max-w-lg text-sm leading-7 text-white/70 md:text-base">Sistem monitoring serap gabah yang membedakan alur TJP dan MPP dari input awal, review, PO, pembayaran, operasi, sampai penerimaan gudang.</p>
              <div className="mt-8 flex flex-wrap items-center gap-2.5">
                <span className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white">TJP</span>
                <span className="rounded-full border border-white/15 bg-white/10 px-4 py-1.5 text-xs font-semibold text-white">MPP</span>
              </div>
            </div>
            <div className="relative rounded-2xl border border-white/10 bg-white p-3 shadow-2xl shadow-black/30">
              <div className="rounded-xl bg-gradient-to-br from-primary-tint/70 to-white p-2">
                <HeroGrafis />
              </div>
            </div>
          </div>
        </section>

        {/* Statistik ringkas -- kartu melayang menimpa hero untuk kedalaman */}
        <section className="bg-white">
          <div className="mx-auto max-w-6xl px-5">
            <div className="relative z-10 -mt-14 grid grid-cols-1 divide-y divide-border rounded-2xl border border-border bg-white shadow-xl shadow-primary/10 sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {stats.map((stat) => (
                <div key={stat.label} className="px-6 py-9 text-center transition-colors hover:bg-primary-tint/30">
                  <p className="text-5xl font-bold tracking-tight text-primary">
                    {stat.value}
                    <span className="text-accent">.</span>
                  </p>
                  <p className="mt-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Riwayat singkat perusahaan */}
        <section id="riwayat" className="bg-white">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <Eyebrow>Riwayat singkat</Eyebrow>
            <h2 className="mt-3 max-w-3xl text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Tentang Perum BULOG</h2>
            <p className="mt-6 max-w-3xl border-l-2 border-accent pl-6 text-sm leading-8 text-slate-600 md:text-base">
              Perusahaan Umum BULOG (Perum BULOG) adalah Badan Usaha Milik Negara yang berdiri pada tanggal 21 Januari 2003. Pendiriannya berdasarkan Peraturan Pemerintah No. 7 Tahun 2003 tentang Pendirian Perusahaan Umum (Perum) BULOG, sebagaimana telah diubah dengan Peraturan Pemerintah Nomor 61 Tahun 2003. Peraturan Pemerintah Nomor 7 tahun 2003 tersebut kemudian diubah kembali menjadi PP Nomor 13 Tahun 2016 tentang Perum BULOG.
            </p>
          </div>
        </section>

        {/* Visi & Misi */}
        <section id="visi-misi" className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-20 md:grid-cols-2">
            <div>
              <Eyebrow>Visi</Eyebrow>
              <div className="relative mt-4 overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-primary-dark p-8 text-white shadow-xl shadow-primary/20 md:p-9">
                <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-accent/20 blur-2xl" />
                <span aria-hidden className="relative block font-serif text-6xl leading-none text-accent/70">&ldquo;</span>
                <p className="relative -mt-4 text-lg font-semibold leading-8 md:text-2xl">Menjadi Pemimpin Rantai Pasok Pangan Terpercaya di Indonesia yang memberikan Pelayanan Prima demi Kesejahteraan Masyarakat Indonesia.</p>
              </div>
            </div>
            <div>
              <Eyebrow>Misi</Eyebrow>
              <div className="mt-4 grid gap-3">
                {misi.map((item, index) => (
                  <div key={index} className="flex items-center gap-4 rounded-xl border border-border bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-sm font-bold text-white">{index + 1}</span>
                    <p className="text-sm leading-6 text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Tata Nilai AKHLAK */}
        <section id="tata-nilai" className="mx-auto max-w-6xl px-5 py-20">
          <div className="mb-10">
            <Eyebrow>Tata nilai</Eyebrow>
            <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Tata nilai AKHLAK</h2>
            <p className="mt-3 text-sm text-slate-600 md:text-base">Nilai-nilai utama BUMN yang dijaga dalam setiap proses kerja.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {akhlak.map((value) => (
              <div key={value.name} className="group relative overflow-hidden rounded-2xl border border-border bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
                <div aria-hidden className="absolute inset-x-0 top-0 h-1 origin-left scale-x-0 bg-accent transition-transform duration-300 group-hover:scale-x-100" />
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-tint text-lg font-bold text-primary transition-colors group-hover:bg-primary group-hover:text-white">{value.name.charAt(0)}</span>
                  <h3 className="text-base font-semibold text-primary-dark">{value.name}</h3>
                </div>
                <p className="mt-4 text-sm leading-6 text-slate-600">{value.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Alur transaksi (informasional, tanpa data transaksi) */}
        <section id="alur" className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-20">
            <div className="mb-10">
              <Eyebrow>Alur transaksi</Eyebrow>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-slate-950 md:text-4xl">Alur transaksi</h2>
              <p className="mt-3 text-sm text-slate-600 md:text-base">TJP dimulai dari Jemput Pangan, sedangkan MPP dimulai langsung dari Makloon.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
              {alurStages.map((stage, index) => (
                <div key={stage.label} className="group relative flex flex-col rounded-2xl border border-border bg-white p-4 shadow-sm transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-xl hover:shadow-primary/5">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-gradient-to-br from-primary to-primary-dark text-xs font-bold text-white shadow-sm">{String(index + 1).padStart(2, '0')}</span>
                  <h3 className="mt-3 text-sm font-semibold text-slate-950">{stage.label}</h3>
                  <p className="mt-2 min-h-10 flex-1 text-xs leading-5 text-slate-600">{stage.note}</p>
                  <div className="mt-4 flex gap-1.5">
                    {stage.schemes.map((s) => (
                      <span key={s} className="rounded bg-primary-tint px-2 py-1 text-[0.65rem] font-bold text-primary">{s}</span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer id="kontak" className="relative overflow-hidden bg-gradient-to-br from-primary-dark to-[#14213f] text-white">
        <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-accent/10 blur-3xl" />
        <div className="relative">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 md:grid-cols-3">
            <div>
              <div className="flex items-center">
                <img src={logoKonekto} alt="Konekto" className="h-9 w-auto" />
              </div>
              <p className="mt-3 text-sm leading-6 text-white/70">Sistem informasi serap gabah Perum BULOG Kanwil Lampung.</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold"><span className="h-px w-4 bg-accent" />Kantor wilayah</p>
              <p className="mt-3 text-sm leading-6 text-white/70">Jl. Cut Mutia No.29, Gulak Galik, Kec. Tlk. Betung Utara, Kota Bandar Lampung, Lampung 35212, Indonesia</p>
            </div>
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold"><span className="h-px w-4 bg-accent" />Akses</p>
              <div className="mt-3 grid gap-1.5 text-sm text-white/70">
                <a href="#riwayat" className="transition-colors hover:text-accent">Tentang Perum BULOG</a>
                <a href="#visi-misi" className="transition-colors hover:text-accent">Visi &amp; misi</a>
                <a href="#tata-nilai" className="transition-colors hover:text-accent">Tata nilai</a>
                <a href="#alur" className="transition-colors hover:text-accent">Alur transaksi</a>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 py-4 text-center text-xs text-white/50">2026 Perum BULOG Kanwil Lampung. Seluruh hak cipta dilindungi.</div>
        </div>
      </footer>
    </div>
  )
}
