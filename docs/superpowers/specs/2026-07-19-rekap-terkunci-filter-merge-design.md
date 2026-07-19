# Rekap: Hanya Data Terkunci, Filter Kolom, dan Sel PO Gabungan

Tanggal: 2026-07-19

## Ringkasan

Tiga halaman rekap (Transaksi, Operasi, Gudang) dirapikan agar hanya memuat data
yang sudah final, kolom statusnya dihapus, barisnya terurut secara deterministik,
dan bisa disaring per kolom. Hasil saringan itulah yang ikut ter-download saat
ekspor CSV. Khusus Rekap Transaksi, kolom No. PO ditampilkan sebagai sel gabungan
agar terlihat bahwa beberapa transaksi bernaung di bawah satu PO.

## Definisi "Terkunci"

Terkunci berarti data sudah disimpan dan sudah diterima oleh role berikutnya,
sehingga tidak dapat diubah lagi kecuali oleh admin. Ini bukan konsep baru:
`TransaksiStageService::submitStage()` sudah menolak perubahan pada record yang
berstatus `menunggu_review` atau `diterima`, dan `diterima` dipasang saat role
berikutnya menerima data tersebut.

Padanan per role:

| Role | Terkunci bila |
|---|---|
| `jemput_pangan` | `data_jemput_pangan.status = 'diterima'` |
| `makloon` | `data_makloon_tjp.status = 'diterima'` (skema TJP) atau `data_makloon_mpp.status = 'diterima'` (skema MPP) |
| `ub_jastasma` | `data_ub_jastasma.status = 'diterima'` |
| `pengadaan` | `data_pengadaan.review_status = 'diterima'` (PO diterima Keuangan) |
| `keuangan` | `data_keuangan.review_status = 'diterima'` (pembayaran diterima Operasi) |
| `admin` | tahap awal transaksi terkunci — `data_jemput_pangan` untuk TJP, `data_makloon_mpp` untuk MPP |

Admin sengaja memakai aturan paling longgar karena admin bertugas memperbaiki
data bermasalah; kalau disaring sampai tahap akhir, justru transaksi yang perlu
diperbaiki tidak akan terlihat.

Aturan admin tidak perlu ditulis manual per skema: `TransaksiStages::stageAt($skema, 0)`
sudah mengembalikan tahap pertama beserta model-nya (`DataJemputPangan` untuk TJP,
`DataMakloonMpp` untuk MPP). Empat tahap terakhir (`pengadaan` sampai `gudang`)
sengaja ber-`model => null` di helper itu karena beroperasi di level PO, bukan per
transaksi — itulah sebabnya `pengadaan` dan `keuangan` memakai `review_status`
alih-alih `status`.

## Bagian 1 — Backend: `TransaksiController::rekap()`

### Filter terkunci

Query di `rekap()` menyaring berdasarkan role peminta sesuai tabel di atas.
Filter yang sekarang dikerjakan di frontend (`RekapTransaksiPage.tsx`, perhitungan
`terkunci`) dipindah ke sini. Alasannya endpoint ini dipaginasi (`per_page=200`
dari frontend): menyaring di frontend berarti yang tersaring hanya halaman yang
kebetulan ter-load, sehingga begitu data melewati 200 baris tabelnya bocor.

Filter `skema = 'TJP'` untuk role `jemput_pangan` yang sudah ada tetap berlaku.

### Urutan

`ORDER BY skema, no_po, id_transaksi` dengan `no_po` diambil lewat subquery
`po_detail` → `data_pengadaan`.

- `skema` lebih dulu agar TJP dan MPP tetap jadi blok terpisah.
- `no_po` di tengah agar baris satu PO berdampingan — prasyarat sel gabungan.
- `id_transaksi` terakhir, urut string menaik (format `00001/07/2026/TJP`,
  jadi efektif urut nomor seri).

Transaksi yang belum punya PO bernilai `no_po = NULL` dan ditempatkan **di akhir
tiap blok skema**, tetap urut ID di antara sesamanya. Ini wajib: kalau baris
tanpa PO tersebar di tengah, blok merge akan terpotong.

Catatan asumsi: kunci pengelompokan PO di `PoGroupingService` adalah
(tanggal_bongkar, id_pemasok, makloon_user_id) dan **tidak** memeriksa `skema`.
Secara domain satu PO diyakini tidak akan memuat TJP dan MPP sekaligus, tapi
kode tidak menjaminnya. Menaruh `skema` di urutan pertama membuat tabel tetap
rapi seandainya asumsi itu suatu saat dilanggar — PO campuran akan tampil
sebagai dua blok merge terpisah, bukan tabel berantakan.

### Verifikasi

Feature test baru di `backend/tests/Feature/Transaksi/`:

1. Transaksi yang tahap milik role peminta belum `diterima` tidak muncul di respons.
2. Tiap role melihat baris sesuai tabel definisi terkunci (termasuk pengadaan,
   keuangan, admin).
3. Urutan respons adalah skema → PO → ID, dengan baris tanpa PO di akhir blok skema.

## Bagian 2 — Komponen `DataSpreadsheet`

Komponen tetap generik dan dipakai ketiga halaman tanpa kode khusus. Dua
kemampuan baru dikendalikan lewat tipe `SheetColumn`:

### `filterable?: boolean`

Kolom yang ditandai mendapat dropdown berisi nilai unik yang benar-benar ada di
data, bisa pilih lebih dari satu nilai. Filter aktif tampil sebagai chip yang
bisa dilepas satu per satu, plus tombol bersihkan semua. Antar kolom digabung
dengan AND, dan digabung juga dengan kotak pencarian teks yang sudah ada.

### `mergeKey?: (row: T) => string | null`

Kolom dengan `mergeKey` digabung vertikal memakai `rowSpan` selama baris
berurutan menghasilkan kunci sama dan kuncinya bukan `null`. Baris ber-`null`
tidak pernah digabung.

Perhitungan `rowSpan` dilakukan **setelah** filter dan pencarian diterapkan.
Kalau sebagian baris satu PO tersaring keluar, sel gabungannya ikut menyusut —
tidak ada `rowSpan` menggantung yang merusak struktur tabel.

Nomor baris `#` dan zebra striping tetap per baris, tidak ikut digabung.

### Ekspor CSV

Logika ekspor tidak berubah: tombol sudah memakai daftar `filtered`, dan CSV
dibangun dari `value(row)` per baris sehingga No. PO otomatis terulang di tiap
baris — bukan dikosongkan seperti tampilan merge di layar. Ini disengaja agar
file tetap bisa di-sort, di-filter, dan di-pivot di Excel.

Yang perlu dipastikan hanyalah `filtered` kini mencakup filter kolom, bukan
hanya pencarian teks seperti sekarang.

## Bagian 3 — Halaman Rekap

### Semua halaman: kolom status dihapus

Dihapus dari layar maupun CSV.

- `RekapTransaksiPage`: kolom `status`, `jp_status`, `mk_status`, `ub_status`,
  `po_status`, `ku_bayar`, berikut komponen `StatusBadge` dan peta
  `STATUS_LABEL` yang jadi tidak terpakai.
- `OperasiRekapPage`: kolom `status` dan `STATUS_LABEL`-nya.
- `GudangRekapPage`: sudah tidak punya kolom status.

Kolom `Tahap Saat Ini` di Rekap Transaksi **dipertahankan** — isinya posisi alur,
bukan status kunci.

### Rekap Transaksi

- Sumber baris mengikuti hasil `rekap()` yang sudah tersaring dan terurut di
  backend; perhitungan `terkunci` di frontend dihapus.
- **Hanya kolom `No. PO`** yang digabung (`mergeKey` = nilai No. PO itu sendiri).
  Kolom PO lainnya — `Harga/kg`, `Total Kuantum`, `Total Harga`, `No. SPP` —
  tetap ditampilkan per baris meski nilainya berulang, agar tiap baris tetap
  terbaca utuh secara mendatar.
- `No. IN` juga tidak digabung karena nilainya memang berbeda per transaksi.
- Kolom `filterable`: Skema, Makloon, No. PO, dan kolom wilayah milik Jemput
  Pangan (`jp_kab`, `jp_kec`). Kolom wilayah milik Makloon (`mk_kab`, `mk_kec`)
  tidak ikut agar bar filter tidak berisi dua pasang "Kabupaten/Kecamatan" yang
  membingungkan.
- Kartu statistik "Tahap Anda terkunci" diganti "Total PO" — jumlah No. PO unik
  di tabel. Kartu lama jadi tidak bermakna karena semua baris kini pasti terkunci.

### Rekap Operasi

Selain penghapusan kolom status, hanya baris yang **sudah dikeluarkan dan hasil
produksinya sudah diisi** yang masuk tabel — `status_out = 'dikeluarkan'` dan
lolos `sudahIsiHasil()`. Kolom `filterable`: Gudang Penerima.

Filter ini dikerjakan di frontend, berbeda dari Rekap Transaksi. Alasannya
endpoint `/api/operasi` dipakai bersama halaman input `OperasiPage`; menyaring
di `OperasiController::index()` akan merusak halaman itu. Halaman ini sudah
meminta `per_page=200` dan `GudangRekapPage` pun sudah menyaring dengan cara
yang sama, jadi pola ini konsisten dengan yang ada.

### Rekap Gudang

Tabel dan filter barisnya sudah benar, tidak diubah. Hanya ditambah kolom
`filterable`: Nama Gudang.

## Verifikasi Frontend

Frontend belum punya test runner (tidak ada vitest di `package.json`), jadi
verifikasi lewat:

1. `npm run build` (menjalankan `tsc -b`) — tidak ada error tipe.
2. `npm run lint` (oxlint) — bersih.
3. Menjalankan aplikasi dan memeriksa tiap halaman rekap: kolom status hilang,
   urutan sesuai, filter kolom bekerja, sel PO tergabung, dan file CSV hasil
   unduh berisi persis baris yang terlihat setelah difilter.

## Di Luar Cakupan

- Kemampuan admin mengubah data terkunci dan propagasinya ke role lain. Ini
  disinggung saat diskusi tapi merupakan fitur tersendiri, bukan bagian dari
  perubahan rekap ini.
- Filter preset (rentang tanggal, dropdown skema khusus). Filter per kolom yang
  generik dinilai sudah mencukupi.
- Sorting dan filter sisi server untuk Rekap Operasi dan Rekap Gudang.
