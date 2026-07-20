# Desain: Modul Pengolahan (SERGAB / SerGab Lampung)

> Spec ini menggantikan pemahaman lama tentang Operasi & Gudang. Tanggal: 2026-07-20.
> Acuan induk: `SERGAB-panduan-pengembangan.md`. Bagian 1, 3, 4, 5, dan 12 di dokumen induk
> yang menyebut Operasi/Gudang sebagai modul mandiri **sudah tidak berlaku** dan akan
> disesuaikan setelah modul ini selesai.

## 1. Konteks & Koreksi

Pemahaman sebelumnya (Operasi sebagai modul mandiri yang "mengajukan pengeluaran stok", dan
Gudang sebagai modul pencatatan mandiri) **salah**. Yang benar: ada satu alur kerja baru
bernama **Pengolahan**, sebuah timeline terima/tolak (mirip timeline transaksi TJP/MPP) yang
**terpisah** dari timeline transaksi utama.

Alur pengolahan: **UB Jastasma → Operasi → Pengadaan → Operasi → Gudang.**

Timeline transaksi utama (TJP/MPP) **berhenti di Keuangan** (TJP 5 tahap, MPP 4 tahap). Operasi
dan Gudang **bukan lagi tahap** di timeline transaksi — keduanya adalah peran di dalam modul
Pengolahan yang baru.

## 2. Ruang Lingkup Teardown (dihapus lebih dulu)

Semua artefak dari pemahaman lama dihapus:

**Backend**
- `app/Http/Controllers/Api/OperasiController.php`
- `app/Services/Operasi/OperasiService.php`
- `app/Models/PermintaanOperasi.php`
- `app/Http/Controllers/Api/GudangController.php`
- `app/Models/DataGudang.php` (versi standalone; nama tabel dipakai ulang bila cocok, lihat §4)
- Route `/operasi/*` dan `/gudang/*` di `routes/api.php`
- Hapus entri `operasi` & `gudang` dari `TransaksiStages::sequence()` sehingga `$afterMakloon`
  berakhir di `keuangan`. Pastikan penerimaan (terima) di tahap `keuangan` menandai transaksi
  `status_keseluruhan = 'selesai'` (tidak ada tahap sesudahnya).

**Frontend**
- `pages/OperasiPage.tsx`, `pages/OperasiRekapPage.tsx`
- `pages/GudangPage.tsx`, `pages/GudangRekapPage.tsx`
- `hooks/useOperasiList.ts`, `hooks/useGudang.ts`
- Entri nav (`AppNav.tsx` / `navActions.ts`) & route (`App.tsx`) yang menuju halaman di atas

**Database**
- Migrasi baru bertanggal setelah 2026-07-20 yang men-*drop* tabel `permintaan_operasi` /
  `data_operasi` dan `data_gudang` lama. Migrasi historis tidak diedit — cukup ditumpuk migrasi
  drop, lalu migrasi create baru untuk skema Pengolahan.

**Tetap dipertahankan (bukan bagian teardown)**
- Rekap transaksi admin (`GET /api/transaksi/rekap`, `RekapTransaksiPage`, `adminUpdateRekap`).
  Yang diminta hapus hanya *rekap operasi*, bukan rekap transaksi.

## 3. Aturan Bisnis Kunci (hasil konfirmasi)

1. **Rendemen** (read-only di form UB Jastasma) = `HGL ÷ jumlah_kuantum × 100` (persen, < 100).
2. **`jumlah_kuantum`** (read-only) = angka asli total kuantum yang **sudah masuk proses IN**
   untuk makloon yang dipilih. Diagregasi dari `po_detail` (baris dengan `no_in` terisi) yang
   makloon-nya = makloon terpilih. Ini **angka referensi tampil saja** — tidak menguras/mengurangi
   pool saat pengolahan dibuat.
3. **TM = Transfer Move** — nomor perpindahan antar bidang. **Setiap hop punya No. TM sendiri
   yang berbeda**: `no_tm` (dibuat Operasi saat grouping MO, terlihat oleh Pengadaan) dan
   `no_tm_gudang` (dibuat Operasi saat mengirim ke Gudang) adalah dua nomor Transfer Move yang
   berbeda.
4. **Penggabungan MO**: Operasi hanya boleh menggabung baris `pengolahan` dengan **makloon yang
   sama** menjadi satu MO (baris dipilih berdasarkan No. LHPK). Analog dengan penggabungan PO.
5. **Akun Gudang = seperti Makloon**: satu username per gudang fisik (mis. "Gudang Jaya 1",
   "Gudang Jaya 2" adalah akun user berbeda, semua ber-role `gudang`). Nama gudang disimpan di
   `users.nama_gudang`, diisi Admin lewat CRUD Users (analog `nama_maklon`). Tujuan gudang pada
   sebuah MO memilih dari daftar akun ber-role `gudang`.

## 4. Model Data

Pola mengikuti `transaksi` → `data_pengadaan` / `po_detail` yang sudah ada.

### `pengolahan` (satu baris per LHPK — dibuat UB Jastasma)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | bigint PK | |
| makloon_user_id | bigint FK → users | makloon terpilih (role makloon) |
| jumlah_kuantum | decimal(14,2) | snapshot read-only total kuantum IN makloon (lihat §3.2) |
| kuantum_olah | decimal(14,2) | diinput UB Jastasma |
| no_lhpk | varchar UK | |
| tanggal | date | |
| ka1, ka2, ka3 | decimal(6,2) | |
| hgl, broken, menir, katul | decimal(14,2) | by-product hasil |
| rendemen | decimal(5,2) | otomatis = hgl ÷ jumlah_kuantum × 100 |
| status | enum('menunggu_operasi','ditolak','digabung') | |
| catatan_penolakan | text nullable | diisi saat Operasi menolak |
| mo_id | bigint FK → mo nullable | terisi saat baris digabung ke MO |
| created_by, locked_at, locked_by, submitted_by, submitted_at | | pola lifecycle |

### `mo` (grup gabungan — dibuat Operasi; analog `data_pengadaan`)
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | bigint PK | |
| no_mo | varchar UK | diisi Operasi saat grouping |
| no_tm | varchar | No. Transfer Move (Operasi → Pengadaan); terlihat di Pengadaan |
| makloon_user_id | bigint FK → users | makloon grup (semua detail satu makloon) |
| total_kuantum_olah | decimal(14,2) | jumlah kuantum_olah semua baris tergabung |
| no_out | varchar nullable UK | diisi Pengadaan saat menerima |
| tujuan_gudang_user_id | bigint FK → users nullable | akun gudang tujuan (role gudang) |
| no_tm_gudang | varchar nullable | No. Transfer Move (Operasi → Gudang), berbeda dari no_tm |
| kuantum_total | decimal(14,2) nullable | diisi Operasi saat kirim ke gudang |
| tanggal_terima_gudang | date nullable | diisi Gudang saat menerima |
| current_stage | varchar(20) | `pengadaan` \| `operasi` \| `gudang` \| `selesai` |
| status | enum('berjalan','selesai','dibatalkan') | |
| catatan_penolakan | text nullable | |
| created_by, timestamps | | |

### `mo_detail` (penghubung MO ↔ pengolahan; analog `po_detail`)
| Kolom | Tipe |
|---|---|
| id | bigint PK |
| mo_id | bigint FK → mo |
| pengolahan_id | bigint FK → pengolahan (unik — satu baris hanya di satu MO) |

### `users` (perubahan kecil)
- Tambah kolom `nama_gudang varchar(150) nullable` — diisi hanya untuk user ber-role `gudang`,
  sumber tunggal nama gudang (paralel `nama_maklon`).

**Index**: `pengolahan(makloon_user_id, status)`, `mo(current_stage, makloon_user_id)`,
`mo_detail(mo_id)`, unik `mo_detail(pengolahan_id)`.

## 5. State Machine Pengolahan

Unit berpindah dari **pengolahan** (per-LHPK) ke **MO** (grup) di tangan Operasi, persis seperti
transaksi → PO.

1. **UB Jastasma** membuat `pengolahan` (pilih makloon → `jumlah_kuantum` terisi otomatis;
   isi kuantum_olah, No LHPK, tanggal, KA1–3, HGL, Broken, Menir, Katul; Rendemen otomatis).
   → `status = menunggu_operasi`.
2. **Operasi** menerima/menolak tiap `pengolahan`.
   - Tolak → `status = ditolak` + `catatan_penolakan`; kembali ke UB Jastasma untuk diedit lalu
     diajukan ulang (`status` kembali `menunggu_operasi`).
   - (baris diterima tetap `menunggu_operasi` sampai digabung; penerimaan diwujudkan lewat aksi
     grouping di langkah 3 — tidak ada status "diterima" antara, agar sederhana).
3. **Operasi** menggabungkan beberapa `pengolahan` **makloon sama** (pilih baris berdasar No LHPK)
   → membuat **MO** dengan `no_mo` + `no_tm`. Baris tergabung → `pengolahan.status = digabung`,
   `pengolahan.mo_id` terisi. MO → `current_stage = pengadaan`.
4. **Pengadaan** melihat makloon + `no_mo` + `no_tm`; saat diklik → terima/tolak.
   - Tolak → `current_stage = operasi` + `catatan_penolakan` (Operasi mengedit MO).
   - Terima → isi `no_out`; `current_stage = operasi` (dikembalikan ke Operasi agar melihat No OUT).
5. **Operasi** (melihat No OUT) → terima/tolak.
   - Terima → isi `tujuan_gudang_user_id`, `no_tm_gudang`, `kuantum_total`; `current_stage = gudang`.
6. **Gudang** (hanya akun gudang tujuan) → terima/tolak.
   - Terima → isi `tanggal_terima_gudang`; `status = selesai`, `current_stage = selesai`.

Setiap hop memakai pola generik terima/tolak + `catatan_penolakan` + penguncian field, memakai
ulang infrastruktur `RiwayatPenolakan` / `AuditLogService` yang sudah ada bila relevan.

> **Catatan langkah 4→5**: baik terima maupun tolak di Pengadaan mengembalikan MO ke Operasi.
> Bedanya, "terima" mengisi `no_out` dan tanpa `catatan_penolakan`; "tolak" mengisi
> `catatan_penolakan` dan `no_out` tetap kosong. Frontend membedakan keduanya dari ada/tidaknya
> `no_out`.

## 6. Endpoint API

| Method & path | Peran | Fungsi |
|---|---|---|
| `GET /api/pengolahan` | ub_jastasma/operasi/pengadaan/gudang/admin | List (difilter sesuai peran) |
| `POST /api/pengolahan` | ub_jastasma/admin | Buat pengolahan baru |
| `PATCH /api/pengolahan/{id}` | ub_jastasma/admin | Edit & ajukan ulang yang ditolak |
| `POST /api/pengolahan/{id}/tolak` | operasi/admin | Tolak baris (catatan wajib) |
| `GET /api/pengolahan/kuantum-in?makloon_user_id=` | ub_jastasma/admin | Ambil total kuantum IN makloon (untuk field read-only) |
| `POST /api/mo/gabungkan` | operasi/admin | Gabung baris pengolahan → MO (`no_mo`, `no_tm`) |
| `GET /api/mo` | operasi/pengadaan/gudang/admin | List MO (difilter `current_stage` sesuai peran) |
| `GET /api/mo/{id}` | operasi/pengadaan/gudang/admin | Detail MO + baris detail |
| `PATCH /api/mo/{id}/out` | pengadaan/admin | Terima (isi `no_out`) / tolak MO |
| `PATCH /api/mo/{id}/kirim-gudang` | operasi/admin | Terima (isi tujuan gudang, no_tm_gudang, kuantum_total) / tolak |
| `POST /api/mo/{id}/terima` | gudang/admin | Gudang tujuan menerima (isi tanggal) |
| `POST /api/mo/{id}/tolak` | gudang/admin | Gudang tujuan menolak (catatan) |
| `GET /api/gudang-options` | ub_jastasma/operasi/pengadaan/gudang/admin | Daftar `{id, nama_gudang}` akun gudang (dropdown tujuan) |

Otorisasi per-tahap divalidasi di server (bukan hanya UI): request ke MO yang bukan
`current_stage` peran pemanggil ditolak. Untuk Gudang, hanya `tujuan_gudang_user_id` yang cocok
boleh terima/tolak.

## 7. Frontend

- **UB Jastasma** — `PengolahanPage`: list pengolahan miliknya + form buat (combobox makloon →
  `jumlah_kuantum` auto via `/api/pengolahan/kuantum-in`; Rendemen auto-hitung di UI, tetap
  divalidasi ulang server). Baris `ditolak` bisa diedit & diajukan ulang, menampilkan
  `catatan_penolakan`.
- **Operasi** — halaman review per-LHPK (terima menandai siap-gabung / tolak) + form gabung MO
  (pilih baris makloon sama → isi No MO + No TM); serta papan MO tahap "operasi" untuk mengisi
  tujuan gudang / No TM gudang / kuantum total setelah No OUT keluar.
- **Pengadaan** — papan MO tahap "pengadaan": tampil makloon + No MO + No TM; klik → terima
  (isi No OUT) / tolak.
- **Gudang** — papan MO tahap "gudang" yang tujuannya = akun login: terima (isi tanggal) / tolak.
- **Admin CRUD Users** — tambah field `nama_gudang` saat membuat/mengubah user role `gudang`.

Pola visual mengikuti `TransaksiDetailPage` (timeline vertikal, badge status, dialog konfirmasi
aksi ireversibel) dan `PengadaanPage` (papan review kartu).

## 8. Dampak ke Spec Induk

Setelah modul ini selesai, `SERGAB-panduan-pengembangan.md` diperbarui: Bagian 1 (Operasi/Gudang
bukan modul mandiri melainkan modul Pengolahan), Bagian 4 (ganti tabel `permintaan_operasi` &
`data_gudang` dengan `pengolahan`/`mo`/`mo_detail` + kolom `users.nama_gudang`), Bagian 5
(endpoint), Bagian 12 (tutup asumsi #1 dengan pemahaman baru).

## 9. Testing

Feature test (SQLite in-memory, `RefreshDatabase`, seed `RoleSeeder`) menutup:
- UB Jastasma buat pengolahan; `jumlah_kuantum` & `rendemen` terhitung benar.
- Operasi tolak → balik ke UB Jastasma; ajukan ulang.
- Grouping MO menolak baris lintas-makloon; menerima baris makloon sama; `total_kuantum_olah` benar.
- Pengadaan terima (No OUT unik) & tolak; MO balik ke Operasi.
- Operasi kirim gudang; Gudang non-tujuan ditolak otorisasi; Gudang tujuan terima → selesai.
- Otorisasi peran & tahap di tiap endpoint.

## 10. Di Luar Lingkup

- Foto/media pada modul Pengolahan (belum diminta).
- Perubahan pada timeline transaksi TJP/MPP selain menghapus tahap operasi/gudang.
- Migrasi data lama `permintaan_operasi`/`data_gudang` (tabel di-drop; belum ada data produksi).
