# Desain: Draft untuk Pengadaan & Keuangan + Kategori Antrean Sebenarnya

> Tanggal: 2026-07-31. Acuan induk: `SERGAB-panduan-pengembangan.md`.
> Menyentuh: antrean "Transaksi menunggu tindakan" (Bagian 7), alur PO (Bagian 3.4).

## 1. Masalah

Tiga hal yang saling berkaitan:

**a. Keuangan tidak punya cara menyimpan tanpa memfinalkan.** `PembayaranForm` hanya punya
"Tandai Dibayarkan", yang langsung menandai PO diterima *dan* seluruh transaksi anggotanya
`status_keseluruhan = 'selesai'`. Tidak ada jalan menyimpan No. SPP / tanggal bayar sementara.

**b. Pengadaan sudah bisa menyimpan, tapi tidak terlihat sebagai draft.** `PoInForm` menyimpan
No. IN / No. SPP selama status Sergab belum `lengkap` (`lengkap` itulah sinyal kirimnya), namun
tidak ada penanda apa pun sehingga antrean tidak bisa membedakannya dari "belum disentuh".

**c. Antrean melempar Pengadaan & Keuangan ke satu label buntu.** Kategori `po`
("Lanjut di halaman PO") berlaku untuk *setiap* transaksi di kedua tahap itu, tanpa syarat lain.
Ia bukan jenis pekerjaan melainkan pengakuan tidak tahu — lihat §2.

### Akar penyebab (c): klasifikasi dihitung di dua tempat

| | Sumber data | Dipakai untuk |
|---|---|---|
| Server, `KerjaanTransaksi::ekspresi()` | LEFT JOIN `kj_pd`/`kj_keu` — **tahu** kondisi PO | angka chip + filter `?kerjaan=` |
| Browser, `kerjaan()` | relasi ter-eager-load — **tidak tahu** kondisi PO | badge tiap baris |

`TransaksiController::index()` memuat `dataJemputPangan`, `dataMakloonMpp`, `dataMakloonTjp`,
`dataUbJastasma`, `creator` — tanpa `poDetail`/`dataPengadaan`. Baris tidak tahu kondisi PO-nya,
jadi frontend tidak bisa membedakan "belum digabung ke PO" dari "sudah diisi belum dikirim", dan
menyerah ke `po`.

`kerjaanTransaksi.ts` sudah memperingatkan dirinya sendiri: *"URUTAN CASE WAJIB SAMA dengan versi
frontend"* — sebuah aturan yang hanya bisa dijaga manual.

## 2. Keputusan

**K1. Kategori `po` dihapus.** Setelah baris tahu kondisi PO-nya, setiap kasus jatuh ke salah satu
dari empat kategori nyata (matriks §5 membuktikan tidak ada sisa). `po` tidak menyisakan kasus.

**K2. Klasifikasi jadi satu sumber: SQL.** `index()` menandai tiap baris dengan hasil
`KerjaanTransaksi::ekspresi()`; frontend berhenti mengklasifikasi dan tinggal merender label.
Penyimpangan server–browser jadi mustahil secara struktural, bukan lewat disiplin. Ini alasan
yang sama yang dulu memindahkan hitungan & filter ke SQL.

**K3. Draft dinyatakan lewat `review_status`, bukan kolom baru.** Nilai `'draft'` ditambahkan ke
enum `review_status` pada `data_pengadaan` dan `data_keuangan`, sekaligus jadi default-nya. Ini
memakai kosakata yang sudah dipakai record tahap (`draft`/`menunggu_review`/`diterima`/`ditolak`).

**K4. Tidak ada parameter request baru.** Sinyal kirim sudah ada di domainnya masing-masing
(§4), jadi `aksi=draft|submit` seperti role tahap tidak diperlukan.

**K5. Tidak perlu tautan lintas-halaman — semua form PO sudah ada di TransaksiDetailPage.**
`GabungPoForm`, `PoInForm`, `PoReviewCard`, **dan `PembayaranForm`** semuanya sudah dirender di
timeline transaksi (`PembayaranForm` di baris ~805, gerbang
`showKeuanganBayar = poAccepted && !poPaid && isKeuanganRole`). Jadi baris antrean Pengadaan
maupun Keuangan yang berlabel "Perlu diisi"/"Draft belum dikirim" sudah mengarah ke tempat yang
benar-benar bisa dikerjakan, tanpa perubahan apa pun.

> Koreksi: draf spec ini sempat menyatakan `PembayaranForm` "terkurung di /keuangan" dan perlu
> ditambahkan. Itu keliru — komponennya dipakai di dua tempat sejak awal. Tidak ada pekerjaan
> yang timbul dari keputusan ini.

## 3. Perubahan data

Satu migrasi:

```sql
ALTER TABLE data_pengadaan MODIFY review_status
  ENUM('draft','menunggu_review','diterima','ditolak') NOT NULL DEFAULT 'draft';
ALTER TABLE data_keuangan  MODIFY review_status
  ENUM('draft','menunggu_review','diterima','ditolak') NOT NULL DEFAULT 'draft';
```

**Baris lama tidak di-backfill.** Yang bernilai `menunggu_review` sekarang memang benar-benar
sedang menunggu direview; mengubahnya akan menarik mundur pekerjaan yang sedang berjalan.

Efek samping yang diinginkan: PO baru dibuat selama ini langsung bernilai `menunggu_review`
padahal belum dikirim ke siapa pun. Default `draft` membetulkan itu.

`down()` mengembalikan enum ke tiga nilai; baris `draft` dipetakan ke `menunggu_review` lebih
dulu agar tidak ditolak MySQL.

## 4. Perubahan backend

### 4.1 Sinyal simpan vs kirim

| Role | Simpan (draft) | Kirim |
|---|---|---|
| Pengadaan | status Sergab ≠ `lengkap` → `review_status='draft'` | status Sergab = `lengkap` → seperti sekarang (`menunggu_review` + transaksi ke `keuangan`) |
| Keuangan | `status_bayar='belum'` → `review_status='draft'` | `status_bayar='dibayarkan'` → seperti sekarang (`diterima` + transaksi `selesai`) |

- `PengadaanController::update()` dan `isiNomorIn()`: saat status Sergab bukan `lengkap`, set
  `review_status='draft'`. Cabang `lengkap` yang sudah ada tidak disentuh.

  Termasuk saat PO sebelumnya `ditolak`: menyimpan perbaikan mengubahnya `ditolak` → `draft`,
  sehingga badge baris berpindah dari "Perlu diperbaiki" ke "Draft belum dikirim". Itu memang
  keadaan sebenarnya (perbaikan sudah dimulai tapi belum dikirim), dan sama dengan perilaku
  `TransaksiStageService::saveDraft()` pada role tahap. `catatan_penolakan` tetap ditampilkan
  `PoInForm` sampai PO dikirim ulang, jadi konteks penolakannya tidak hilang.

  Penjaga `review_status === 'diterima'` di `update()` tetap: PO yang sudah diterima Keuangan
  tidak bisa dikembalikan menjadi draft.
- `PoLifecycleService::updatePembayaran()`: `resetReview()` sekarang selalu menulis
  `menunggu_review`; diubah menjadi `draft`. Cabang `dibayarkan` yang menimpanya dengan
  `diterima` tetap. Penjaga "sudah diterima tidak dapat diubah" tetap.

### 4.2 Ekspresi kerjaan

Di `KerjaanTransaksi::ekspresi()`, cabang `WHEN current_stage IN ('pengadaan','keuangan') THEN 'po'`
dihapus, dan dua cabang yang tersisa ditambah:

- **periksa** — tambah `current_stage='keuangan' AND kj_pd.review_status='menunggu_review'`
  (Keuangan mereview PO). Pengadaan sudah tertangkap lewat `kj_ub.status='menunggu_review'`.
- **draft** — tambah `current_stage='pengadaan' AND kj_pd.review_status='draft'`
  dan `current_stage='keuangan' AND kj_keu.review_status IN ('draft','menunggu_review')`.
  `menunggu_review` ikut dipetakan ke draft demi baris `data_keuangan` lama yang tersimpan lewat
  jalur API langsung dengan `status_bayar='belum'`.
- **isi** — tetap `ELSE`, kini juga menampung "Pengadaan belum menggabung PO" dan "Keuangan belum
  mengisi pembayaran".

Urutan cabang tidak berubah: `ditolak` → `periksa` → `draft` → `isi`.

`KerjaanTransaksi::SEMUA` kehilangan `'po'`, sehingga `Rule::in(KerjaanTransaksi::SEMUA)` pada
validasi `?kerjaan=` ikut menolaknya.

### 4.3 Menandai baris di `index()`

`index()` memasang `KerjaanTransaksi::joinTahap()` dan `selectRaw(ekspresi().' as kerjaan')`,
lalu `TransaksiResource` mengekspos `kerjaan`.

**Wajib:** `joinTahap()` hanya boleh dipanggil **sekali**. Sekarang ia dipanggil di dalam cabang
filter `?kerjaan=`; kalau ia juga dipanggil tanpa syarat, alias `kj_*` terdaftar dua kali dan
MySQL menolak query. Cabang filter berubah jadi memanggil `KerjaanTransaksi::filter($query, ...)`
saja atas query yang sudah ter-join.

**Ceiling yang diterima:** `joinTahap()` menambah 7 LEFT JOIN ke setiap query antrean, dan
`data_makloon_mpp`/`tjp`/`data_jemput_pangan` jadi ter-join dua kali (sekali tanpa alias untuk
`ORDER BY`, sekali sebagai `kj_*`). Duplikasi itu memang disengaja — alias `kj_` ada justru supaya
tidak bentrok dengan join pemanggil. Halaman dibatasi 20 baris dan semua join lewat FK
terindeks, jadi diterima apa adanya; digabung hanya kalau profil query menunjukkan masalah.

## 5. Matriks kategori (bukti tidak ada sisa)

**Pengadaan** (`current_stage='pengadaan'`):

| Kondisi | Kategori | Kerjanya |
|---|---|---|
| `kj_ub.status='menunggu_review'` | Perlu dicek | Terima/Tolak data UB Jastasma |
| `kj_pd.review_status='ditolak'` | Perlu diperbaiki | Perbaiki PO yang ditolak Keuangan |
| belum punya PO | Perlu diisi | Gabungkan transaksi ke PO |
| `kj_pd.review_status='draft'` | Draft belum dikirim | Lengkapi IN/SPP, set status Sergab `lengkap` |

**Keuangan** (`current_stage='keuangan'`):

| Kondisi | Kategori | Kerjanya |
|---|---|---|
| `kj_pd.review_status='menunggu_review'` | Perlu dicek | Terima/Tolak PO dari Pengadaan |
| `kj_keu.review_status='ditolak'` | Perlu diperbaiki | (jalur yang sudah ada) |
| PO diterima, `data_keuangan` belum ada | Perlu diisi | Isi No. SPP + tanggal bayar |
| `kj_keu.review_status='draft'` | Draft belum dikirim | Tandai Dibayarkan |

Setelah "Tandai Dibayarkan", transaksi jadi `status_keseluruhan='selesai'` dan keluar dari antrean
— `index()` menyaring `berjalan`. Setelah Keuangan menolak, transaksi kembali ke `pengadaan`
dengan `kj_pd.review_status='ditolak'` → masuk **Perlu diperbaiki** milik Pengadaan.

## 6. Perubahan frontend

- **`kerjaanTransaksi.ts`** — `'po'` dibuang dari `KerjaanId`, `KERJAAN_LABEL`,
  `KERJAAN_KETERANGAN`, `KERJAAN_URUT`. Fungsi `kerjaan(row)` berhenti mengklasifikasi dan
  membaca `row.kerjaan` dari server; yang tersisa hanya pemetaan presentasi
  (`cls` badge + `judul` tooltip). `rejectedStages()` tetap — ia dipakai untuk menampilkan catatan
  penolakan, bukan untuk mengklasifikasi. `dataTahapSaatIni()`/`dataMenungguReview()` dihapus bila
  tidak ada pemakai lain.
- **`useTransaksiList.ts`** — `TransaksiListItem` dapat field `kerjaan: KerjaanId`.
- **`PembayaranForm.tsx`** — tombol **"Simpan"** di samping "Tandai Dibayarkan", mengirim
  `status_bayar: 'belum'` dengan No. SPP + tanggal bayar apa adanya (tanggal boleh kosong saat
  draft; tetap wajib untuk "Tandai Dibayarkan"). Karena komponen ini dipakai halaman `/keuangan`
  **dan** timeline transaksi, tombolnya otomatis muncul di keduanya.
- **`TransaksiDetailPage.tsx`** — tidak disentuh (lihat K5).

Tombol Simpan role lain **tidak disentuh** — Jemput Pangan, Makloon TJP/MPP, UB Jastasma, dan
Pengadaan semuanya sudah punya.

## 7. Di luar cakupan

- **Operasi & Gudang** — tidak punya halaman maupun route sama sekali (modul Pengolahan di
  `2026-07-20-pengolahan-workflow-design.md` belum dibangun), dan bukan bagian timeline transaksi.
  Tidak ada form untuk diberi tombol Simpan.
- **Membatalkan PO yang sudah lunas** — tidak dibuka. Itu berarti membalik transaksi yang sudah
  `selesai`.
- **Backfill baris lama** — lihat §3.

## 8. Pengujian

**Backend**
- Draft Pengadaan: menyimpan dengan status Sergab ≠ `lengkap` menghasilkan `review_status='draft'`
  dan **tidak** memajukan `current_stage`.
- Kirim Pengadaan: status `lengkap` tetap memindahkan seluruh transaksi anggota ke `keuangan`.
- Draft Keuangan: `status_bayar='belum'` menghasilkan `review_status='draft'`, dan transaksi
  **tidak** menjadi `selesai`.
- Kirim Keuangan: `dibayarkan` tetap menandai `diterima` + `selesai`.
- Klasifikasi: satu test per baris matriks §5, lewat endpoint `/api/transaksi` (badge) dan
  `?kerjaan=` (filter), memastikan keduanya sepakat.
- `?kerjaan=po` ditolak 422.

**Frontend**
- `kerjaanTransaksi.test.ts` yang sudah ada (9 test) disesuaikan: kasus `po` diganti kasus baru,
  dan test klasifikasi berubah jadi test pemetaan presentasi.
