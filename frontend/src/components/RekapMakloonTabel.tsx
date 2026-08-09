import { useMemo, useState } from 'react'
import { useRekapMakloon, type BarisRekapMakloon } from '../hooks/useRekapMakloon'
import { downloadCsv, type ExportColumn } from '../lib/exportCsv'
import { hitungTotalNeraca } from '../lib/neracaMakloon'
import { formatDesimal, formatNumber } from '../lib/poFormat'

/**
 * Neraca gabah per makloon: satu baris per mitra, menyatukan rantai SerGab (gabah masuk, IN, SPP)
 * dengan rantai Pengolahan (olahan, hasil olah, MO/OUT). Pengganti kertas kerja Excel yang
 * sebelumnya disusun tangan.
 *
 * TIDAK memakai DataSpreadsheet: tabel ini butuh kepala berkelompok, kolom identitas yang
 * dibekukan, dan baris TOTAL yang ikut hasil filter -- tiga hal yang tidak dimiliki komponen itu.
 * Menambahkannya ke sana berarti mengutak-atik tabel yang dipakai seluruh halaman Rekap
 * (termasuk SerGab) demi satu pemakai. Yang dipakai bersama tetap: downloadCsv & format angka.
 */

type Jenis = 'kg' | 'mutu' | 'persen'

type Kolom = {
  key: keyof BarisRekapMakloon
  label: string
  jenis: Jenis
  /** Kolom yang WAJAR bernilai minus -- diberi warna supaya bukan terbaca sebagai salah hitung. */
  bisaMinus?: boolean
}

type Grup = {
  label: string
  /** Warna kepala kelompok, meniru pita warna kertas kerja aslinya. */
  kepala: string
  /** Warna latar sel isinya, versi jauh lebih samar dari kepalanya. */
  sel: string
  kolom: Kolom[]
}

const GRUP: Grup[] = [
  {
    label: 'Gabah (GKP) — dari alur Serap Gabah',
    kepala: 'bg-[#FDF0CE] text-[#6B4E12]',
    sel: 'bg-[#FEFBF2]',
    kolom: [
      { key: 'gabah_diterima', label: 'Gabah Diterima', jenis: 'kg' },
      { key: 'gabah_sudah_in', label: 'Gabah Sudah IN', jenis: 'kg' },
      { key: 'gabah_belum_in', label: 'Gabah Belum IN', jenis: 'kg', bisaMinus: true },
      { key: 'gabah_spp', label: 'Gabah SPP', jenis: 'kg' },
      { key: 'gabah_belum_spp', label: 'Gabah Belum SPP', jenis: 'kg', bisaMinus: true },
    ],
  },
  {
    label: 'Administrasi & Stok — dari alur Pengolahan',
    kepala: 'bg-[#DCE7F7] text-[#1D3357]',
    sel: 'bg-[#F6F9FD]',
    kolom: [
      { key: 'olah_rekap', label: 'Sudah Diolah, Belum Administrasi', jenis: 'kg' },
      { key: 'belum_adm_belum_olah', label: 'Belum Administrasi, Belum Olah', jenis: 'kg', bisaMinus: true },
      { key: 'olah_selesai', label: 'Sudah Diolah, Sudah Administrasi', jenis: 'kg' },
      { key: 'stok_real', label: 'Stok Real', jenis: 'kg', bisaMinus: true },
    ],
  },
  {
    label: 'Hasil Olah — dari LHPK UB Jastasma',
    kepala: 'bg-[#D8EEDF] text-[#14532D]',
    sel: 'bg-[#F5FBF7]',
    kolom: [
      { key: 'hgl', label: 'HGL', jenis: 'kg' },
      { key: 'kualitas', label: 'Kualitas', jenis: 'mutu' },
      { key: 'broken', label: 'Broken', jenis: 'mutu' },
      { key: 'menir', label: 'Menir', jenis: 'mutu' },
      { key: 'katul', label: 'Katul', jenis: 'mutu' },
      { key: 'reject', label: 'Reject', jenis: 'mutu' },
    ],
  },
  {
    label: 'Kinerja',
    kepala: 'bg-[#F7DFC4] text-[#7A4A12]',
    sel: 'bg-[#FDF8F2]',
    kolom: [
      { key: 'rendemen', label: 'Rata-rata Rendemen', jenis: 'persen' },
      { key: 'hgl_operasi', label: 'Realisasi Penerimaan HGL', jenis: 'kg' },
      { key: 'hgl_belum_adm', label: 'HGL Belum Administrasi', jenis: 'kg', bisaMinus: true },
      { key: 'persentase_olah', label: '% Gabah Diolah vs Administrasi', jenis: 'persen' },
    ],
  },
]

const SEMUA_KOLOM = GRUP.flatMap((g) => g.kolom)

function tampil(nilai: number, jenis: Jenis) {
  if (jenis === 'persen') return `${formatDesimal(nilai)}%`
  // Kuantum kilogram selalu bulat; angka mutu boleh berdesimal (mis. 6,5).
  return jenis === 'kg' ? formatNumber(nilai) : formatDesimal(nilai)
}

export default function RekapMakloonTabel() {
  const { data: rows = [], isLoading, isError } = useRekapMakloon()
  const [q, setQ] = useState('')
  const [wilayah, setWilayah] = useState('semua')

  const daftarWilayah = useMemo(
    () => [...new Set(rows.map((r) => r.kabupaten).filter((v): v is string => !!v))].sort((a, b) => a.localeCompare(b, 'id-ID')),
    [rows],
  )

  const tampilRows = useMemo(() => {
    const kunci = q.trim().toLowerCase()
    return rows.filter((row) => {
      if (wilayah !== 'semua' && (row.kabupaten ?? '') !== wilayah) return false
      if (!kunci) return true
      return [row.nama_maklon, row.kecamatan, row.kabupaten]
        .some((teks) => (teks ?? '').toLowerCase().includes(kunci))
    })
  }, [rows, q, wilayah])

  const total = useMemo(() => hitungTotalNeraca(tampilRows), [tampilRows])

  const unduh = () => {
    const kolomEkspor: ExportColumn<BarisRekapMakloon>[] = [
      { key: 'nama_maklon', label: 'Nama Makloon', value: (r) => r.nama_maklon },
      { key: 'kecamatan', label: 'Kecamatan', value: (r) => r.kecamatan ?? '' },
      { key: 'kabupaten', label: 'Kabupaten', value: (r) => r.kabupaten ?? '' },
      // Nilai mentah tanpa pemisah ribuan supaya Excel membacanya sebagai angka, bukan teks.
      ...SEMUA_KOLOM.map((k) => ({ key: k.key, label: k.label, value: (r: BarisRekapMakloon) => Number(r[k.key]) })),
    ]
    // Baris TOTAL ikut terbawa dan mengikuti filter yang sedang aktif -- sama dengan yang dilihat
    // di layar, supaya file dan tampilan tidak pernah bercerita beda.
    const barisTotal = { ...total, nama_maklon: 'TOTAL', kecamatan: '', kabupaten: '' } as unknown as BarisRekapMakloon
    downloadCsv('neraca-gabah-per-makloon', [...tampilRows, barisTotal], kolomEkspor)
  }

  return (
    <section className="panel panel-pad">
      <div className="toolbar-card mb-4">
        <div>
          <p className="text-[0.68rem] font-bold uppercase tracking-[0.18em] text-accent">Monitoring</p>
          <h2 className="section-title mt-1">Neraca Gabah per Makloon</h2>
          <p className="page-subtitle">
            Satu baris per mitra makloon, menggabungkan alur Serap Gabah dan alur Pengolahan.
            Hanya data yang sudah masuk rekap yang dihitung — yang masih menunggu review belum final.
          </p>
        </div>
        <span className="badge">{tampilRows.length} dari {rows.length} makloon</span>
      </div>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input max-w-xs"
            placeholder="Cari makloon, kecamatan, kabupaten..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <select className="input max-w-[12rem]" value={wilayah} onChange={(e) => setWilayah(e.target.value)}>
            <option value="semua">Semua kabupaten</option>
            {daftarWilayah.map((nama) => <option key={nama} value={nama}>{nama}</option>)}
          </select>
          {(q !== '' || wilayah !== 'semua') && (
            <button
              type="button"
              onClick={() => { setQ(''); setWilayah('semua') }}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-muted underline hover:text-primary-dark"
            >
              Bersihkan filter
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={unduh}
          disabled={tampilRows.length === 0}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-accent px-4 py-2 text-xs font-bold text-primary-dark shadow-sm transition-all hover:bg-primary hover:text-white hover:shadow-md disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 3v10m0 0 3.5-3.5M10 13l-3.5-3.5M3.5 15.5h13" />
          </svg>
          Unduh Excel
        </button>
      </div>

      {isLoading && <div className="panel px-4 py-3 text-sm text-muted">Memuat neraca gabah...</div>}

      {!isLoading && isError && (
        <div className="empty-state">
          <div className="empty-title">Gagal memuat neraca</div>
          <p className="empty-copy">Data tidak dapat diambil dari server. Coba muat ulang halaman.</p>
        </div>
      )}

      {!isLoading && !isError && tampilRows.length === 0 && (
        <div className="empty-state">
          <div className="empty-title">{rows.length === 0 ? 'Belum ada aktivitas makloon' : 'Tidak ada makloon yang cocok'}</div>
          <p className="empty-copy">
            {rows.length === 0
              ? 'Baris muncul setelah gabah seorang mitra masuk rekap Serap Gabah atau rekap Pengolahan.'
              : 'Coba kata kunci lain, atau pilih kabupaten yang berbeda.'}
          </p>
        </div>
      )}

      {!isLoading && !isError && tampilRows.length > 0 && (
        <div className="max-h-[72vh] overflow-auto rounded-lg border border-border">
          <table className="w-full border-collapse text-[0.8125rem] whitespace-nowrap">
            <thead className="sticky top-0 z-20">
              {/* Baris pertama kepala: pita kelompok, seperti "GKP" & "Hasil Olah" di kertas kerja. */}
              <tr>
                {/* Nomor & nama jadi SATU sel lengket, bukan dua. Dua kolom lengket berdampingan
                    menuntut offset `left` sebesar lebar kolom pertama, dan lebar itu ditentukan
                    isinya -- begitu tidak sama persis, sel kedua bergeser menutupi tepi kolom
                    berikutnya (huruf pertama angkanya terpotong). Satu sel menghapus soalnya. */}
                <th className="sticky left-0 z-30 border-b border-r border-border bg-primary-tint px-3 py-2" />
                {GRUP.map((grup) => (
                  <th
                    key={grup.label}
                    colSpan={grup.kolom.length}
                    className={`border-b border-r border-border px-3 py-2 text-center text-[0.72rem] font-extrabold uppercase tracking-[0.08em] ${grup.kepala}`}
                  >
                    {grup.label}
                  </th>
                ))}
              </tr>
              <tr>
                <th className="sticky left-0 z-30 border-b border-r border-border bg-primary-tint px-3 py-2 text-left font-bold text-primary-dark">Nama Makloon</th>
                {GRUP.flatMap((grup) =>
                  grup.kolom.map((kolom) => (
                    <th
                      key={kolom.key}
                      className={`border-b border-r border-border px-3 py-2 text-right align-bottom font-bold ${grup.kepala}`}
                    >
                      <span className="block max-w-[9rem] whitespace-normal leading-4">{kolom.label}</span>
                      <span className="mt-0.5 block text-[0.6rem] font-semibold normal-case opacity-70">
                        {kolom.jenis === 'persen' ? '%' : 'kg'}
                      </span>
                    </th>
                  )),
                )}
              </tr>
            </thead>

            <tbody>
              {tampilRows.map((row, i) => (
                // Warna hover WAJIB pekat: dua kolom pertama lengket dan mewarisi warna baris ini.
                // Warna tembus pandang membuat sel yang tergulir di bawahnya terbaca menembusnya.
                <tr key={row.makloon_user_id} className="odd:bg-white even:bg-surface hover:bg-primary-tint">
                  <td className="sticky left-0 z-10 border-b border-r border-border bg-inherit px-3 py-2">
                    <span className="mr-2 tabular-nums text-muted">{i + 1}</span>
                    <span className="font-semibold text-primary-dark">{row.nama_maklon}</span>
                    {row.kabupaten && <span className="ml-2 text-[0.68rem] text-muted">{row.kabupaten}</span>}
                  </td>
                  {GRUP.flatMap((grup) =>
                    grup.kolom.map((kolom) => {
                      const nilai = Number(row[kolom.key]) || 0
                      return (
                        <td
                          key={kolom.key}
                          className={`border-b border-r border-border px-3 py-2 text-right tabular-nums ${grup.sel} ${
                            kolom.bisaMinus && nilai < 0 ? 'font-semibold text-danger' : ''
                          }`}
                        >
                          {tampil(nilai, kolom.jenis)}
                        </td>
                      )
                    }),
                  )}
                </tr>
              ))}
            </tbody>

            {/* Baris TOTAL lengket di dasar tabel: 19 kolom berarti banyak menggulir, dan total yang
                ikut tergulir hilang justru saat paling dibutuhkan. */}
            <tfoot className="sticky bottom-0 z-20">
              <tr className="bg-primary-dark text-white">
                <th className="sticky left-0 z-30 border-t border-r border-white/15 bg-primary-dark px-3 py-2.5 text-left font-extrabold">
                  TOTAL
                  <span className="ml-2 text-[0.68rem] font-normal text-white/60">{tampilRows.length} makloon tampil</span>
                </th>
                {SEMUA_KOLOM.map((kolom) => (
                  <td key={kolom.key} className="border-t border-r border-white/15 px-3 py-2.5 text-right font-extrabold tabular-nums">
                    {tampil(total[kolom.key] ?? 0, kolom.jenis)}
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <PenjelasanKolom />
    </section>
  )
}

type Penjelasan = { judul: string; isi: string; rumus?: string }

/**
 * Kartu penjelasan asal-usul tiap kolom, ditulis untuk orang yang TIDAK tahu isi database:
 * setiap kalimat menunjuk ke layar & tombol yang dikenal petugas, bukan ke nama tabel.
 */
const PENJELASAN: { grup: string; kepala: string; item: Penjelasan[] }[] = [
  {
    grup: 'Gabah (GKP) — dari alur Serap Gabah',
    kepala: 'bg-[#FDF0CE] text-[#6B4E12]',
    item: [
      {
        judul: 'Gabah Diterima',
        isi: 'Seluruh gabah yang sudah dibongkar di makloon dan datanya sudah diterima, sehingga sudah muncul di Rekap Sergab. Gabah yang masih menunggu review belum dihitung karena timbangannya belum final.',
      },
      {
        judul: 'Gabah Sudah IN',
        isi: 'Bagian dari gabah di atas yang sudah mendapat Nomor IN dari Pengadaan.',
      },
      {
        judul: 'Gabah Belum IN',
        isi: 'Gabah yang sudah diterima tapi Nomor IN-nya belum diisi Pengadaan.',
        rumus: 'Gabah Diterima − Gabah Sudah IN',
      },
      {
        judul: 'Gabah SPP',
        isi: 'Gabah yang PO-nya sudah dikirim Pengadaan lewat Nomor SPP dan sudah ditekan "Terima" oleh Keuangan.',
      },
      {
        judul: 'Gabah Belum SPP',
        isi: 'Gabah yang belum sampai diterima Keuangan — masih di tangan Pengadaan atau menunggu pemeriksaan.',
        rumus: 'Gabah Diterima − Gabah SPP',
      },
    ],
  },
  {
    grup: 'Administrasi & Stok — dari alur Pengolahan',
    kepala: 'bg-[#DCE7F7] text-[#1D3357]',
    item: [
      {
        judul: 'Sudah Diolah, Belum Administrasi',
        isi: 'Kuantum gabah yang diolah menurut LHPK UB Jastasma yang sudah diterima, sehingga sudah tampil di Rekap Pengolahan.',
      },
      {
        judul: 'Belum Administrasi, Belum Olah',
        isi: 'Gabah yang nomor IN-nya sudah ada tapi belum tercatat diolah di LHPK mana pun. Bisa minus kalau yang diolah lebih banyak daripada yang sudah ber-IN.',
        rumus: 'Gabah Sudah IN − Sudah Diolah Belum Administrasi',
      },
      {
        judul: 'Sudah Diolah, Sudah Administrasi',
        isi: 'Gabah olahan yang urusan administrasinya benar-benar tuntas: sudah masuk MO dan Nomor OUT-nya sudah terbit, sehingga pengolahannya berstatus selesai.',
      },
      {
        judul: 'Stok Real',
        isi: 'Perkiraan gabah yang masih ada di mitra: sudah ber-IN tapi administrasi olahnya belum tuntas.',
        rumus: 'Gabah Sudah IN − Sudah Diolah Sudah Administrasi',
      },
    ],
  },
  {
    grup: 'Hasil Olah — dari LHPK UB Jastasma',
    kepala: 'bg-[#D8EEDF] text-[#14532D]',
    item: [
      {
        judul: 'HGL',
        isi: 'Total beras HGL hasil pengolahan menurut LHPK yang sudah diterima.',
      },
      {
        judul: 'Kualitas, Broken, Menir, Katul, Reject',
        isi: 'Angka mutu yang diisi UB Jastasma di LHPK, dijumlah dari seluruh LHPK milik mitra ini yang sudah diterima. Kolom Kualitas diisi bebas di form; kalau isiannya berupa huruf, ia terbaca nol di sini.',
      },
    ],
  },
  {
    grup: 'Kinerja',
    kepala: 'bg-[#F7DFC4] text-[#7A4A12]',
    item: [
      {
        judul: 'Rata-rata Rendemen',
        isi: 'Seberapa banyak beras yang dihasilkan dari gabah yang administrasinya sudah tuntas.',
        rumus: 'HGL ÷ Sudah Diolah Sudah Administrasi × 100%',
      },
      {
        judul: 'Realisasi Penerimaan HGL',
        isi: 'Beras HGL yang MO-nya sudah diterima Pengadaan, yaitu yang sudah tampil di rekap milik Operasi.',
      },
      {
        judul: 'HGL Belum Administrasi',
        isi: 'Selisih antara HGL yang sudah direalisasi lewat MO dengan HGL yang dilaporkan UB. Minus berarti laporan UB lebih besar daripada yang sudah direalisasi.',
        rumus: 'Realisasi Penerimaan HGL − HGL',
      },
      {
        judul: '% Gabah Diolah vs Administrasi',
        isi: 'Seberapa jauh gabah yang sudah ber-IN benar-benar tuntas diolah dan diadministrasikan. Mendekati 100% berarti hampir tidak ada yang menggantung.',
        rumus: 'Sudah Diolah Sudah Administrasi ÷ Gabah Sudah IN × 100%',
      },
    ],
  },
]

function PenjelasanKolom() {
  const [buka, setBuka] = useState(false)

  return (
    <section className="mt-5 rounded-xl border border-border bg-surface">
      <button
        type="button"
        onClick={() => setBuka((v) => !v)}
        aria-expanded={buka}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span>
          <span className="block text-sm font-extrabold text-primary-dark">Dari mana angka-angka ini berasal?</span>
          <span className="mt-0.5 block text-xs text-muted">
            Penjelasan tiap kolom dengan bahasa sehari-hari, beserta rumus kolom yang dihitung dari kolom lain.
          </span>
        </span>
        <span className="shrink-0 rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-bold text-primary">
          {buka ? 'Sembunyikan' : 'Lihat penjelasan'}
        </span>
      </button>

      {buka && (
        <div className="grid gap-4 border-t border-border px-4 py-4 lg:grid-cols-2">
          {PENJELASAN.map((blok) => (
            <div key={blok.grup} className="rounded-lg border border-border bg-white p-4">
              <span className={`inline-block rounded-md px-2.5 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.06em] ${blok.kepala}`}>
                {blok.grup}
              </span>
              <dl className="mt-3 space-y-3">
                {blok.item.map((item) => (
                  <div key={item.judul}>
                    <dt className="text-xs font-extrabold text-primary-dark">{item.judul}</dt>
                    <dd className="mt-1 text-xs leading-5 text-slate-600">
                      {item.isi}
                      {item.rumus && (
                        <span className="mt-1.5 block rounded bg-surface px-2 py-1 font-mono text-[0.7rem] text-primary-dark">
                          {item.rumus}
                        </span>
                      )}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ))}

          <p className="text-xs leading-5 text-muted lg:col-span-2">
            Catatan: satu mitra hanya muncul di tabel kalau gabahnya sudah masuk salah satu rekap.
            Baris <strong>TOTAL</strong> selalu mengikuti pencarian dan filter yang sedang aktif — dua kolom
            persen di baris itu dihitung ulang dari totalnya, bukan dirata-rata, supaya mitra besar
            dan mitra kecil tidak diberi bobot sama.
          </p>
        </div>
      )}
    </section>
  )
}
