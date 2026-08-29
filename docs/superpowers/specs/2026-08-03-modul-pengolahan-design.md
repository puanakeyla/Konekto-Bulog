# Desain: Modul Pengolahan (alur GDG & UBJ)

> Tanggal: 2026-08-03. Dikerjakan di branch `pengolahan`, DB `konekto_pengolahan`.
>
> **Menggantikan `2026-07-20-pengolahan-workflow-design.md`.** Spec lama itu memakai alur
> `UB Jastasma → Operasi → Pengadaan → Operasi → Gudang` dengan satu skema. Alur yang benar
> adalah dua skema empat tahap yang dijelaskan di dokumen ini. Modul lamanya sudah dihapus
> (migration `2026_07_20_100000_drop_operasi_gudang_tables`), jadi tidak ada teardown lagi —
> dokumen ini membangun dari nol.

## 1. Ringkas

Alur Pengolahan adalah rantai kerja **kedua** yang berdiri sendiri, sejajar dengan alur SerGab
(TJP/MPP) dan tidak menyentuhnya. SerGab melacak GKP masuk sampai pembayaran; Pengolahan
melacak hasil olah (HGL) dari gudang sampai dokumen pengeluaran (OUT).

Empat role bermain: **Gudang, UB Jastasma, Operasi, Pengadaan**. Dua skema yang isinya identik,
bedanya hanya siapa yang mengisi duluan:

```
GDG   gudang ──▶ ub_jastasma ──▶ operasi ──▶ pengadaan
UBJ   ub_jastasma ──▶ gudang ──▶ operasi ──▶ pengadaan
```

Mekanisme terima/tolak persis TJP/MPP: tahap berikutnya mereview tahap sebelumnya, penolakan
memundurkan `current_stage` ke tahap itu beserta catatannya.

## 2. Keputusan Arsitektur

### 2.1 Entitas berdiri sendiri, bukan lanjutan transaksi TJP/MPP

Tabel dan ID sendiri (`00001/08/2026/GDG`). Gudang/UB Jastasma memilih makloon dari awal, tidak
menunjuk transaksi TJP/MPP mana pun. Dua rantai baru bertemu di level laporan per makloon.

Alternatif "menempel di belakang tahap Keuangan" ditolak: role UB Jastasma dan Pengadaan akan
main di dua rantai sekaligus, sehingga `scopeAntreanRole`, `KerjaanTransaksi`, `FieldVisibility`,
dan `TransaksiDetailPage` semuanya harus bercabang per skema. Selain menyentuh belasan file
SerGab yang sedang berjalan (risiko bug + konflik merge ke `main`), skema UBJ juga tidak bisa
diwakili karena urutan tahap di `TransaksiStages::sequence()` bersifat per-skema, bukan
per-transaksi.

### 2.2 Tabel & service sendiri, mencontek pola — bukan abstraksi bersama

Tiga opsi yang ditimbang:

| Opsi | Cara | Putusan |
|---|---|---|
| A | Numpang tabel `transaksi`, tambah skema GDG/UBJ | Ditolak, lihat §2.1 |
| B | Tabel + service sendiri, meniru pola yang ada | **Dipilih** |
| C | Refactor `TransaksiStageService` jadi generik untuk dua rantai | Ditolak: mengubah service yang memegang alur produksi; bug di situ merembet ke SerGab, dan diff-nya menyentuh file yang juga berubah di `main` |

Opsi B berongkos duplikasi ±200 baris logika submit/draft/terima/tolak. Itu dibayar sadar demi
nol perubahan pada file SerGab, sehingga merge branch `pengolahan` ke `main` nanti nyaris tanpa
konflik.

Dipakai ulang tanpa diubah sama sekali:

- `NomorUrutTransaksi` — generator ID sudah berkunci per `(skema, tahun, bulan)` dengan
  `lockForUpdate`, tinggal dipanggil dengan skema `GDG`/`UBJ`
- `NotifikasiService`, `AuditLogService`
- `DataSpreadsheet` (frontend), Spatie medialibrary untuk foto

### 2.3 Makloon dipindah ke header transaksi

**Menyimpang dari permintaan awal**, yang menaruh makloon sebagai kolom milik Gudang.

`makloon_user_id` ditaruh di `transaksi_pengolahan` dan diisi oleh siapa pun yang memulai
transaksi. Alasannya: di skema UBJ, UB Jastasma jalan lebih dulu, sedangkan LHPK adalah laporan
hasil olah milik makloon tertentu. Kalau makloon baru diketahui saat Gudang mengisi di tahap 2,
UB Jastasma menulis LHPK tanpa tahu pemiliknya dan filter makloon di Operasi jadi bolong.

Tampilan tetap sesuai maksud awal: di skema GDG, form Gudang yang memilih makloon (persis
"Makloon tujuan" pada TJP); di skema UBJ, form Gudang menampilkannya read-only.

### 2.4 Nomor OUT satu per MO

Satu MO mendapat satu `no_out` + `tanggal_out`. Begitu diisi, seluruh transaksi pengolahan
anggotanya berstatus selesai sekaligus. Ini berbeda dari `no_in` di modul PO yang dipecah balik
per anggota — OUT adalah dokumen pengeluaran untuk satu pengiriman gabungan.

### 2.5 Dua kuantum HGL memang beda, dan itu disengaja

- `pengolahan_gudang.kuantum_hgl` — hasil timbangan fisik yang masuk gudang (dasar Notim)
- `pengolahan_lhpk.kuantum_beras_hgl` — hasil olah menurut LHPK

Selisih keduanya adalah **susut**, dan itu angka yang berguna dipantau. Tidak ada validasi yang
memaksa keduanya sama.

Operasi dan MO memakai angka **LHPK**, karena MO menggabungkan LHPK.

### 2.6 Gudang adalah data master, bukan satu akun per gudang

Ada **satu akun** ber-role `gudang` (gudang pusat). Gudang A/B/C/D adalah **baris data**, bukan
user. Saat mengisi, petugas memilih dari gudang mana; UB Jastasma memilih gudang tujuan.
Penambahan/penghapusan gudang hanya lewat Admin.

Ini membatalkan pola lama di repo: `users.nama_gudang` + `GudangOptionController` dibangun
dengan asumsi "satu username per gudang" (lihat docblock controller itu). Asumsi tersebut salah
dan kolomnya sudah tidak dipakai siapa pun sejak modul pengolahan lama dihapus.

Yang dilakukan:

- Tabel master `gudang` baru, di-CRUD Admin.
- `GudangOptionController` **dialihfungsikan** membaca tabel master itu. Route
  `GET /api/gudang-options` tidak berubah dan saat ini tanpa konsumen, jadi tidak ada yang rusak.
- Kolom `users.nama_gudang` dan field-nya di form Admin **dihapus**. Membiarkannya berarti ada
  dua pengertian "gudang" yang saling bertentangan di satu aplikasi.

Ongkosnya: penghapusan `nama_gudang` menyentuh `AdminUserController`, `AdminUserResource`,
`User::$fillable`, dan `AdminUsersPage.tsx` — empat berkas milik SerGab. Itu satu-satunya
perkecualian dari prinsip "nol perubahan pada berkas SerGab" di §2.2, dan diambil sadar karena
membiarkan model gudang yang salah jauh lebih mahal daripada menyelesaikan satu-dua konflik
merge kecil. Diffnya kecil dan seluruhnya berupa penghapusan.

### 2.7 Semua nomor adalah teks bebas yang unik, seperti No. PO

Format acuan: `OUT/00832/02/2026/ADA08001`.

Berlaku untuk `no_lhpk`, `no_mo`, `no_tm_ada`, `no_tm_gudang`, dan `no_out`. Semuanya
`string(100)`, unik, **diketik manual** — persis perlakuan `no_po` hari ini (`required|string|
max:255|unique:data_pengadaan,no_po`, tanpa validasi pola).

Tidak ada regex yang memaksa polanya. Penomoran BULOG bisa berbeda antar kantor dan antar tahun;
regex yang terlalu ketat akan menolak nomor yang sah di lapangan, dan itu kegagalan yang jauh
lebih menyakitkan daripada salah ketik yang kelihatan. Yang dipasang hanya `placeholder` di form
sebagai contoh bentuk, plus jaminan unik dari database.

### 2.8 Rendemen tidak disimpan sebagai kolom

`rendemen = kuantum_beras_hgl / kuantum_gabah_diolah`. Kolom tersimpan hanya menambah satu
tempat lagi yang bisa melenceng dari sumbernya. Dihitung di accessor model dan langsung di SQL
untuk rekap.

### 2.9 Rekap punya halaman sendiri

Menu "Rekap Pengolahan" terpisah dari "Rekap Transaksi". Kolomnya berbeda total; dipaksa jadi
satu tabel akan menghasilkan ±40 kolom yang separuhnya selalu kosong per baris.

## 3. Skema Database

Tabel milik alur pengolahan berawalan `pengolahan_` supaya mudah di-grep dan tidak bertabrakan
dengan tabel modul lama yang sudah di-drop. Pengecualiannya `gudang`: itu **data master** yang
berdiri di luar alur, dipakai lintas modul dan dikelola Admin, jadi awalan `pengolahan_` justru
akan menyesatkan.

> Perhatikan dua nama yang mirip: `gudang` adalah daftar master gudang A/B/C/D, sedangkan
> `pengolahan_gudang` adalah data yang diisi role Gudang pada satu transaksi pengolahan.

### 3.1 `gudang` (master, baru)

| Kolom | Tipe | Catatan |
|---|---|---|
| `id` | bigint PK | |
| `kode` | string(30) unique | mis. `ADA08001` |
| `nama` | string(150) | mis. `Gudang A` |
| `aktif` | boolean, default true | |
| timestamps | | |

Dikelola Admin. **Hapus hanya bila belum pernah dipakai**; kalau sudah direferensikan
`pengolahan_gudang` atau `pengolahan_lhpk`, permintaan hapus ditolak 422 dengan saran
menonaktifkan. Ini menghindari baris pengolahan lama kehilangan identitas gudangnya —
pola yang sama dipakai akun user (`is_active`, endpoint `deactivate`).

Gudang nonaktif tidak muncul di dropdown pengisian baru, tapi tetap tampil pada data lama.

### 3.2 `transaksi_pengolahan`

| Kolom | Tipe | Catatan |
|---|---|---|
| `id_pengolahan` | string(30) PK | `00001/08/2026/GDG` |
| `skema` | enum `GDG`,`UBJ` | |
| `makloon_user_id` | FK `users` | §2.3 |
| `current_stage` | string(30) | `gudang`,`ub_jastasma`,`operasi`,`pengadaan` |
| `status_keseluruhan` | enum `berjalan`,`selesai` | |
| `created_by` | FK `users` | |
| timestamps | | |

Indeks: `(status_keseluruhan, current_stage)`, `(makloon_user_id)`.

### 3.3 Kolom lifecycle bersama

Dipakai `pengolahan_gudang` dan `pengolahan_lhpk`, meniru tabel `data_*` yang ada:

`status` enum(`draft`,`menunggu_review`,`diterima`,`ditolak`), `catatan_penolakan` text nullable,
`submitted_by` FK users nullable, `submitted_at` timestamp nullable, `locked_by` FK users
nullable, `locked_at` timestamp nullable.

### 3.4 `pengolahan_gudang`

| Kolom | Tipe |
|---|---|
| `transaksi_pengolahan_id` | FK string, unique, cascadeOnDelete |
| `gudang_id` | FK `gudang` — diisi dari gudang mana |
| `tanggal_masuk_gudang` | date |
| `kuantum_hgl` | decimal(15,2) — fisik/timbangan |
| `plat_mobil` | string(20) nullable |
| `supir` | string(100) nullable |
| lifecycle | §3.3 |

Media collection: `foto_notim` (singleFile, jpeg/png).

### 3.5 `pengolahan_lhpk`

| Kolom | Tipe |
|---|---|
| `transaksi_pengolahan_id` | FK string, unique, cascadeOnDelete |
| `gudang_tujuan_id` | FK `gudang` — tujuan gudang |
| `no_lhpk` | string(100) unique |
| `tanggal_lhpk` | date |
| `kuantum_stok_gudang` | decimal(15,2) |
| `kuantum_gabah_diolah` | decimal(15,2) |
| `kuantum_beras_hgl` | decimal(15,2) — hasil olah |
| `kualitas` | string(50) nullable |
| `broken`,`menir`,`katul` | decimal(8,2) nullable |
| `ka1`,`ka2`,`ka3` | decimal(8,2) nullable |
| `reject` | decimal(8,2) nullable |
| lifecycle | §3.3 |

Media collection: `foto_lhpk` (singleFile, jpeg/png).
Accessor: `rendemen` = `kuantum_beras_hgl / kuantum_gabah_diolah * 100`, `0` bila pembagi nol.

### 3.6 `pengolahan_mo`

| Kolom | Tipe |
|---|---|
| `no_mo` | string(100) unique |
| `no_tm_ada` | string(100) nullable, unique |
| `no_tm_gudang` | string(100) nullable, unique |
| `makloon_user_id` | FK users — kunci grup |
| `total_kuantum_hgl` | decimal(15,2) |
| `total_kuantum_gabah_diolah` | decimal(15,2) |
| `no_out` | string(100) nullable, unique — Pengadaan |
| `tanggal_out` | date nullable — Pengadaan |
| `status` | enum `proses`,`lengkap`,`dibatalkan` |
| `review_status` | enum `draft`,`menunggu_review`,`diterima`,`ditolak` |
| `catatan_penolakan` | text nullable |
| `reviewed_by` / `reviewed_at` | nullable |

Dua kolom total didenormalisasi saat penggabungan, meniru `data_pengadaan.total_kuantum`.
Semua kolom nomor mengikuti §2.7.

### 3.7 `pengolahan_mo_detail`

| Kolom | Tipe |
|---|---|
| `pengolahan_mo_id` | FK, cascadeOnDelete |
| `transaksi_pengolahan_id` | FK string, **UNIQUE** |
| `kuantum_hgl_kontribusi` | decimal(15,2) |
| `kuantum_gabah_diolah_kontribusi` | decimal(15,2) |

Indeks unik pada `transaksi_pengolahan_id` menegakkan "satu transaksi maksimal satu MO" di level
database. Di modul PO aturan setara dijaga lewat `exists()` manual di dua tempat
(`PoGroupingService::gabungkanPo` dan `::ubahAnggota`); indeks unik lebih murah dan tidak bisa
bocor lewat jalur yang lupa memeriksa.

### 3.8 Perubahan tabel lintas modul

Aditif lewat file migration baru, tidak mengedit migration lama:

1. `audit_logs` → tambah `pengolahan_id` string(30) nullable + FK ke `transaksi_pengolahan`
   nullOnDelete + indeks `(pengolahan_id, created_at)`. Kolom `transaksi_id` yang ada punya FK
   ke `transaksi`, jadi tidak bisa menampung ID pengolahan.
2. `riwayat_penolakan` → tambah `pengolahan_id` dengan pola sama.
3. `notifikasi` → **tidak perlu migration**. `transaksi_id` di situ string nullable tanpa FK,
   jadi ID pengolahan bisa langsung masuk. Yang ditambahkan hanya penanda `data.modul =
   'pengolahan'` supaya klik notifikasi mengarah ke halaman yang benar.

Satu yang bersifat penghapusan (§2.6):

4. `users` → **drop kolom `nama_gudang`**. Migration `down()` mengembalikan kolomnya (nullable,
   jadi rollback aman tanpa perlu memulihkan isi).

## 4. Backend

### 4.1 `App\Services\Pengolahan\PengolahanStages`

Meniru `TransaksiStages`. Sequence per skema:

```php
'GDG' => [
    ['role' => 'gudang',      'model' => PengolahanGudang::class],
    ['role' => 'ub_jastasma', 'model' => PengolahanLhpk::class],
    ['role' => 'operasi',     'model' => null],
    ['role' => 'pengadaan',   'model' => null],
],
'UBJ' => [
    ['role' => 'ub_jastasma', 'model' => PengolahanLhpk::class],
    ['role' => 'gudang',      'model' => PengolahanGudang::class],
    ['role' => 'operasi',     'model' => null],
    ['role' => 'pengadaan',   'model' => null],
],
```

Dua tahap terakhir ber-`model => null` karena bekerja di level MO (gabungan banyak transaksi),
persis alasan `pengadaan`/`keuangan` bermodel null di `TransaksiStages`.

### 4.2 `App\Services\Pengolahan\PengolahanStageService`

Meniru `TransaksiStageService`: `createTransaksi`, `saveDraft`, `submitStage`, `terima`, `tolak`.

- `createTransaksi(User $creator, string $skema, int $makloonUserId)` — role `gudang` boleh
  membuat skema GDG, role `ub_jastasma` boleh membuat UBJ, `admin` boleh keduanya.
- ID digenerate lewat `NomorUrutTransaksi` yang sudah ada, tanpa perubahan pada tabel itu.
- `submitStage` menolak bila `current_stage` tidak cocok, bila tahap sebelumnya belum `diterima`,
  atau bila record sudah `menunggu_review`/`diterima`.
- `tolak` mencatat `riwayat_penolakan` (dengan `pengolahan_id`), menyetel `status = 'ditolak'` +
  catatan, lalu memundurkan `current_stage`.
- Notifikasi dikirim ke role tahap tujuan lewat `NotifikasiService` yang ada.

### 4.3 `App\Services\Pengolahan\MoGroupingService`

- `gabungkanMo(array $ids, string $noMo, ...)` — semua anggota wajib `current_stage = 'operasi'`,
  data tahap-2 sudah `diterima`, dan **satu makloon yang sama**. Beda makloon → 422 dengan pesan
  jelas. Total HGL & gabah diolah dijumlahkan dari LHPK tiap anggota.
- `ubahAnggota(...)` — hanya selama MO belum `lengkap` dan `review_status`-nya belum `diterima`.
  Anggota yang dilepas kembali jadi kandidat gabung. Melepas seluruh anggota tidak diizinkan;
  MO tanpa anggota tidak punya arti (minimal satu, sama seperti `PoGroupingService`).
- `kirimKePengadaan(...)` — syaratnya `no_mo`, `no_tm_ada`, `no_tm_gudang` terisi. Menyetel
  `review_status = 'menunggu_review'` dan memajukan `current_stage` anggota ke `pengadaan`.
- `batalkan(PengolahanMo $mo)` — `status = 'dibatalkan'`, seluruh baris `mo_detail` dihapus, dan
  anggotanya dikembalikan ke `current_stage = 'operasi'` sehingga bisa digabung ulang.
  Menghapus baris detail itu **wajib**, bukan opsional: kalau ditinggal, satu transaksi akan
  menabrak indeks unik `mo_detail.transaksi_pengolahan_id` saat digabung ulang. Modul PO punya
  bug dengan bentuk persis ini dan sudah diperbaiki — lihat komentar panjang di
  `PoGroupingService::gabungkanPo` sekitar cabang `status === 'dibatalkan'`.
  MO yang sudah `dibatalkan` tidak bisa diaktifkan lagi; buat MO baru.

### 4.4 `App\Services\Pengolahan\MoReviewService`

- `terima(PengolahanMo $mo, User $actor)` — `review_status = 'diterima'`.
- `tolak(...)` — `review_status = 'ditolak'` + catatan, anggota mundur ke `current_stage = 'operasi'`.
- `isiOut(PengolahanMo $mo, string $noOut, string $tanggalOut)` — hanya setelah MO diterima.
  Menyetel `status = 'lengkap'` dan seluruh anggota `status_keseluruhan = 'selesai'`.

### 4.5 Route

Semua di bawah `auth:sanctum` + `user.aktif`, prefix `/pengolahan` dan `/mo`, dengan pola
penamaan dan urutan pendaftaran yang sama seperti route transaksi (route bersuffix didaftarkan
sebelum route `{id}` karena pattern-nya greedy).

| Method | Path | Role |
|---|---|---|
| GET | `/pengolahan` | gudang, ub_jastasma, operasi, pengadaan, admin |
| GET | `/pengolahan/rekap` | idem |
| POST | `/pengolahan` | gudang, ub_jastasma, admin |
| GET | `/pengolahan/{id}` | idem baris pertama |
| PATCH | `/pengolahan/{id}/gudang` | gudang, admin |
| PATCH | `/pengolahan/{id}/lhpk` | ub_jastasma, admin |
| POST | `/pengolahan/{id}/terima` \| `/tolak` | sesuai tahap |
| POST | `/pengolahan/{id}/foto` | throttle 40,1 |
| POST | `/mo/gabungkan` | operasi, admin |
| GET | `/mo` \| `/mo/{mo}` | gudang, ub_jastasma, operasi, pengadaan, admin |
| PATCH | `/mo/{mo}` \| `/mo/{mo}/anggota` | operasi, admin |
| POST | `/mo/{mo}/kirim` \| `/mo/{mo}/batalkan` | operasi, admin |
| POST | `/mo/{mo}/terima` \| `/tolak` | pengadaan, admin |
| PATCH | `/mo/{mo}/out` | pengadaan, admin |

Master gudang (§2.6):

| Method | Path | Role |
|---|---|---|
| GET | `/gudang-options` | semua yang login — **dialihfungsikan** ke tabel master, route tidak berubah |
| GET | `/admin/gudang` | admin |
| POST | `/admin/gudang` | admin |
| PATCH | `/admin/gudang/{gudang}` | admin |
| DELETE | `/admin/gudang/{gudang}` | admin — 422 bila sudah direferensikan |

Didaftarkan lewat `Route::apiResource('gudang', GudangController::class)` di dalam grup
`role:admin`/prefix `admin` yang sudah ada, mengikuti pola `apiResource('users', ...)`.

## 5. Frontend

| Berkas | Isi |
|---|---|
| `hooks/usePengolahan.ts` | Query & mutation daftar, detail, submit tahap |
| `hooks/useMo.ts` | Daftar MO, gabung, ubah anggota, review, isi OUT |
| `pages/PengolahanListPage.tsx` | Antrean per role, dikelompokkan per makloon (pola accordion dashboard) |
| `pages/PengolahanDetailPage.tsx` | Timeline 4 tahap + form per tahap + tombol Terima/Tolak |
| `pages/MoPage.tsx` | Daftar MO, form gabung (tabel pilih LHPK + filter), form OUT, tombol Batalkan |
| `pages/RekapPengolahanPage.tsx` | `DataSpreadsheet` + ekspor CSV |
| `pages/AdminGudangPage.tsx` | CRUD master gudang (§2.6) |
| `hooks/useGudang.ts` | Daftar gudang aktif (dropdown) + mutation CRUD admin |

Nav: entri baru untuk role `gudang`, `ub_jastasma`, `operasi`, `pengadaan`, `admin`.

Dropdown gudang: form Gudang memilih **asal gudang**, form UB Jastasma memilih **gudang tujuan**.
Keduanya berdiri sendiri dan tidak divalidasi silang — barang memang bisa masuk di satu gudang
lalu ditujukan ke gudang lain. Hanya gudang `aktif` yang muncul sebagai pilihan baru; data lama
tetap menampilkan gudang yang sudah dinonaktifkan.

Penghapusan `users.nama_gudang` (§2.6) juga membuang field "Nama Gudang" dari form Admin Users.

### 5.1 Layar Operasi

Kunci grupnya **makloon saja** (bandingkan PO: tanggal bongkar + pemasok + makloon).

```
Filter:  [Makloon ▾] [Cari No. LHPK] [Tanggal LHPK ▾]

☑ No.LHPK   Makloon       Gabah Diolah    HGL
☑ LHPK-A    Sinar Jaya        30.000   19.000
☑ LHPK-B    Sinar Jaya        20.000   12.500
☐ LHPK-C    Tani Makmur       10.000    6.300   ← beda makloon, tidak bisa ikut

Nomor MO         [ MO/00832/02/2026/ADA08001  ]
Nomor TM ADA     [                            ]
Nomor TM Gudang  [                            ]
Total Gabah Diolah  50.000   (read-only, dari centang)
Total Kuantum HGL   31.500   (read-only, dari centang)
```

Ketiga kolom nomor bebas diketik dengan `placeholder` bergaya `MO/00832/02/2026/ADA08001`
sebagai contoh bentuk (§2.7).

Baris berbeda makloon dinonaktifkan begitu satu baris dicentang, sehingga aturan satu-makloon
terlihat sebelum tombol ditekan, bukan baru muncul sebagai error 422.

### 5.2 Kolom Rekap Pengolahan

`ID | Skema | Makloon | Gudang Asal | Tgl Masuk Gudang | Kuantum HGL (fisik) | Plat | Supir |
No LHPK | Tgl LHPK | Gudang Tujuan | Stok Gudang | Gabah Diolah | Beras HGL | Kualitas |
Broken | Menir | Katul | KA1 | KA2 | KA3 | Reject | Rendemen | Susut (HGL fisik − Beras HGL) |
No MO | TM ADA | TM Gudang | No OUT | Tgl OUT | Status`

## 6. Rencana Tes

Feature test, mengikuti gaya `tests/Feature/` yang ada:

1. **Alur penuh skema GDG** — buat, isi Gudang, kirim; UB Jastasma terima, isi LHPK, kirim;
   Operasi terima, gabung MO, kirim; Pengadaan terima, isi OUT; transaksi jadi `selesai`.
2. **Alur penuh skema UBJ** — urutan dua tahap pertama terbalik, hasil akhir sama.
3. **Tolak lalu perbaiki** di tiap tahap: `current_stage` mundur, catatan tersimpan, data bisa
   dikirim ulang dan lanjut normal.
4. **Guard MO**: satu transaksi tidak bisa masuk dua MO (langgar indeks unik); anggota beda
   makloon ditolak 422; anggota yang tahap-2-nya belum diterima ditolak.
5. **Batalkan MO** — anggota kembali ke tahap `operasi`, baris `mo_detail` terhapus, dan
   transaksi yang sama **berhasil digabung ulang** ke MO baru. Tes terakhir itu yang penting:
   tanpanya bug "detail yatim menabrak indeks unik" lolos tanpa terdeteksi.
6. **Rendemen** benar, dan `0` saat `kuantum_gabah_diolah = 0` (bukan division by zero).
7. **Otorisasi**: role yang tidak memegang tahap mendapat 403; role makloon tidak bisa mengakses
   modul ini sama sekali.
8. **Urutan skema**: di GDG, UB Jastasma tidak bisa mengisi sebelum Gudang diterima, dan
   sebaliknya di UBJ.
9. **Master gudang**: admin bisa tambah/ubah; hapus gudang yang belum dipakai berhasil; hapus
   gudang yang sudah direferensikan ditolak 422; gudang nonaktif tidak muncul di
   `GET /api/gudang-options`; non-admin mendapat 403.
10. **Nomor unik**: `no_lhpk`/`no_mo`/`no_out` duplikat ditolak 422.

## 7. Di Luar Lingkup

- Menyambungkan angka pengolahan ke tabel pantauan Admin. Tabel itu baru dihapus dari dashboard
  di branch ini; menyambungkannya kembali adalah pekerjaan terpisah setelah modul ini jalan.
- Mengubah alur SerGab (TJP/MPP) dalam bentuk apa pun.
- Impor massal / migrasi data pengolahan lama. Tidak ada data lama — tabelnya sudah di-drop.
