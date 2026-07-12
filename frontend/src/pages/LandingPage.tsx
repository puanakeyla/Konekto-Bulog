import { Link } from 'react-router-dom'

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

// Grafis hero: komposisi lingkaran bertingkat + ikon gudang & truk (Bagian 7.1/7.3),
// seluruhnya memakai token warna navy resmi (var --color-primary / -dark / -tint).
// Tidak ada warna di luar palet Konekto.
function HeroGrafis() {
  return (
    <svg viewBox="0 0 440 360" role="img" aria-label="Ilustrasi alur logistik pengadaan gabah" className="h-72 w-full md:h-80">
      <circle cx="220" cy="180" r="160" fill="var(--color-primary-tint)" />
      <circle cx="220" cy="180" r="120" fill="none" stroke="var(--color-primary)" strokeOpacity="0.14" strokeWidth="2" strokeDasharray="3 7" />
      <circle cx="220" cy="180" r="82" fill="var(--color-primary)" fillOpacity="0.06" />
      <circle cx="352" cy="86" r="7" fill="var(--color-primary)" fillOpacity="0.25" />
      <circle cx="360" cy="248" r="5" fill="var(--color-primary)" fillOpacity="0.2" />
      <circle cx="92" cy="262" r="10" fill="var(--color-primary)" fillOpacity="0.16" />

      {/* Gudang */}
      <polygon points="150,150 236,110 322,150" fill="var(--color-primary-dark)" />
      <rect x="166" y="150" width="140" height="74" rx="5" fill="var(--color-primary)" />
      <rect x="214" y="182" width="44" height="42" rx="3" fill="var(--color-primary-tint)" />
      <rect x="180" y="164" width="24" height="18" rx="2" fill="#ffffff" fillOpacity="0.35" />
      <rect x="268" y="164" width="24" height="18" rx="2" fill="#ffffff" fillOpacity="0.35" />

      {/* Truk */}
      <rect x="128" y="232" width="92" height="50" rx="5" fill="var(--color-primary)" />
      <path d="M220 244 h34 l26 26 v12 h-60 z" fill="var(--color-primary-dark)" />
      <rect x="228" y="250" width="30" height="20" rx="2" fill="var(--color-primary-tint)" />
      <circle cx="158" cy="290" r="13" fill="#14213f" />
      <circle cx="158" cy="290" r="5" fill="var(--color-primary-tint)" />
      <circle cx="262" cy="290" r="13" fill="#14213f" />
      <circle cx="262" cy="290" r="5" fill="var(--color-primary-tint)" />
    </svg>
  )
}

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-surface text-slate-950">
      <header className="sticky top-0 z-10 border-b border-border bg-white/95 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">
          <a href="#tentang" className="flex items-center gap-3 text-sm font-semibold"><span className="grid h-8 w-8 place-items-center rounded bg-primary text-xs font-bold text-white">K</span>Konekto</a>
          <div className="hidden items-center gap-8 text-xs font-medium text-slate-700 md:flex">
            <a href="#tentang" className="border-b-2 border-primary pb-1 text-primary-dark">Tentang</a>
            <a href="#visi-misi">Visi &amp; misi</a>
            <a href="#tata-nilai">Tata nilai</a>
            <a href="#kontak">Kontak</a>
          </div>
          <Link to="/login" className="rounded border border-primary px-5 py-2 text-xs font-semibold text-primary hover:bg-primary hover:text-white">Masuk</Link>
        </nav>
      </header>

      <main>
        {/* Hero -- tanpa tombol CTA (satu-satunya entry point: "Masuk" di navbar) */}
        <section id="tentang" className="border-b border-border bg-white">
          <div className="mx-auto grid max-w-6xl items-center gap-8 px-5 py-10 md:grid-cols-[1fr_0.9fr] md:py-14">
            <div>
              <p className="mb-4 text-xs font-bold uppercase tracking-[0.16em] text-primary">Perum Bulog Kanwil Lampung</p>
              <h1 className="max-w-xl text-4xl font-semibold leading-tight text-slate-950 md:text-6xl">Konekto</h1>
              <p className="mt-5 max-w-lg text-sm leading-7 text-slate-700 md:text-base">Sistem monitoring serap gabah yang membedakan alur TJP dan MPP dari input awal, review, PO, pembayaran, operasi, sampai penerimaan gudang.</p>
            </div>
            <div className="rounded-lg border border-border bg-white p-4">
              <HeroGrafis />
            </div>
          </div>
        </section>

        {/* Statistik ringkas */}
        <section className="border-b border-border bg-white">
          <div className="mx-auto grid max-w-6xl grid-cols-3 divide-x divide-border px-5">
            <div className="py-7 text-center"><p className="text-2xl font-semibold text-primary">42</p><p className="mt-1 text-xs font-medium text-slate-600">Mitra makloon</p></div>
            <div className="py-7 text-center"><p className="text-2xl font-semibold text-primary">2</p><p className="mt-1 text-xs font-medium text-slate-600">Skema pengadaan</p></div>
            <div className="py-7 text-center"><p className="text-2xl font-semibold text-primary">7</p><p className="mt-1 text-xs font-medium text-slate-600">Tahap tertelusur</p></div>
          </div>
        </section>

        {/* Riwayat singkat perusahaan */}
        <section id="riwayat" className="border-b border-border bg-white">
          <div className="mx-auto max-w-6xl px-5 py-10">
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Riwayat singkat</p>
            <h2 className="mt-3 max-w-3xl text-2xl font-semibold text-slate-950">Tentang Perum BULOG</h2>
            <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-600 md:text-base">
              Perusahaan Umum BULOG (Perum BULOG) adalah Badan Usaha Milik Negara yang berdiri pada tanggal 21 Januari 2003. Pendiriannya berdasarkan Peraturan Pemerintah No. 7 Tahun 2003 tentang Pendirian Perusahaan Umum (Perum) BULOG, sebagaimana telah diubah dengan Peraturan Pemerintah Nomor 61 Tahun 2003. Peraturan Pemerintah Nomor 7 tahun 2003 tersebut kemudian diubah kembali menjadi PP Nomor 13 Tahun 2016 tentang Perum BULOG.
            </p>
          </div>
        </section>

        {/* Visi & Misi */}
        <section id="visi-misi" className="border-b border-border bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-2">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Visi</p>
              <div className="mt-3 rounded-lg bg-primary p-6 text-white">
                <p className="text-lg font-semibold leading-8 md:text-xl">Menjadi Pemimpin Rantai Pasok Pangan Terpercaya di Indonesia yang memberikan Pelayanan Prima demi Kesejahteraan Masyarakat Indonesia.</p>
              </div>
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">Misi</p>
              <div className="mt-3 grid gap-3">
                {misi.map((item, index) => (
                  <div key={index} className="flex gap-3 rounded-lg border border-border bg-white p-4">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary-tint text-xs font-bold text-primary">{index + 1}</span>
                    <p className="text-sm leading-6 text-slate-700">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Tata Nilai AKHLAK */}
        <section id="tata-nilai" className="mx-auto max-w-6xl px-5 py-10">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-950">Tata nilai AKHLAK</h2>
            <p className="mt-1 text-sm text-slate-600">Nilai-nilai utama BUMN yang dijaga dalam setiap proses kerja.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {akhlak.map((value) => (
              <div key={value.name} className="rounded-lg border border-border bg-white p-5">
                <h3 className="text-sm font-semibold text-primary-dark">{value.name}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-600">{value.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Alur transaksi (informasional, tanpa data transaksi) */}
        <section id="alur" className="mx-auto max-w-6xl px-5 pb-14">
          <div className="mb-5">
            <h2 className="text-lg font-semibold text-slate-950">Alur transaksi</h2>
            <p className="mt-1 text-sm text-slate-600">TJP dimulai dari Jemput Pangan, sedangkan MPP dimulai langsung dari Makloon.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-7">
            {alurStages.map((stage, index) => (
              <div key={stage.label} className="rounded-lg border border-border bg-white p-4">
                <p className="text-xs font-bold text-slate-400">{String(index + 1).padStart(2, '0')}</p>
                <h3 className="mt-3 text-sm font-semibold text-slate-950">{stage.label}</h3>
                <p className="mt-2 min-h-10 text-xs leading-5 text-slate-600">{stage.note}</p>
                <div className="mt-4 flex gap-2">
                  {stage.schemes.map((s) => (
                    <span key={s} className="rounded bg-primary-tint px-2 py-1 text-xs font-semibold text-primary">{s}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer id="kontak" className="bg-primary-dark text-white">
        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-8 md:grid-cols-3">
          <div><p className="font-semibold">Konekto</p><p className="mt-3 text-sm leading-6 text-white/75">Sistem informasi serap gabah Perum BULOG Kanwil Lampung.</p></div>
          <div><p className="text-sm font-semibold">Kantor wilayah</p><p className="mt-3 text-sm leading-6 text-white/75">Jl. Soekarno-Hatta, Bandar Lampung<br />(0721) 000-000</p></div>
          <div>
            <p className="text-sm font-semibold">Akses</p>
            <div className="mt-3 grid gap-1 text-sm text-white/75">
              <a href="#riwayat" className="hover:text-white">Tentang Perum BULOG</a>
              <a href="#visi-misi" className="hover:text-white">Visi &amp; misi</a>
              <a href="#tata-nilai" className="hover:text-white">Tata nilai</a>
              <a href="#alur" className="hover:text-white">Alur transaksi</a>
            </div>
          </div>
        </div>
        <div className="border-t border-white/10 py-3 text-center text-xs text-white/60">2026 Perum BULOG Kanwil Lampung. Seluruh hak cipta dilindungi.</div>
      </footer>
    </div>
  )
}
