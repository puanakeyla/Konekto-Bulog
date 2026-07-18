# Desain: Pengadaan & Keuangan inline di timeline transaksi

Tanggal: 2026-07-17
Status: disetujui (menunggu review spec sebelum penyusunan rencana)

## 1. Tujuan

Menjadikan tahap **Pengadaan** dan **Keuangan** dikerjakan **langsung (inline)** di halaman
timeline satu transaksi (`TransaksiDetailPage`), bukan lewat tombol yang mengarahkan ke halaman
terpisah (`/pengadaan`, `/keuangan`). Tujuannya agar seluruh alur transaksi diselesaikan pada satu
tempat, dengan pola aksi yang konsisten (isi data + Terima/Tolak) seperti tahap Jemput Pangan,
Makloon, dan UB Jastasma.

Batasan tampilan (permintaan eksplisit user): **UI Pengadaan tetap persis seperti halaman saat ini**
(section "Gabungkan Transaksi Menjadi PO" + "PO Proses – Isi Nomor IN"). Yang berubah hanya
**letak**-nya (dipindah ke dalam kartu timeline), bukan bentuk/alur formnya.

Lingkup: hanya **Pengadaan** dan **Keuangan** yang dijadikan inline. Tahap **Operasi** dan **Gudang**
**dihilangkan total dari timeline** — timeline berhenti di Keuangan. Kedua tahap tetap berjalan di
backend dan dikerjakan di halaman `/operasi` & `/gudang` seperti biasa.

## 2. Konteks kode saat ini

- `frontend/src/pages/TransaksiDetailPage.tsx` — timeline per transaksi. Tahap dengan `dataKeys`
  (jemput_pangan, makloon, ub_jastasma) punya form inline + aksi review (`terima`/`tolak` via
  `POST /api/transaksi/{id}/terima|tolak`). Tahap pengadaan/keuangan/operasi/gudang memakai
  `actionPath` → merender `<Link>` "Buka …" ke halaman terpisah.
- `frontend/src/pages/PengadaanPage.tsx` — section "Gabungkan Transaksi Menjadi PO"
  (`POST /api/pengadaan/gabungkan-po`), "PO Proses – Isi Nomor IN" (`PATCH /api/po/{id}/in`,
  `PATCH /api/po/{id}` untuk status/harga), dan "Approval Nomor OUT".
- `frontend/src/pages/KeuanganPage.tsx` — section "PO Siap Dibayar" (`PATCH /api/po/{id}/pembayaran`).
- Backend **sudah memiliki** seluruh mesin PO + review:
  - `DataPengadaan` punya `review_status` (`menunggu_review|diterima|ditolak`),
    `catatan_penolakan`, `reviewed_by`, `reviewed_at`, `no_spp`.
  - `PengadaanController@update`: saat status PO menjadi `lengkap`, otomatis set
    `review_status = menunggu_review` dan memindahkan `current_stage` transaksi anggota ke `keuangan`;
    memblokir edit saat `review_status = diterima`.
  - `PoReviewService::terima/tolak` + endpoint `POST /api/po/{id}/terima|tolak`: Keuangan menerima
    (mengunci data Pengadaan) atau menolak (mengembalikan seluruh transaksi anggota ke `pengadaan`,
    dapat diedit ulang, dengan catatan → `RiwayatPenolakan`).
  - `PengadaanController@pembayaran` + `PoLifecycleService`: Keuangan input No. SPP + tanggal bayar
    → transaksi lanjut ke `operasi`.
- Kesenjangan satu-satunya: `GET /api/transaksi/{id}` (`TransaksiResource`) **belum** menyertakan PO
  (`data_pengadaan`) tempat transaksi ini bernaung, sehingga timeline tidak punya konteks PO.

Kesimpulan: pekerjaan **mayoritas frontend** (relokasi UI ke timeline) + **satu penambahan
backend** (ekspos PO di detail transaksi). Endpoint aksi dipakai ulang apa adanya.

## 3. Perubahan backend

Satu perubahan:

1. `TransaksiController@show`: eager-load PO milik transaksi via relasi PO detail
   (`poDetail.dataPengadaan` beserta `dataPengadaan.poDetail` seluruh anggota, `dataKeuangan`).
2. `TransaksiResource`: tambah field `data_pengadaan` menggunakan `DataPengadaanResource` yang sudah
   ada. Isi minimal yang dibutuhkan panel inline: `id`, `no_po`, `harga`, `total_kuantum`,
   `total_harga`, `status`, `review_status`, `catatan_penolakan`, `no_spp`,
   `data_keuangan` (`status_bayar`, `tanggal_bayar`), dan `po_detail[]`
   (`id`, `transaksi_id`, `kuantum_kontribusi`, `no_in`). Bila transaksi belum tergabung ke PO,
   field `data_pengadaan` bernilai `null`.

Tidak ada endpoint baru. Daftar transaksi yang bisa digabung tetap diambil dari
`GET /api/transaksi` mode "siap PO" (hook `useTransaksiList(page, per, true)`), sama seperti
`PengadaanPage`.

Catatan relasi: pastikan model `Transaksi` punya relasi menuju `PoDetail`/`DataPengadaan`
(mis. `poDetail`/`dataPengadaan`). Bila belum ada, tambahkan relasi read-only tersebut.

## 4. Ekstraksi komponen bersama (menghindari duplikasi)

Pindahkan sub-bagian dari `PengadaanPage`/`KeuanganPage` menjadi komponen mandiri yang dipakai
**baik oleh halaman lama maupun timeline**. Lokasi usulan: `frontend/src/components/pengadaan/`.

- `GabungPoForm` — section "Gabungkan Transaksi Menjadi PO" (tabel transaksi terpilih + filter +
  No. PO + harga + total + tombol Buat PO). Prop untuk sumber daftar transaksi supaya bisa dipakai
  dalam mode halaman (semua transaksi siap PO, berhalaman) maupun mode timeline (transaksi yang
  cocok/eligible untuk digabung).
- `PoInForm` — kartu "PO Proses – Isi Nomor IN" (status PO + input No. IN per detail). Dipindah apa
  adanya dari `PengadaanPage`.
- `PembayaranForm` — kartu pembayaran (No. SPP + tanggal bayar). Dipindah apa adanya dari
  `KeuanganPage`.
- `PoReviewActions` — tombol **Tolak** / **Terima & Lanjutkan** untuk PO (memanggil
  `POST /api/po/{id}/terima|tolak`), meniru pola `ReviewActions` yang sudah ada (dialog konfirmasi +
  catatan wajib saat menolak).

`PengadaanPage` dan `KeuanganPage` di-refactor untuk mengimpor komponen yang sama sehingga perilaku
dan tampilan identik dengan versi inline. Tidak ada logika bisnis yang digandakan.

## 5. Perilaku kartu Pengadaan di timeline (`current_stage = pengadaan`)

Prasyarat masuk tahap ini: data UB Jastasma sudah diterima. Review UB Jastasma
(Terima/Tolak) **tetap seperti sekarang** (tidak diubah). Setelah UB diterima, kartu Pengadaan
menampilkan panel sesuai keadaan PO (`data_pengadaan`):

- **`data_pengadaan = null` (belum ada PO)** → render `GabungPoForm` (mode timeline): tabel transaksi
  yang cocok untuk digabung, transaksi ini otomatis tercentang, input No. PO + harga → **Buat PO**
  (`POST /api/pengadaan/gabungkan-po`).
- **PO `status = proses` (IN belum lengkap)** → render `PoInForm`: status PO + input No. IN per
  detail → **Simpan Nomor IN** (`PATCH /api/po/{id}/in`). Saat seluruh IN terisi, kirim ke Keuangan
  dengan menyetel status `lengkap` (`PATCH /api/po/{id}`) — backend otomatis set
  `review_status = menunggu_review` dan memindahkan transaksi anggota ke `keuangan`.
- **PO `review_status = ditolak`** (ditolak Keuangan) → tampilkan catatan penolakan; data (harga,
  No. IN, status) dapat diedit ulang lalu dikirim lagi (menjadi `menunggu_review` kembali).
- **PO `review_status = menunggu_review` / `diterima`** → ringkas read-only ("Menunggu review
  Keuangan" / terkunci).

Aksi Pengadaan bersifat pengisian data (maju), sehingga tombol utamanya adalah "Buat PO" /
"Simpan Nomor IN" / "Kirim ke Keuangan" — bukan Terima/Tolak. (Tombol Tolak untuk revisi ada di
sisi peninjau, yaitu Keuangan.)

## 6. Perilaku kartu Keuangan di timeline (`current_stage = keuangan`)

- **`review_status = menunggu_review`** → tampilkan ringkasan PO (No. PO, daftar transaksi anggota,
  No. IN, harga, total) + `PoReviewActions`: **Tolak** (catatan wajib → `POST /api/po/{id}/tolak`,
  seluruh transaksi anggota kembali ke Pengadaan dan dapat diedit) / **Terima & Lanjutkan**
  (`POST /api/po/{id}/terima` → data Pengadaan terkunci).
- **`review_status = diterima` dan belum dibayar** → render `PembayaranForm`: No. SPP + tanggal bayar
  → **Tandai Dibayarkan** (`PATCH /api/po/{id}/pembayaran`) → transaksi lanjut ke Operasi.
- **Sudah dibayar** → ringkas read-only.

Konsistensi (opsional, bukan syarat utama): karena `PembayaranForm` dan `PoReviewActions` diekstrak
menjadi komponen bersama, `KeuanganPage` lama **boleh** ikut menampilkan langkah review
(Terima/Tolak sebelum bayar) agar seragam. Namun bila ingin menjaga halaman lama tetap persis
seperti sekarang, langkah review cukup ada di timeline saja — keputusan final ini dikonfirmasi saat
implementasi. Perubahan yang diwajibkan hanya versi inline di timeline.

## 7. Konfigurasi STAGES

- Untuk `pengadaan` & `keuangan`: hapus `actionPath`/`actionLabel`, ganti dengan penanda render
  inline; sesuaikan teks helper.
- `operasi` & `gudang`: **dihilangkan dari daftar tahap yang dirender** di timeline sehingga
  timeline berhenti di Keuangan. Definisi/label keduanya tetap dipertahankan untuk keperluan lookup
  teks (mis. label `current_stage`, label `RiwayatPenolakan`) — hanya dikecualikan dari `<ol>` tahap
  (lewat filter di `stagesFor()`/daftar yang dirender), bukan dihapus dari konstanta label.
- Konsekuensi tampilan: setelah Keuangan menandai dibayarkan dan transaksi lanjut ke `operasi`,
  timeline tidak lagi menampilkan kartu tahap; status lanjutan transaksi dipantau lewat halaman
  `/operasi`, `/gudang`, dan `/monitoring`.

## 8. Efek lintas transaksi (penting)

Satu PO memuat banyak transaksi. Aksi pada PO (Buat PO, Simpan IN, Terima/Tolak, Bayar) **berlaku
untuk seluruh transaksi anggota PO tersebut**. UI harus menampilkan daftar transaksi anggota dan
copy peringatan singkat agar petugas sadar aksinya memengaruhi lebih dari satu transaksi. Perilaku
"Tolak mengembalikan semua anggota ke Pengadaan" mengikuti `PoReviewService` yang sudah ada
(`Transaksi::whereIn(...)->update(['current_stage' => 'pengadaan'])`).

## 9. Error handling & invalidation

- Tampilkan pesan error server secara inline (mis. `no_po` unik, `no_spp` unik, validasi IN).
- Setelah setiap aksi sukses, invalidate query: `['transaksi', id]`, `['po-list']`,
  `['transaksi-list']` agar timeline dan daftar tersinkron.
- Izin akses: panel Pengadaan hanya untuk role `pengadaan`/`admin`; panel Keuangan hanya untuk
  role `keuangan`/`admin` (`canAct = role === current_stage || role === 'admin'`).

## 10. Testing

- Backend: tambah pengujian bahwa `GET /api/transaksi/{id}` menyertakan `data_pengadaan` untuk
  transaksi yang sudah tergabung PO (dan `null` bila belum). Endpoint aksi sudah punya pengujian
  lifecycle PO yang ada — pastikan tetap hijau.
- Frontend: verifikasi alur end-to-end secara manual di timeline: Buat PO → Simpan IN → Kirim ke
  Keuangan → (Keuangan) Tolak → Pengadaan edit → Kirim lagi → (Keuangan) Terima → Bayar → lanjut ke
  Operasi. Bila proyek punya test komponen, tambahkan untuk `PoReviewActions`.

## 11. Yang TIDAK termasuk lingkup

- Perubahan alur/logika backend tahap Operasi & Gudang (keduanya hanya dihilangkan dari tampilan
  timeline; pengerjaan tetap di halaman `/operasi` & `/gudang`).
- Perubahan skema database atau logika `PoReviewService`/`PoLifecycleService` (dipakai apa adanya).
- Perubahan tampilan/alur form Pengadaan (harus tetap sama, hanya relokasi).
