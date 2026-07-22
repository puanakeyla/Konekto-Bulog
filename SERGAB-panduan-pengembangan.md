# SerGab Lampung — Sistem Informasi Serap Gabah (SERGAB) untuk Perum BULOG
## Panduan Teknis Pengembangan (Referensi untuk Claude Code)

> **SerGab Lampung** (dari **Ser**ap **Gab**ah Lampung) adalah nama produk untuk sistem SERGAB (Sistem Informasi Serap Gabah) yang dibangun untuk Perum BULOG Kanwil Lampung. Dokumen ini merangkum seluruh keputusan desain, alur bisnis, skema database, dan pola arsitektur yang telah dibahas dan disepakati. Gunakan sebagai acuan utama (mis. `CLAUDE.md` atau dokumen referensi di root repo) saat membangun sistem ini.
>
> **Versi awal ini sengaja disederhanakan** — prioritas utama: dapat dijalankan sebagai website dan mampu menampung banyak foto. Kompleksitas infrastruktur (object storage, container orchestration lanjutan, dsb) ditunda ke fase produksi, lihat catatan di tiap bagian.
>
> **Baca Bagian 12 ("Asumsi yang Masih Perlu Dikonfirmasi") sebelum mulai implementasi.**

---

## 1. Ringkasan Proyek

SERGAB adalah sistem digitalisasi alur pengadaan/serap gabah untuk Perum BULOG Kanwil Lampung, menggantikan proses manual dengan alur kerja bertahap (workflow) lintas 7 role, mendukung dua skema pengadaan:

- **TJP** (Tebus Jemput Pangan): Jemput Pangan → Makloon → UB Jastasma → Pengadaan → Keuangan (5 tahap)
- **MPP** (Makloon Pengadaan Pangan): Makloon Kirim → Makloon Terima → UB Jastasma → Pengadaan → Keuangan (5 tahap)

**Timeline transaksi berhenti di Keuangan** (TJP 5 tahap, MPP 5 tahap). Operasi & Gudang **bukan tahap timeline transaksi** — keduanya berperan di **modul Pengolahan** yang terpisah.

**Modul Pengolahan** *(pemahaman terbaru 2026-07-20; menggantikan modul Operasi/Gudang mandiri lama)* adalah alur terima/tolak bertahap sendiri: **UB Jastasma → Operasi → Pengadaan → Operasi → Gudang.** UB Jastasma membuat data pengolahan per No. LHPK (pilih makloon → Jumlah Kuantum otomatis dari total kuantum yang sudah IN pada makloon itu; isi Kuantum Olah, KA1–3, HGL, Broken, Menir, Katul; Rendemen otomatis = HGL ÷ Jumlah Kuantum × 100). Operasi menolak (kembali ke UB Jastasma) atau menggabungkan beberapa baris **makloon sama** menjadi satu **No. MO** (+ No. TM; pola sama dengan penggabungan PO). Pengadaan menerima (terbitkan No. OUT) atau menolak — keduanya balik ke Operasi. Operasi lalu mengisi Tujuan Gudang, No. TM Gudang, Kuantum Total, dan mengirim ke Gudang. Gudang menerima (isi tanggal) atau menolak. **TM = Transfer Move** (nomor perpindahan antar bidang; tiap hop punya No. TM sendiri). **Akun Gudang** = satu username per gudang fisik (mis. "Gudang Jaya 1", "Gudang Jaya 2" adalah akun berbeda), nama gudang di kolom `users.nama_gudang`.

**Konteks**: dikembangkan sebagai proyek PKL, dengan potensi berlanjut ke produksi sungguhan di BULOG Kanwil Lampung. Arsitektur dibangun dengan asumsi produksi sejak awal, tanpa over-engineering di fase demo.

---

## 2. Keputusan Teknologi

| Layer | Teknologi | Alasan |
|---|---|---|
| Backend API | Laravel 11/12 (REST API murni, tanpa Inertia) | Sesuai preferensi tim, dipisah dari frontend agar bisa dikonsumsi aplikasi mobile di masa depan |
| Frontend | React 18 + TypeScript (SPA, build terpisah) | Sesuai keputusan arsitektur REST API + SPA terpisah |
| Auth | Laravel Sanctum (mode SPA, token/cookie-based) | Cocok untuk API + SPA yang di-deploy terpisah |
| Otorisasi role | `spatie/laravel-permission` | 7 role operasional + Admin dengan akses penuh; lihat Bagian 3.5 |
| Database | MySQL 8.0 (InnoDB) | Cukup untuk skala ribuan baris/tahun; lihat Bagian 4 |
| Media/foto | `spatie/laravel-medialibrary`, disk **local** | Validasi ukuran built-in, auto-thumbnail. **Versi awal: disk lokal server**, bukan object storage; lihat Bagian 6 |
| Kontainerisasi | *(ditunda)* — jalankan langsung PHP-FPM + nginx di VPS | Disederhanakan untuk versi awal; Docker bisa ditambahkan belakangan tanpa mengubah kode aplikasi |
| Data-fetching frontend | TanStack Query | Sinkronisasi status transaksi antar role, caching, revalidation |
| Tabel data | TanStack Table | Server-side pagination/sorting/filtering untuk listing ribuan baris |
| Styling & komponen | Tailwind CSS + shadcn/ui, tema warna SerGab Lampung | Lihat Bagian 7 |

**Yang disederhanakan dari versi sebelumnya**: object storage S3 diganti disk lokal server, kontainerisasi Docker ditunda, audit log & queue worker jadi rekomendasi opsional (bukan wajib di versi awal — lihat catatan di Bagian 6 dan 9). Struktur kode tetap dibuat agar migrasi ke S3/Docker nanti tidak perlu menulis ulang logic, cukup ganti konfigurasi.

### Catatan wajib karena memilih REST API + SPA terpisah

Karena backend dan frontend adalah dua aplikasi terpisah (bukan Inertia), siapkan sejak awal:

- **CORS** di Laravel: whitelist origin domain frontend secara eksplisit (jangan `*` di produksi).
- **Sanctum SPA mode**: set `SANCTUM_STATEFUL_DOMAINS` agar cookie-based auth bekerja lintas subdomain (mis. `app.sergab.id` ↔ `api.sergab.id`).
- **Axios/fetch wrapper terpusat** di frontend dengan interceptor untuk menangani 401 (auto-logout/redirect) dan refresh token bila dipakai.
- **Dua proses deploy terpisah**: backend API (PHP-FPM + nginx) dan frontend (static build, bisa di-serve nginx terpisah atau CDN). Rencanakan reverse proxy di VPS/cloud sejak awal.

---

## 3. Ringkasan Alur Bisnis

### 3.1 Penentuan skema (tanpa dropdown)

Skema ditentukan otomatis dari role yang membuat transaksi baru — **tidak ada UI dropdown pemilihan skema**:

- Jemput Pangan membuat transaksi baru → `skema = TJP`
- Makloon membuat transaksi baru → `skema = MPP`

Dashboard Makloon punya dua entry point: **"Buat Baru (MPP)"** (form lengkap, jadi titik awal Makloon Kirim lalu dicek di Makloon Terima) dan **"Daftar Masuk dari Jemput Pangan (TJP)"** (form ringkas, meninjau data JP lebih dulu).

### 3.2 Pola generik terima/tolak/kunci

Setiap tahap penerima (semua role kecuali Jemput Pangan) punya dua aksi saja:

- **Tolak** → transaksi kembali ke tahap sebelumnya untuk revisi, disertai `catatan_penolakan` (wajib diisi).
- **Terima & Kirim** → mengunci field tahap sebelumnya (`locked_at`, `locked_by`), role saat ini mengisi field miliknya, lalu meneruskan ke tahap berikutnya.

Ini aksi **ireversibel** — wajib ada dialog konfirmasi di UI sebelum eksekusi (lihat Bagian 7).

### 3.3 Kontrol visibilitas field

**(Koreksi dari versi sebelumnya)** — pada skema TJP, field `kuantum` milik **Jemput Pangan** dan **foto surat jalan milik Jemput Pangan** (bukan foto surat jalan Makloon) **tidak boleh terlihat** oleh UB Jastasma, Pengadaan, Keuangan, Operasi, dan Gudang. Foto surat jalan yang sudah diparaf milik Makloon tetap terlihat oleh semua tahap berikutnya seperti biasa.

Implementasikan sebagai **filter di layer API (backend)**, bukan disembunyikan di frontend saja — karena response API mentah tetap bisa dibaca lewat network tab kalau filternya hanya di UI. Gunakan API Resource/Transformer Laravel yang mengecek role user sebelum menyertakan field tersebut di response.

### 3.4 Logika penggabungan PO (role Pengadaan)

Baris data dari Makloon (kuantum bongkar) dikelompokkan `GROUP BY (tanggal_bongkar, id_pemasok, makloon_user_id)`, dijumlahkan jadi satu PO. Harga default 6500/kg (bisa diubah manual per grup), `total_harga = total_kuantum × harga`. Saat proses **IN**, PO dipecah kembali ke baris transaksi asalnya melalui tabel penghubung `po_detail`.

### 3.5 Role Admin

Admin adalah role tambahan di luar 7 role operasional, dengan karakteristik:

- **CRUD penuh atas tabel `users`** — membuat, mengubah, menonaktifkan, menghapus user dan menetapkan role-nya. **Khusus saat membuat/mengubah user dengan role Makloon, form Admin wajib menyertakan field `nama_maklon`** — inilah satu-satunya tempat nama mitra makloon diketik manual di seluruh sistem (lihat Bagian 4, tabel `users`).
- **CRUD penuh atas seluruh kolom di semua tabel** — termasuk field yang normalnya dibatasi (lihat 3.3). Admin **bypass semua pembatasan visibilitas field**, termasuk kuantum dan foto surat jalan Jemput Pangan pada skema TJP.
- Implementasikan sebagai pengecualian eksplisit di layer filter field (Bagian 3.3): jika `user->role === 'admin'`, lewati semua filter visibilitas.
- Disarankan tetap tercatat di `audit_log` (Bagian 9) setiap kali Admin mengubah data di luar alur normal — supaya perubahan tetap tertelusur mengingat Admin punya akses penuh.

---

## 4. Skema Database (MySQL)

### `roles`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | bigint PK | |
| nama_role | varchar(50) | jemput_pangan, makloon, ub_jastasma, pengadaan, keuangan, operasi, gudang, **admin** |

### `users`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | bigint PK | |
| username | varchar(100) UK | dipakai untuk login, menggantikan email |
| password | varchar | hashed |
| role_id | bigint FK → roles | |
| nama_maklon | varchar(150) nullable | **diisi hanya untuk user dengan role Makloon** — sumber tunggal daftar mitra makloon (lihat catatan di bawah) |

**(Revisi penting)** — mitra makloon **tidak** memakai tabel master terpisah. Setiap mitra makloon adalah satu akun `users` dengan `role_id` = Makloon, dan `nama_maklon` diisi Admin saat membuat akun tersebut lewat CRUD Users. Menambah mitra makloon = Admin membuat user Makloon baru; menonaktifkan mitra = Admin menonaktifkan/menghapus user tersebut. Ini menghindari duplikasi/inkonsistensi penulisan nama (huruf besar-kecil dsb) karena nama makloon hanya diketik sekali oleh Admin saat pembuatan akun, lalu dipakai ulang di seluruh sistem lewat dropdown/combobox — role lain tidak pernah mengetik nama makloon secara manual.

### `transaksi` (tabel induk)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id_transaksi | varchar(30) PK | format `00001/01/2026/TJP` |
| skema | enum('TJP','MPP') | |
| current_stage | varchar(30) | role yang sedang memegang giliran |
| status_keseluruhan | enum('berjalan','selesai','dibatalkan') | |
| created_by | bigint FK → users | |
| created_at, updated_at | timestamp | |

**Catatan**: field `tujuan_makloon` di `data_jemput_pangan`, `nama_pabrik` di `data_makloon_mpp`, dan `makloon` di `data_pengadaan` sebaiknya diubah jadi **`makloon_user_id`** (FK ke `users.id`, difilter `role = makloon`) alih-alih teks bebas — dropdown/combobox pencarian (Bagian 7.4) mengambil datanya langsung dari `users` yang ber-role Makloon.

### `data_jemput_pangan` (khusus skema TJP)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| transaksi_id | varchar(30) FK |
| id_pemasok, supir, plat_mobil, nama_poktan_gapoktan, desa, kecamatan, kabupaten | varchar |
| makloon_user_id | bigint FK → users |
| tanggal_kirim | date |
| kuantum, jarak_ke_makloon_km | decimal(10,2) |
| foto_petani, foto_gabah, foto_serah_terima, foto_kwitansi, foto_surat_pernyataan, foto_surat_jalan | *(dikelola via `spatie/laravel-medialibrary`, bukan kolom string biasa — lihat Bagian 6)* |
| status | enum('draft','menunggu_review','diterima','ditolak') |
| catatan_penolakan | text nullable |
| locked_at | timestamp nullable |
| locked_by | bigint FK nullable |
| submitted_by, submitted_at | bigint FK / timestamp |

### `data_makloon_mpp` (entry point skema MPP)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| transaksi_id | varchar(30) FK |
| id_pemasok, supir, plat_mobil, desa, kecamatan, kabupaten | varchar |
| tanggal_bongkar | date |
| kuantum, jarak_ke_makloon_km | decimal(10,2) |
| foto_petani, foto_gabah, foto_serah_terima, foto_pembayaran, foto_surat_pernyataan, foto_surat_jalan, foto_nota_timbang | *(media library)* |
| status, catatan_penolakan, locked_at, locked_by, submitted_by, submitted_at | *(sama pola dengan tabel di atas)* |

### `data_makloon_tjp` (lanjutan skema TJP)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| transaksi_id | varchar(30) FK |
| tanggal_bongkar | date |
| kuantum_bongkar | decimal(10,2) |
| foto_surat_jalan_paraf, foto_nota_timbang | *(media library)* |
| status, catatan_penolakan, locked_at, locked_by, submitted_by, submitted_at | |

### `data_ub_jastasma`
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| transaksi_id | varchar(30) FK |
| ka1, ka2, ka3, hampa, butir_hijau | decimal(6,2) |
| foto_lhpk_hpk | *(media library)* |
| status, catatan_penolakan, locked_at, locked_by, submitted_by, submitted_at | |

### `data_pengadaan` (level PO, bukan per transaksi)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| tanggal_bongkar | date |
| id_pemasok | varchar |
| makloon_user_id | bigint FK → users |
| total_kuantum, harga, total_harga | decimal |
| no_po, no_spp | varchar UK |
| status | enum('lengkap','dibatalkan') |

### `po_detail` (penghubung PO ↔ transaksi asal)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| data_pengadaan_id | bigint FK |
| transaksi_id | varchar(30) FK |
| kuantum_kontribusi | decimal(10,2) |
| no_in | varchar nullable |

### `data_keuangan`
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| data_pengadaan_id | bigint FK (via no_spp) |
| status_bayar | enum('belum','dibayarkan') |
| tanggal_bayar | date nullable |

> **Modul Pengolahan** *(2026-07-20 — menggantikan tabel `permintaan_operasi` & `data_gudang` lama, yang sudah di-drop).* Kolom `users.nama_gudang varchar(150) nullable` ditambahkan (paralel `nama_maklon`) sebagai sumber nama gudang per akun ber-role gudang.

### `pengolahan` (satu baris per LHPK — dibuat UB Jastasma)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| makloon_user_id | bigint FK users — makloon terpilih |
| jumlah_kuantum | decimal(14,2) — snapshot total kuantum yang sudah IN pada makloon (read-only) |
| kuantum_olah | decimal(14,2) |
| no_lhpk | varchar unik |
| tanggal | date |
| ka1, ka2, ka3 | decimal(6,2) nullable |
| hgl, broken, menir, katul | decimal(14,2) nullable |
| rendemen | decimal(5,2) nullable — otomatis = HGL ÷ jumlah_kuantum × 100 |
| status | enum(`menunggu_operasi`,`ditolak`,`digabung`) |
| catatan_penolakan | text nullable — diisi saat Operasi menolak |
| mo_id | bigint FK mo nullable — terisi saat digabung |
| created_by, locked_at, locked_by, submitted_by, submitted_at | pola lifecycle |

### `mo` (grup gabungan — dibuat Operasi; analog `data_pengadaan`)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| no_mo | varchar unik |
| no_tm | varchar — No. Transfer Move (Operasi → Pengadaan) |
| makloon_user_id | bigint FK users — makloon grup (semua detail satu makloon) |
| total_kuantum_olah | decimal(14,2) — jumlah kuantum_olah baris tergabung |
| no_out | varchar nullable unik — diisi Pengadaan saat menerima |
| tujuan_gudang_user_id | bigint FK users nullable — akun gudang tujuan |
| no_tm_gudang | varchar nullable — No. Transfer Move (Operasi → Gudang), berbeda dari no_tm |
| kuantum_total | decimal(14,2) nullable — diisi Operasi saat kirim gudang |
| tanggal_terima_gudang | date nullable — diisi Gudang saat menerima |
| current_stage | varchar(20) — `pengadaan` \| `operasi` \| `gudang` \| `selesai` |
| status | enum(`berjalan`,`selesai`,`dibatalkan`) |
| catatan_penolakan | text nullable |
| created_by | bigint FK users |

### `mo_detail` (penghubung MO ↔ pengolahan; analog `po_detail`)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| mo_id | bigint FK mo (cascade) |
| pengolahan_id | bigint FK pengolahan, **unik** (satu baris hanya di satu MO) |

> **Alur modul Pengolahan (terima/tolak bertahap, terpisah dari timeline transaksi):**
> 1. **UB Jastasma** buat `pengolahan` per LHPK (`POST /api/pengolahan`); Jumlah Kuantum otomatis dari total IN makloon (`GET /api/pengolahan/kuantum-in`), Rendemen otomatis. → `menunggu_operasi`.
> 2. **Operasi** menolak (`POST /api/pengolahan/{id}/tolak` → balik ke UB Jastasma, ajukan ulang via `PATCH /api/pengolahan/{id}`) atau menggabungkan baris **makloon sama** jadi satu MO (`POST /api/mo/gabungkan`, isi No. MO + No. TM). Baris → `digabung`; MO → `current_stage=pengadaan`.
> 3. **Pengadaan** memutuskan (`PATCH /api/mo/{id}/out`): `diterima` (isi No. OUT) atau `ditolak` (isi catatan) — keduanya kembalikan MO ke `operasi`.
> 4. **Operasi** (melihat No. OUT) mengirim ke gudang (`PATCH /api/mo/{id}/kirim-gudang`: isi tujuan gudang, No. TM gudang, kuantum total). → `current_stage=gudang`.
> 5. **Gudang tujuan** menerima (`POST /api/mo/{id}/terima`, isi tanggal → `selesai`) atau menolak (`POST /api/mo/{id}/tolak` → balik ke `operasi`).

### `audit_log` (rekomendasi tambahan — lihat Bagian 9)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| transaksi_id | varchar(30) FK |
| user_id | bigint FK |
| aksi | varchar (mis. `terima`, `tolak`, `update_field`) |
| detail | json nullable |
| created_at | timestamp |

**Index wajib**: composite index `(tanggal_bongkar, id_pemasok, makloon_user_id)` di `data_makloon_mpp`/`data_makloon_tjp` (dipakai query grouping PO), index di semua kolom `transaksi_id` (FK), `makloon_user_id`, dan `status`.

---

## 5. Rancangan Endpoint API (garis besar)

| Method & path | Fungsi |
|---|---|
| `POST /api/login`, `POST /api/logout`, `GET /api/me` | Auth |
| `POST /api/transaksi` | Buat transaksi baru (role JP atau Makloon; skema auto) |
| `GET /api/transaksi` | List transaksi, difilter `current_stage` sesuai role user, paginated |
| `GET /api/transaksi/{id}` | Detail transaksi, field difilter sesuai visibilitas role |
| `PATCH /api/transaksi/{id}/jemput-pangan` | Isi/update data Jemput Pangan |
| `PATCH /api/transaksi/{id}/makloon` | Isi data Makloon (varian MPP/TJP otomatis sesuai skema) |
| `PATCH /api/transaksi/{id}/ub-jastasma` | Isi data UB Jastasma |
| `POST /api/transaksi/{id}/terima` | Terima & kunci data tahap sebelumnya, lanjut ke tahap berikutnya |
| `POST /api/transaksi/{id}/tolak` | Tolak, body: `{catatan}` |
| `POST /api/transaksi/{id}/foto` | Upload foto (multipart, field: `jenis_foto`) |
| `POST /api/pengadaan/gabungkan-po` | Gabungkan beberapa transaksi jadi satu PO |
| `PATCH /api/po/{id}` | Update harga/status PO |
| `PATCH /api/po/{id}/pembayaran` | Update status pembayaran (Keuangan) |
| `GET /api/pengolahan` | List pengolahan (ub_jastasma/operasi/pengadaan/gudang/admin) |
| `GET /api/pengolahan/kuantum-in` | Total kuantum sudah IN untuk makloon (ub_jastasma/admin) — isi Jumlah Kuantum read-only |
| `POST /api/pengolahan` | UB Jastasma: buat pengolahan per LHPK |
| `PATCH /api/pengolahan/{id}` | UB Jastasma: edit & ajukan ulang yang ditolak |
| `POST /api/pengolahan/{id}/tolak` | Operasi: tolak (kembali ke UB Jastasma) |
| `POST /api/mo/gabungkan` | Operasi: gabung baris pengolahan makloon-sama → MO (No. MO + No. TM) |
| `GET /api/mo`, `GET /api/mo/{id}` | List/detail MO (operasi/pengadaan/gudang/admin) |
| `PATCH /api/mo/{id}/out` | Pengadaan: `diterima` (isi No. OUT) / `ditolak` (isi catatan) → balik ke Operasi |
| `PATCH /api/mo/{id}/kirim-gudang` | Operasi: isi tujuan gudang + No. TM gudang + kuantum total, kirim ke Gudang |
| `POST /api/mo/{id}/terima` | Gudang tujuan: terima (isi tanggal → selesai) |
| `POST /api/mo/{id}/tolak` | Gudang tujuan: tolak (isi catatan) → balik ke Operasi |
| `GET/POST/PATCH/DELETE /api/admin/users` | CRUD user & role — khusus Admin (Makloon sertakan `nama_maklon`; Gudang sertakan `nama_gudang`) |
| `GET /api/makloon-options` | Daftar ringan `{id, nama_maklon}` user ber-role Makloon — sumber combobox (Bagian 7.4), dapat diakses semua role yang butuh memilih makloon |
| `GET /api/gudang-options` | Daftar ringan `{id, nama_gudang}` akun ber-role Gudang aktif — dropdown Tujuan Gudang di modul Pengolahan |
| `GET /api/monitoring/sebaran-tahap` | Jumlah transaksi per tahap, per skema (Bagian 7.5a) |
| `GET /api/monitoring/makloon` | Daftar makloon dikelompokkan per wilayah + jumlah transaksi per skema (Bagian 7.5b) |

---

## 6. Strategi Penyimpanan Foto (versi awal: disk lokal)

- Gunakan `spatie/laravel-medialibrary` dengan disk **`local`** (folder khusus di luar `public/`, mis. `storage/app/foto-transaksi`) — cukup ganti konfigurasi disk nanti ke `s3` kalau pindah ke object storage, kode aplikasi tidak perlu ditulis ulang.
- **Jangan taruh folder foto di `storage/app/public` yang di-symlink publik.** Tetap sajikan lewat **route terautentikasi** yang mengecek permission user (termasuk aturan visibilitas TJP di Bagian 3.3) sebelum stream file — gunakan `Storage::disk('local')->response()` atau signed route (`URL::temporarySignedRoute`) yang berlaku singkat. Prinsip ini sama pentingnya baik pakai disk lokal maupun S3: foto yang dibatasi tidak boleh punya URL yang bisa diakses langsung tanpa otorisasi.
- **Validasi server-side wajib**: tipe file (image/jpeg, image/png) dan ukuran maksimal 5MB — jangan hanya divalidasi di frontend.
- **Kompresi & thumbnail** (penting karena fokus versi ini adalah menampung banyak foto):
  - Client-side: kompres foto sebelum upload (foto kamera HP biasanya 3–8MB) menggunakan `browser-image-compression` di React — mempercepat upload dan menghemat ruang disk server.
  - Server-side: generate thumbnail (mis. lebar 300px) via `spatie/laravel-medialibrary` (driver `intervention/image`) — dipakai di tampilan list/grid, foto resolusi penuh baru dimuat saat detail dibuka.
- **Monitoring ruang disk**: karena foto disimpan lokal, pantau kapasitas disk VPS secara berkala (atau pasang volume/mount terpisah khusus untuk foto) supaya tidak kehabisan ruang tanpa peringatan.
- Generate thumbnail dijalankan lewat **queue** (Laravel Queue, driver `database` cukup untuk awal) agar tidak blocking request upload.
- **Migrasi ke object storage nanti**: kalau volume foto sudah besar dan butuh redundansi/backup terpisah, tinggal ganti disk config ke S3-compatible (AWS S3/DigitalOcean Spaces/dsb) — karena sudah pakai abstraksi Laravel Filesystem + medialibrary sejak awal, migrasi ini tidak menyentuh logic aplikasi.

---

## 7. Pola Desain & UI/UX

### 7.1 Identitas visual SerGab Lampung

**(Revisi)** — emas dikurangi drastis, hanya dipakai di logo mark. Navy dan netral jadi warna dominan di seluruh antarmuka:

| Token | Hex | Pemakaian |
|---|---|---|
| `primary` (navy) | `#1E3A6E` | Sidebar, header, tombol utama, teks penting, aksen aktif |
| `primary-dark` | `#142A52` | Hover/active state, footer |
| `primary-tint` | `#EEF2F8` | Latar section terang, badge netral, highlight ringan |
| `accent` (emas) | `#D9A441` | **Hanya di logo mark** — tidak dipakai sebagai warna badge/tombol/highlight di UI |
| `surface` | `#F8F9FB` | Latar belakang konten utama |
| `success` | `#1E6B4F` bg `#EAFAF0` | Status "diterima" |
| `warning` | `#8A5A10` bg `#FDF4E3` | Status "menunggu" |
| `danger` | `#A13030` bg `#FDE8E8` | Status "ditolak" |

**Prinsip pemakaian**: navy + netral (putih, abu-abu) mendominasi seluruh tampilan; emas murni jadi identitas logo saja, tidak dipakai berulang di elemen UI supaya tampilan terasa lebih matang/profesional, bukan seperti template generik. Tipografi: satu font sans-serif modern (mis. Inter atau Plus Jakarta Sans), dua ketebalan saja (regular/medium).

Referensi visual sudah didemonstrasikan di percakapan ini: halaman depan publik (landing page) dan halaman detail transaksi satu-halaman berkelanjutan — lihat Bagian 7.3 dan 7.4.

### 7.2 Pola komponen & interaksi

- **Styling**: Tailwind CSS + `shadcn/ui` untuk komponen dasar (button, dialog, table, form, toast) — konsisten dan sudah accessible secara default, tidak perlu desain dari nol.
- **Layout**: shell dengan sidebar navigasi + topbar, adaptif per role (menu berbeda sesuai permission). Mobile-first untuk role lapangan (Jemput Pangan, Makloon — kemungkinan besar input dari HP di lokasi), desktop-optimized untuk back-office (Keuangan, Pengadaan, Operasi).
- **Status badge**: warna konsisten (kuning = menunggu, hijau = diterima, merah = ditolak, abu = dikunci) — lihat token warna Bagian 7.1.
- **Data table**: TanStack Table dengan server-side pagination, sorting, filter kolom (tanggal, status, id pemasok) — wajib untuk listing ribuan baris, jangan load semua data sekaligus.
- **Upload foto**: komponen dengan live preview, progress bar saat upload, dan opsi kamera langsung (`capture="environment"`) atau galeri.
- **Konfirmasi aksi ireversibel**: dialog konfirmasi wajib untuk "Terima & Kirim" dan "Tolak" (menjelaskan konsekuensi: data terkunci / kembali untuk revisi).
- **Skeleton loader** saat data dimuat, **empty state** yang informatif untuk listing kosong, **toast notification** untuk feedback aksi.
- **Dashboard ringkasan** (khususnya Pengadaan/Keuangan): chart sederhana (`recharts`) untuk total kuantum per periode, status pembayaran, dsb.

### 7.3 Halaman depan publik (index, sebelum login)

**(Revisi)** — tombol CTA di hero dihapus; satu-satunya jalan masuk adalah tombol "Masuk" di navbar (lebih tenang, tidak terkesan seperti landing page jualan). Struktur yang disarankan (sudah didemonstrasikan visualnya di percakapan ini, versi kedua lebih kaya secara visual):

1. **Navbar** — logo SerGab Lampung, menu (Tentang, Visi & Misi, Tata Nilai, Kontak), tombol "Masuk" di kanan (satu-satunya entry point).
2. **Hero** — judul singkat yang kuat, penjelasan satu-dua kalimat, **grafis hero** (komposisi lingkaran bertingkat + ikon gudang/truk sebagai representasi visual alur logistik, dibuat dengan bentuk flat, bukan foto), plus dekorasi lingkaran samar di latar belakang supaya tidak terasa kosong. Tanpa tombol CTA.
3. **Baris statistik** — 3 angka ringkas (42 mitra makloon, 2 skema pengadaan, 7 tahap tertelusur) tepat di bawah hero, memberi kesan skala sistem sejak awal.
4. **Riwayat singkat perusahaan** — ringkas dari teks resmi yang Anda berikan (pendirian 21 Januari 2003, PP No. 7/2003, kini PP No. 13/2016).
5. **Visi & Misi** — visi ditonjolkan dalam kotak highlight, 4 poin misi dalam grid bernomor.
6. **Tata Nilai AKHLAK** — grid 6 kartu (Amanah, Kompeten, Harmonis, Loyal, Adaptif, Kolaboratif), masing-masing ikon + satu baris deskripsi.
7. **Footer** *(bebas isi, saran saya)* — logo & deskripsi singkat, alamat kantor wilayah, tautan cepat, baris copyright.

Halaman ini murni informasional (tanpa data transaksi), jadi bisa berupa halaman statis React terpisah dari area ter-autentikasi.

### 7.5 Halaman monitoring: sebaran tahap & daftar makloon

**(Baru)** — halaman ini menjawab kebutuhan "42 makloon dan progres sampai gudang harus mudah dilihat". Sudah didemonstrasikan visualnya di percakapan ini, terdiri dari dua bagian:

**a) Sebaran tahap saat ini, per skema** — dua kartu berdampingan (Skema TJP dan Skema MPP), masing-masing berisi horizontal bar chart sederhana: satu baris per tahap (Jemput Pangan..Keuangan untuk TJP, Makloon Kirim..Keuangan untuk MPP), panjang bar proporsional terhadap jumlah transaksi yang sedang ada di tahap tersebut, angka jumlah di ujung kanan. Ini menjawab permintaan "current stage tiap skema" — sekali lihat langsung tahu di mana penumpukan transaksi terjadi (mis. banyak yang menumpuk di Pengadaan berarti ada bottleneck penggabungan PO/IN).

**b) Daftar 42 makloon, dikelompokkan per wilayah** — bukan daftar datar 42 baris, tapi dikelompokkan (accordion/collapsible) per kabupaten/kecamatan supaya tidak menakutkan dilihat sekaligus. Tiap grup punya header dengan jumlah makloon di wilayah itu. Tiap baris makloon menampilkan: `nama_maklon`, lokasi singkat, dan dua badge kecil (jumlah transaksi aktif skema TJP & MPP untuk makloon tersebut). Ada filter cepat di atas (Semua/TJP/MPP) dan pencarian nama.

> **Perlu dikonfirmasi**: pengelompokan per wilayah di atas butuh field lokasi (kecamatan/kabupaten) yang **belum ada** di skema `users` yang baru (Anda hanya menyebutkan id, username, password, role_id, nama_maklon). Kalau pengelompokan per wilayah tetap diinginkan, field lokasi perlu ditambahkan ke `users` juga (diisi Admin saat membuat akun Makloon, sama seperti `nama_maklon`). Kalau tidak, daftar makloon cukup diurutkan alfabetis tanpa pengelompokan wilayah — silakan pilih salah satu, sudah saya tandai di Bagian 12.

Implementasi data: query `GROUP BY makloon_user_id` dengan `COUNT` transaksi aktif per skema, join ke `users` untuk mengambil `nama_maklon` — pastikan diberi index yang sesuai di kolom `makloon_user_id` pada tabel transaksi supaya agregasi ini tetap cepat meski data sudah ribuan baris.

### 7.4 Pola satu-halaman berkelanjutan untuk detail transaksi

**(Baru, menggantikan pendekatan form-per-role terpisah)** — satu halaman detail transaksi (`/transaksi/{id}`) dipakai oleh **semua role secara bergantian**, bukan halaman/form terpisah per role. Pola: **vertical timeline/accordion**, sudah didemonstrasikan visualnya di percakapan ini:

- **Tahap yang sudah selesai & terkunci**: ditampilkan **collapsed** — ringkas (nama tahap, diisi oleh siapa, kapan diterima), dengan tautan "Lihat detail" untuk expand read-only jika perlu. Ikon lingkaran bertanda centang, warna navy.
- **Tahap yang sedang aktif** (`current_stage` = role yang login): ditampilkan **expanded**, dengan border navy dan badge "Giliran Anda" — ini satu-satunya bagian yang bisa diedit oleh user yang login. Tombol **Tolak** dan **Terima & Kirim** di bagian bawah section ini.
- **Tahap yang belum berjalan**: ditampilkan **collapsed & redup** (opacity diturunkan), ikon lingkaran outline abu-abu, teks "Menunggu tahap sebelumnya" — memberi gambaran alur ke depan tanpa bisa diklik.
- Backend tetap harus **menolak** request edit ke tahap yang bukan `current_stage` milik role yang login (validasi di server, bukan hanya disable di UI).
- Komponen ini otomatis menyesuaikan skema (6 atau 7 baris timeline) berdasarkan `skema` transaksi.

**Pencarian Makloon (42 pilihan)**: karena daftar Makloon cukup banyak, jangan pakai `<select>` polos. Gunakan **combobox dengan pencarian** (mis. `cmdk`/shadcn Combobox): input teks dengan ikon cari, hasil difilter live saat mengetik dari `GET /api/makloon-options` (daftar user ber-role Makloon beserta `nama_maklon`-nya — **bukan tabel master terpisah**, lihat Bagian 4), item terpilih ditandai centang, label menunjukkan jumlah total (mis. "42 terdaftar"). Karena sumbernya adalah akun user, daftar ini otomatis bertambah/berkurang begitu Admin menambah atau menonaktifkan user Makloon — tidak perlu entri data ganda.

---

## 8. Struktur Folder Proyek (disarankan)

**Backend (Laravel)**
```
app/
  Http/Controllers/Api/
  Http/Resources/          # field-visibility filtering di sini
  Models/
  Services/                # TransaksiWorkflowService, PoGroupingService, dll — logika bisnis di luar controller
  Policies/
config/
  field_access.php         # matriks visibilitas field per role
```

**Frontend (React)**
```
src/
  pages/
  components/ui/           # shadcn/ui
  features/{role}/         # komponen & hooks spesifik per role
  lib/api.ts                # axios wrapper terpusat
  hooks/
```

---

## 9. Keamanan & Non-Functional

- Validasi file upload (mime + ukuran) di server, bukan hanya client.
- Rate limiting di endpoint login dan upload foto.
- HTTPS wajib, CORS whitelist origin frontend eksplisit (tidak `*`).
- `APP_DEBUG=false` di produksi.
- Backup terjadwal: `mysqldump` untuk database, dan backup rutin folder foto di disk lokal (rsync ke storage terpisah/off-site, karena versi awal tidak punya redundansi bawaan seperti object storage).
- **Audit log** (tabel `audit_log` di Bagian 4, opsional untuk versi awal namun disarankan sejak dini): rekam setiap aksi terima/tolak/ubah data penting — siapa, kapan, apa — penting untuk sistem pemerintahan yang perlu accountability/telusur, dan krusial untuk memantau aksi Admin yang bisa mengubah semua data (Bagian 3.5).
- Queue worker sederhana (driver `database` cukup di awal, upgrade ke Redis/Horizon kalau volume naik) untuk proses async (kompresi foto, notifikasi).

---

## 10. Roadmap Pengembangan Bertahap

1. **Setup dasar** — scaffolding Laravel API + React SPA, auth Sanctum, role/permission, CI dasar.
2. **Alur inti minimal** — transaksi TJP/MPP, tahap Jemput Pangan & Makloon saja (skema penentuan otomatis), pola terima/tolak/kunci generik.
3. **Lengkapi seluruh tahap** — UB Jastasma → Gudang, termasuk kontrol visibilitas field.
4. **Upload foto** — integrasi disk lokal, kompresi, thumbnail, route terautentikasi.
5. **Logika PO** — penggabungan, harga, pemecahan IN.
6. **UI polish** — stepper, dashboard, chart, responsive.
7. **Hardening** — audit log, testing, backup, pipeline deployment.

---

## 12. Asumsi yang Masih Perlu Dikonfirmasi

Bagian ini sengaja dipisah karena ada beberapa detail yang saya asumsikan berdasarkan diskusi kita, **belum dikonfirmasi eksplisit** — mohon direview sebelum implementasi dimulai. (Asumsi soal visibilitas field TJP, Admin bypass, dan penyimpanan foto sudah dikonfirmasi dan tidak lagi masuk daftar ini.)

1. **Level Operasi & Gudang** — *(DIPERBARUI 2026-07-20, menggantikan jawaban 2026-07-18)*: Operasi & Gudang bukan modul pengeluaran-stok-bebas, melainkan bagian dari **modul Pengolahan** — alur terima/tolak bertahap UB Jastasma → Operasi → Pengadaan → Operasi → Gudang (lihat Bagian 1 & 4). UB Jastasma membuat data pengolahan per LHPK, Operasi menggabungkannya jadi No. MO (analog PO), Pengadaan menerbitkan No. OUT, Operasi mengirim ke gudang, Gudang menerima. Jawaban 2026-07-18 (`permintaan_operasi` mandiri dengan gabah bebas) **dibatalkan**; tabel lama sudah di-drop.
2. **Satu user = satu role**: saya asumsikan tidak ada user yang punya lebih dari satu role sekaligus (termasuk Admin — asumsi: Admin adalah role terpisah, bukan tambahan di atas role operasional). Kalau ada petugas yang bisa berperan ganda, permission perlu disesuaikan.
3. **Reset nomor urut ID transaksi**: format `00001/bulan/tahun/skema` saya asumsikan nomor urut reset tiap bulan. Kalau resetnya per tahun atau tidak reset sama sekali, perlu diperjelas sebelum dibuat trigger/logic auto-increment-nya.
4. **Provider cloud spesifik**: Anda sebutkan cloud (VPS/AWS/GCP) tapi belum ditentukan provider mana — ini menentukan detail setup nginx/PHP-FPM saat deployment, meski tidak mengubah keputusan disk lokal untuk foto.
5. **Field lokasi untuk grouping wilayah makloon** (Bagian 7.5): skema `users` yang baru cuma punya `nama_maklon`, belum ada field lokasi/kecamatan. Kalau pengelompokan per wilayah di halaman monitoring tetap diinginkan, field ini perlu ditambahkan — kalau tidak, daftar makloon cukup diurutkan alfabetis. **Mohon konfirmasi salah satu.**
6. **Satu user Makloon = satu mitra makloon**: saya asumsikan setiap akun user ber-role Makloon merepresentasikan satu mitra/pabrik makloon (bukan beberapa staf berbagi satu akun mitra). Kalau satu mitra makloon punya beberapa staf dengan login terpisah, strukturnya perlu tabel `mitra_makloon` terpisah dari `users` (banyak user bisa merujuk ke satu mitra) — mohon konfirmasi mana yang sesuai kondisi di lapangan.
5. **Login pakai username**: karena email dihapus dari tabel `users`, saya asumsikan tidak ada fitur "lupa password via email" — kalau perlu reset password mandiri oleh user, perlu mekanisme lain (mis. reset oleh Admin secara manual). **Apakah ini sesuai kebutuhan?**
