# Bersihkan Sergab: hapus Operasi & Gudang, pisahkan notifikasi makloon, port Makloon Terima

Tanggal: 2026-08-12
Branch kerja: `Sergab` (dibuat dari `main` di `b8ba41f`)

## Batasan

Hanya branch `Sergab` yang boleh disentuh. Branch `pengolahan` dan `main` **read-only** —
diakses lewat `git show <ref>:<path>` saja, tanpa checkout, tanpa commit, tanpa merge.

## Konteks

`Sergab` berisi alur serap gabah TJP/MPP: Jemput Pangan → Makloon → UB Jastasma → Pengadaan →
Keuangan. Modul Pengolahan hidup terpisah di branch `pengolahan` dan tidak akan pernah masuk
ke sini.

`main` nol commit sejak titik pisah `b8ba41f`, jadi `Sergab` = `main` = titik pisah. Branch
`pengolahan` 39 commit di depan. Basis data terpisah per branch: `sergab_lampung` untuk branch
ini, `konekto_pengolahan` untuk `pengolahan`.

Baseline sebelum perubahan: **185 test lulus, 550 assertion, 31,7 detik.**

## Bagian 1 — Hapus Operasi & Gudang

### Masalah

Tabel `data_operasi` dan `data_gudang` sudah di-drop sejak migrasi
`2026_07_20_100000_drop_operasi_gudang_tables`. Yang tersisa hanya bangkai: role row, satu kolom
users, satu controller yang komentarnya sendiri mengakui konsumennya sudah dihapus, dan label
tersebar di frontend termasuk dua entri timeline dengan `actionPath` menunjuk route yang tidak
ada (`/operasi`, `/gudang`).

### Bukti

Di `sergab_lampung`: 2 akun role `operasi` (id 32, 45) dan 2 akun role `gudang` (id 33, 46).
Pemeriksaan seluruh 17 kolom foreign key yang menunjuk `users` menemukan **nol referensi** ke
keempat id tersebut. Menghapus akunnya tidak memutus jejak apa pun.

### Perubahan basis data

Migrasi baru `2026_08_12_100000_hapus_role_operasi_gudang.php`:

1. Hapus user ber-role `operasi`/`gudang`.
2. Hapus role row `operasi` dan `gudang` dari tabel `roles` **dan** dari tabel `roles` milik
   spatie/laravel-permission (RoleSeeder mengisi keduanya).
3. Drop kolom `users.nama_gudang`.

`down()` mengembalikan kolom dan kedua role row. Akun yang dihapus **tidak** dikembalikan —
ini dicatat sebagai komentar di migrasi, bukan disembunyikan.

Urutan penting: user dihapus sebelum role, supaya `users.role_id` tidak sempat menunjuk role
yang sudah hilang.

### Backend

Dihapus seluruhnya:

- `app/Http/Controllers/Api/GudangOptionController.php`
- `routes/api.php` — baris `use` dan rute `GET /gudang-options`
- `tests/Feature/GudangOptionTest.php`
- `tests/Feature/Admin/AdminGudangUserTest.php`

Disunting:

- `database/seeders/RoleSeeder.php` — buang `'operasi'`, `'gudang'` dari daftar
- `database/seeders/DemoSeeder.php` — buang `operasi_demo`, `gudang_demo` dan komentar
  yang membenarkan keberadaan mereka
- `app/Http/Controllers/Api/AdminUserController.php` — buang aturan validasi `nama_gudang`,
  pencarian `$gudangRoleId`, dan normalisasi "kosongkan nama_gudang kalau bukan role gudang"
- `app/Http/Resources/AdminUserResource.php` — buang field `nama_gudang`
- `app/Models/User.php` — buang `'nama_gudang'` dari `$fillable`
- `app/Http/Controllers/Api/NotifikasiController.php` — buang `nama_gudang` dari payload actor
- Komentar usang di `app/Support/FieldVisibility.php`,
  `app/Services/Transaksi/TransaksiStages.php`,
  `app/Services/Pengadaan/PoLifecycleService.php`,
  `app/Services/Pengadaan/PoReviewService.php`

### Frontend

- `components/AppNav.tsx` — buang label `operasi`, `gudang`
- `pages/TransaksiDetailPage.tsx` — buang dua entri `STAGES`, konstanta `TIMELINE_HIDDEN`
  (jadi tak ada isinya), dan anak kalimat "Operasi & Gudang dilanjutkan di halaman masing-masing"
- `pages/DashboardPage.tsx` — buang dari `GROUPED_ROLES`, label, deskripsi, dan guard
  `!['operasi','gudang','admin'].includes(role)` menyusut jadi `role !== 'admin'`
- `pages/LandingPage.tsx` — buang dua entri role dan sebutan di paragraf hero
- `pages/LoginPage.tsx` — perbarui kalimat pengantar
- `pages/AdminUsersPage.tsx` — buang `isGudang`, field input "Nama Gudang", `nama_gudang` dari
  state form; header kolom "Nama Mitra/Gudang" jadi "Nama Mitra"; sel tabel jadi
  `nama_maklon ?? '-'`
- `pages/AdminAuditLogPage.tsx` — buang label role dan label field `nama_gudang`
- `hooks/useAdminUsers.ts`, `hooks/useAuth.tsx`, `hooks/useNotifikasi.ts` — buang `nama_gudang`
  dari tipe
- `lib/namaUser.ts` — menyusut jadi `nama_maklon?.trim() || username`
- `components/Skeleton.tsx` — perbarui komentar

### Verifikasi

`php artisan test` tetap 185 lulus dikurangi test yang sengaja dihapus (GudangOptionTest,
AdminGudangUserTest). Tidak boleh ada kegagalan baru. `php artisan migrate` lalu
`php artisan migrate:rollback --step=1` harus bersih dua arah.

## Bagian 2 — Notifikasi makloon tercampur

### Akar masalah

`NotifikasiService::kirimKeRole()` memilih penerima murni dari role:

```php
User::query()
    ->whereHas('role', fn ($q) => $q->whereIn('nama_role', $targetRoles))
    ->where('id', '!=', $actor->id)
    ->where('is_active', true)
```

Untuk role `makloon` ini salah. Mitra makloon adalah perusahaan yang berdiri sendiri dan data
satu makloon rahasia bagi yang lain — aturan yang sudah ditegakkan di daftar transaksi lewat
`Transaksi::scopeTerlihatOleh()`, tapi tidak di notifikasi. Akibatnya isi notifikasi (nomor
transaksi, catatan penolakan) bocor ke seluruh mitra makloon.

Bug ini ada juga di branch `pengolahan` — `NotifikasiService.php` identik di kedua branch. Jadi
ini perbaikan baru, bukan port.

### Perbaikan

Satu saringan di dalam `kirimKeRole()`, bukan di delapan pemanggilnya. Karena metode ini sudah
menerima `$transaksiId`, transaksinya diresolve di situ lalu penerima ber-role makloon yang
bukan pemilik dibuang:

```php
$transaksi = $transaksiId ? Transaksi::with('dataJemputPangan')->find($transaksiId) : null;

// ...
->reject(fn (User $u) => $u->role?->nama_role === 'makloon'
    && $transaksi !== null
    && ! $transaksi->dimilikiOleh($u))
```

`Transaksi::dimilikiOleh()` sudah ada dan sudah benar: MPP lewat `created_by`, TJP lewat
`dataJemputPangan.makloon_user_id`. Tidak ditulis ulang.

Perilaku yang dipertahankan: admin tetap menerima semua; role internal BULOG (Jemput Pangan, UB
Jastasma, Pengadaan, Keuangan) tidak tersaring; notifikasi level PO tanpa `transaksi_id` tetap
terkirim apa adanya — makloon memang bukan sasaran notifikasi jenis itu.

### Test

`tests/Feature/Transaksi/NotifikasiMakloonTest.php` baru:

1. Transaksi MPP milik makloon A → hanya A dan admin yang punya baris notifikasi; makloon B nol.
2. Transaksi TJP yang ditunjuk ke makloon A lewat `makloon_user_id` → hasil sama.
3. Notifikasi tanpa `transaksi_id` (level PO ke role pengadaan/keuangan) → tidak berubah.

## Bagian 3 — Port Makloon Terima + perbaikan tolak/terima UB

Sumber: commit `e51d65f` di branch `pengolahan` ("perbaikan makloon dan pengolahan").

### Langkah 0 — buktikan dulu

Sebelum menyalin perbaikan apa pun, port **hanya** `tests/Feature/Transaksi/ReviewUbJastasmaTest.php`
dan jalankan di branch ini.

- Merah → bug tolak/terima UB memang ada di `Sergab`, lanjut perbaiki.
- Hijau → bug itu lahir dari perubahan khas `pengolahan` dan tidak perlu diport; laporkan dan
  hentikan sub-bagian ini.

Test tersebut menegakkan dua syarat munculnya tombol Terima/Tolak milik Pengadaan: setelah UB
mengirim, `transaksi.current_stage` harus `pengadaan` **dan** `data_ub_jastasma.status` harus
`menunggu_review`.

### Masalah Makloon Terima

Di `Sergab`, tahap `makloon_terima` pada skema MPP terdaftar dengan `'model' => null`
(`TransaksiStages::sequence()`). Artinya tahap ini tidak punya tabel sendiri: kuantum bongkar dan
dua dokumennya menumpang di `data_makloon_mpp` milik Makloon Kirim, dan satu tombol mengerjakan
terima + isi + kirim sekaligus. Akibatnya penerimaan habis di situ dan UB Jastasma tidak
kebagian apa pun untuk diperiksa.

### Perubahan basis data

Migrasi `2026_08_11_140000_create_data_makloon_terima_table.php` disalin apa adanya dari
`e51d65f`. Isinya: tabel `data_makloon_terima` (satu baris per transaksi, `transaksi_id` unique)
plus backfill yang membuat baris untuk setiap transaksi MPP lama dan memindahkan kepemilikan
media `foto_surat_jalan` + `foto_nota_timbang` dari `DataMakloonMpp` ke `DataMakloonTerima`.
Berkas tidak berpindah di disk — `ShardedPathGenerator` menyusun path dari id media.

`data_makloon_mpp.kuantum_bongkar` **sengaja tidak dibuang**: jaring pengaman kalau backfill
ternyata keliru. Penghapusannya migrasi tersendiri di kemudian hari, setelah terbukti jalan.

### Backend

Baru:

- `app/Models/DataMakloonTerima.php`

Disunting:

- `app/Services/Transaksi/TransaksiStages.php` — tahap `makloon_terima` dapat
  `DataMakloonTerima::class`
- `app/Models/Transaksi.php` — relasi `dataMakloonTerima()`, dan tambahkan ke daftar relasi
  di `booted()->deleting` supaya media ikut dibersihkan
- `app/Models/DataMakloonMpp.php`
- `app/Http/Controllers/Api/TransaksiController.php` — bagian MPP/terima
- `app/Services/Transaksi/FotoAccessService.php`, `FotoUploadService.php` — pemilik dua foto
  terima berpindah model
- `app/Http/Resources/TransaksiResource.php` — field `data_makloon_terima`
- `app/Services/Transaksi/KerjaanTransaksi.php` — **pasangan wajib pemisahan tabel, bukan
  opsional.** Lihat sub-bagian di bawah.
- `routes/api.php` — rute tahap makloon terima

### Efek samping wajib: klasifikasi kerjaan

Begitu Makloon Terima punya tabel sendiri, `data_makloon_mpp` **selalu** sudah berstatus
`diterima` ketika transaksi sampai ke UB Jastasma. Klasifikasi lama di
`KerjaanTransaksi::ekspresi()` masih melihat `kj_mpp` pada tahap itu, sehingga chip
"Perlu dicek" milik UB tidak akan pernah menyala — yang menunggu diperiksa sebenarnya hasil
timbang milik Makloon Terima.

Karena itu `KerjaanTransaksi.php` harus diport **dalam commit yang sama** dengan migrasinya:
`leftJoin` tabel baru sebagai `kj_mt`, lalu `kj_mt` menggantikan `kj_mpp` di cabang
`current_stage = 'ub_jastasma' AND skema = 'MPP'`, plus `kj_mt.status = 'ditolak'` masuk ke
`ekspresi()` dan `syaratDitolak()`, dan cabang draft baru untuk `current_stage = 'makloon_terima'`.

Perhatikan: di `Sergab` yang sekarang, `kj_mpp` pada cabang UB **masih benar**. Ia baru menjadi
salah setelah pemisahan. Jadi kedua perubahan itu tidak boleh dipisah — memport migrasinya saja
akan mematikan chip UB.

### Frontend

- `pages/TransaksiDetailPage.tsx` — blok Makloon Terima berdiri sendiri dengan tombol
  isi/kirim terpisah dari Makloon Kirim
- `hooks/useTransaksiList.ts`, `hooks/useRekapTransaksi.ts` — field baru

### Cara menyalin

`TransaksiController.php` dan `TransaksiDetailPage.tsx` disalin **manual per-hunk**, bukan
`git cherry-pick`. Kedua file sudah drift 107 dan 41 baris oleh commit `pengolahan` lain yang
tidak ada hubungannya dengan makloon terima; drift itu harus ditinggal. Cherry-pick akan
menyeret modul Pengolahan masuk ke branch ini.

### Test

- `tests/Feature/Transaksi/ReviewUbJastasmaTest.php` (baru, dari langkah 0)
- `tests/Feature/Transaksi/MakloonMppAlurTest.php` diperluas: Makloon Terima punya barisnya
  sendiri, mengisi form, mengirim, lalu UB yang memeriksa
- `tests/Feature/Transaksi/KerjaanKategoriTest.php` diperluas: UB dengan hasil timbang
  `menunggu_review` berkategori `periksa` (jaring pengaman chip UB di atas), draft hasil
  timbang berkategori `draft`, hasil timbang ditolak UB berkategori `ditolak`

## Urutan pengerjaan

1. **Bagian 1** lebih dulu — membersihkan `TransaksiDetailPage.tsx` dari dua entri stage mati
   supaya Bagian 3 menulis di file yang lebih bersih.
2. **Bagian 2** — mandiri, tidak bersinggungan dengan dua lainnya.
3. **Bagian 3** — paling besar, paling banyak menyentuh `TransaksiController`.

Setiap bagian dijalankan `php artisan test` sebelum lanjut ke bagian berikutnya.

## Di luar lingkup

- Bagian `e51d65f` yang bukan makloon terima / UB: keamanan login `AuthController`,
  `AksesEditRekap`, `RekapTerkunci`, `PoInForm`/`PoSppForm`.
- Migrasi `2026_08_11_160000_hapus_kualitas_dan_perlebar_reject_lhpk` — milik modul Pengolahan.
- Seluruh modul Pengolahan (gudang master, LHPK, MO, jaminan makloon).
- Membuang `data_makloon_mpp.kuantum_bongkar`.
