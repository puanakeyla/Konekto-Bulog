# Jaminan Makloon — Kuota Harian + Plafon Tunggakan

Tanggal: 2026-08-13
Branch: `pengolahan`
Menggantikan aturan yang berjalan sejak `2026_08_09_110000_create_jaminan_makloon_table`

## Masalah

Aturan jaminan yang berjalan punya tiga gerbang, dan dua di antaranya salah ukur:

1. **Kuota harian** — maksimal `kapasitas_per_hari_kg` per tanggal bongkar. Ini benar.
2. **Tenggat** — bongkar tertua wajib tuntas dalam `batas_hari`. Pesannya menyebut tanggal
   yang jauh dari aturan yang baru diketik Operasi, membingungkan pemakai.
3. **Plafon stok belum diolah** — mengukur "gabah masuk" lewat `gabah_sudah_in`, yang baru
   terisi setelah Pengadaan menerbitkan No IN. Gabah yang sudah dibongkar tapi belum ber-PO
   tidak terhitung sama sekali, padahal justru itu yang menumpuk di makloon.

Ditambah satu bug: pengurang "sudah diolah" mencocokkan `pengolahan_lhpk.transaksi_pengolahan_id`
(ber-FK ke `transaksi_pengolahan`, id berakhiran `/GDG` atau `/UBJ`) dengan `transaksi.id_transaksi`
(SerGab, berakhiran `/TJP` atau `/MPP`). Dua ruang id yang tidak pernah beririsan.

## Aturan

Operasi mengisi **jumlah hari**, bukan tanggal. Sistem yang mengubahnya jadi tanggal:

```
Bentuk jaminan     : Bank Garansi BNI No. 0012/BG/2026   (baru, teks bebas)
Jaminan (Rp)       : 100.000.000
Kapasitas per hari : 3.000 kg
Batas hari         : 3
      => Berlaku 13 - 15 Agu 2026        dihitung dari tanggal simpan
      => Plafon tunggakan 9.000 kg       kapasitas_per_hari x batas_hari
```

Tanggal berlaku dipakai untuk **koordinasi dan tampilan**, bukan gerbang. Lewat tanggal itu
makloon tidak otomatis diblokir — yang menahan hanya dua gerbang di bawah.

### Dua gerbang

Diperiksa saat makloon menekan Kirim, dipatok **tanggal bongkar** dan **kuantum bongkar**.
Berlaku sama untuk TJP (tahap Makloon) dan MPP (tahap Makloon Terima).

**Gerbang 1 — kuota harian.** `terpakai(tanggal_bongkar) + kuantum <= kapasitas_per_hari_kg`

```
Kuota harian 3.000 kg. Tanggal 13/08/2026 sudah terpakai 2.000 kg, sisa 1.000 kg.
```

Sisa kuota harian **hangus** saat ganti hari; tidak digulung. Tidak dipakai bukan pelanggaran —
tidak ada pesan apa pun selama makloon tidak melewatinya.

**Gerbang 2 — plafon tunggakan.** `tunggakan + kuantum <= kapasitas_per_hari_kg x batas_hari x 1,1`

```
tunggakan = total kuantum bongkar makloon
          - total kuantum_gabah_diolah dari LHPK yang sudah DIKIRIM UB
```

"Sudah dikirim" = `pengolahan_lhpk.status` bernilai `menunggu_review` **atau** `diterima`.
Tidak perlu menunggu masuk rekap — begitu UB mengirim ke tahap berikutnya, kuota terbuka.

Toleransi 10% karena kuantum olahan UB tidak pernah sama persis dengan kuantum bongkar
makloon (selisih timbang, susut). Selisihnya bisa ke atas maupun ke bawah, karena itu
toleransi dipasang **hanya melonggarkan, tidak pernah memperketat**: selisih wajar ke arah
mana pun tidak menahan makloon yang sudah tertib.

### Pesan gerbang 2 — panduan, bukan sekadar penolakan

```
Gabah Anda yang belum diolah UB sudah 9.000 kg, melewati batas jaminan
9.000 kg (3.000 kg x 3 hari).

Input baru bisa dilakukan setelah UB Jastasma mengirim hasil olahan (LHPK)
ke tahap berikutnya. Tidak perlu menunggu sampai masuk rekap - begitu
dikirim, kuota Anda terbuka kembali.

Gabah menunggak paling lama sejak 10/08/2026.
```

## Perbaikan cara mengukur

| | Sekarang | Revisi |
|---|---|---|
| Gabah masuk | `gabah_sudah_in`, butuh No IN dari Pengadaan | **kuantum bongkar** langsung, TJP + MPP |
| Gabah keluar | LHPK `status = 'diterima'` saja | `menunggu_review` **atau** `diterima` |
| Kaitan ke makloon | id `/GDG` vs id `/MPP`, tidak pernah cocok | `transaksi_pengolahan.makloon_user_id` |

Gabah masuk memakai definisi yang sudah ada di `kuantumBongkarPadaTanggal` (TJP lewat
`data_makloon_tjp.kuantum_bongkar` + `data_jemput_pangan.makloon_user_id`; MPP lewat
`data_makloon_terima.kuantum_bongkar` + `transaksi.created_by`), tanpa saringan tanggal.

## Yang dihapus

- `pastikanMasihDalamTenggat()`, `tanggalBongkarTertuaBelumTuntas()`,
  `tanggalMppTertuaBelumDiolah()` — gerbang tenggat beserta perbaikan FIFO-nya
- `stokBelumAdmBelumOlah()` — diganti perhitungan tunggakan di atas
- test: `submit_ditolak_pada_hari_keempat`, `tenggat_lepas_setelah_gabahnya_diolah`

`neracaMakloon()` **tetap** — masih dipakai tampilan neraca UB Jastasma dan
`PengolahanController`, hanya tidak lagi jadi dasar gerbang.

## Antarmuka

### Operasi — halaman Jaminan Makloon

Form input bertambah **Bentuk jaminan** (teks bebas).

Tabel Pantauan Makloon: tambah **Bentuk Jaminan**, **Berlaku** (`13-15 Agu 2026`),
**Tunggakan** (`6.000 / 9.000 kg`), dan tanda peringatan bila ada gabah menunggak lebih lama
daripada `batas_hari`. Kolom **Batas Total** dibuang, digantikan Tunggakan.

### Makloon — panel read-only

Di atas form tahap Makloon (TJP) dan Makloon Terima (MPP):

```
Aturan jaminan dari Operasi
Bentuk jaminan   Bank Garansi BNI No. 0012/BG/2026
Berlaku          13 - 15 Agu 2026
Kuota harian     3.000 kg  -  terpakai 13 Agu 2.000 kg, sisa 1.000 kg
Belum diolah UB  6.000 kg dari batas 9.000 kg

Sisa kuota harian tidak dibawa ke hari berikutnya. Kuota terbuka kembali
setiap UB Jastasma mengirim hasil olahan.
```

Angka "terpakai/sisa" mengikuti **tanggal bongkar yang sedang diketik**, jadi bergerak saat
makloon mengubah tanggal.

Endpoint baru `GET /api/jaminan-saya?tanggal=YYYY-MM-DD`, role `makloon` dan `admin`. Hanya
mengembalikan jaminan milik pemanggil; tidak menerima `makloon_user_id` supaya tidak menjadi
jalan keluar baru dari isolasi makloon.

## Perapihan form Makloon Terima

Blok Makloon Terima menyimpang dari empat form tahap lain. Disamakan:

| | Sebelum | Sesudah |
|---|---|---|
| Letak tulisan kuning | di bawah, dekat tombol | **di atas form** |
| Label tombol draft | "Simpan draft" | **"Simpan"** |
| Gaya tombol draft | `btn btn-outline` | `btn btn-ghost border border-border bg-white` |
| Draft memunculkan peringatan | ya | **tidak pernah** |

## Migrasi

`2026_08_13_120000_tambah_bentuk_jaminan_makloon`: tambah `bentuk_jaminan` `string(200)`
nullable. `down()` membuangnya.

`berlaku_mulai` **tidak disimpan** — tanggal berlaku dihitung dari `updated_at` baris jaminan
(tanggal Operasi terakhir menyimpan) + `batas_hari`. Satu sumber kebenaran, tidak bisa
melenceng dari isian Operasi.

## Pengujian

- draft tetap bisa disimpan walau jaminan belum diatur *(tetap)*
- kirim ditolak kalau jaminan belum diatur *(tetap)*
- kuota harian: penuh menolak, pas kuota lolos
- sisa kuota **tidak menggulung**: hari ini terpakai 2.000 dari 3.000, besok tetap maksimal 3.000
- plafon tunggakan: tertahan saat tunggakan melewati plafon
- LHPK berstatus `menunggu_review` **sudah** membuka kuota (tidak perlu `diterima`)
- LHPK `draft`/`ditolak` **tidak** membuka kuota
- toleransi 10% melonggarkan, tidak memperketat
- `GET /api/jaminan-saya` hanya mengembalikan milik pemanggil

## Keputusan yang diambil

- **Tanggal bongkar, bukan tanggal input**, sebagai patokan kuota harian — supaya menunda
  input tidak memindahkan beban kuota.
- **Tanggal berlaku tidak menggerbang apa pun.** Perannya koordinasi: makloon tahu aturan
  mana yang sedang dipakai. `batas_hari` bekerja sebagai pengali plafon.
- **Plafon berbasis tunggakan, bukan kalender.** Menunggu ganti hari tidak membuka kuota;
  yang membukanya hanya UB mengirim hasil olahan.
- **Toleransi 10% satu arah** (melonggarkan). Selisih timbang bisa ke atas atau ke bawah, dan
  toleransi yang memperketat akan menahan makloon yang justru tertib.
