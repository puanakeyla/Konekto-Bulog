# Rekap Terkunci, Filter Kolom, dan Merge No. PO — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Membuat tiga halaman rekap hanya memuat data yang sudah terkunci, tanpa kolom status, terurut deterministik, dapat disaring per kolom, dengan No. PO tampil sebagai sel gabungan — dan ekspor CSV mengikuti hasil saringan.

**Architecture:** Filter terkunci dan pengurutan Rekap Transaksi dikerjakan di backend karena endpointnya dipaginasi. Filter per kolom dan sel gabungan dikerjakan di `DataSpreadsheet` sebagai kemampuan generik, dikendalikan lewat tipe `SheetColumn`, sehingga ketiga halaman rekap memakainya tanpa kode khusus. Rekap Operasi dan Rekap Gudang menyaring baris di frontend karena endpoint `/api/operasi` dipakai bersama halaman input.

**Tech Stack:** Laravel 12 + PHPUnit (backend, test pakai SQLite in-memory lewat `.env.testing`), React 19 + TypeScript + TanStack Query + Tailwind 4 (frontend, tanpa test runner).

**Spec:** `docs/superpowers/specs/2026-07-19-rekap-terkunci-filter-merge-design.md`

## Global Constraints

- **JANGAN pernah menjalankan `git add` atau `git commit`.** Pemilik repo melakukan staging dan commit sendiri, selalu. Setiap task berakhir dengan verifikasi, bukan commit.
- Terkunci berarti `status = 'diterima'` (tahap per transaksi) atau `review_status = 'diterima'` (tahap level PO). Jangan memperkenalkan kolom atau konsep status baru.
- Backend test dijalankan dari direktori `backend/` dengan `php artisan test`. MySQL tidak tersentuh karena `.env.testing` memakai SQLite in-memory.
- Frontend tidak punya test runner. Verifikasi frontend selalu: `npm run build` (menjalankan `tsc -b`) dan `npm run lint` (oxlint), dijalankan dari direktori `frontend/`.
- Komentar kode ditulis dalam Bahasa Indonesia, mengikuti gaya berkas di sekitarnya.
- `DataSpreadsheet` harus tetap generik — dilarang menaruh logika khusus Rekap Transaksi (PO, skema, terkunci) di dalamnya.

---

## File Structure

**Backend:**
- Modify: `backend/app/Http/Controllers/Api/TransaksiController.php` — `rekap()` mendapat filter terkunci per role + pengurutan skema → No. PO → ID.
- Create: `backend/tests/Feature/Transaksi/RekapTerkunciTest.php` — filter terkunci per role dan pengurutan.

**Frontend:**
- Modify: `frontend/src/components/DataSpreadsheet.tsx` — tambah `filterable` dan `mergeKey` pada `SheetColumn`, bar filter, dan `rowSpan`.
- Modify: `frontend/src/pages/RekapTransaksiPage.tsx` — hapus kolom status, tandai kolom filter, merge No. PO, ganti kartu statistik.
- Modify: `frontend/src/pages/OperasiRekapPage.tsx` — hapus kolom status, saring baris, tandai kolom filter.
- Modify: `frontend/src/pages/GudangRekapPage.tsx` — tandai kolom filter.

Tidak ada berkas baru di frontend. `DataSpreadsheet.tsx` akan tumbuh dari ~117 menjadi ~230 baris; masih satu tanggung jawab (menampilkan tabel data yang bisa disaring dan diekspor), jadi belum perlu dipecah.

---

### Task 1: Backend — filter terkunci per role di `rekap()`

**Files:**
- Modify: `backend/app/Http/Controllers/Api/TransaksiController.php:47-68`
- Test: `backend/tests/Feature/Transaksi/RekapTerkunciTest.php` (create)

**Interfaces:**
- Consumes: `App\Services\Transaksi\TransaksiStageService` (`createTransaksi`, `submitStage`, `terima`), relasi `Transaksi::dataJemputPangan/dataMakloonTjp/dataMakloonMpp/dataUbJastasma/poDetail`, `PoDetail::dataPengadaan`, `DataPengadaan::dataKeuangan`.
- Produces: `private function terapkanFilterTerkunci(Builder $query, string $role): void` di `TransaksiController` — dipakai lagi oleh Task 2 tanpa perubahan.

- [ ] **Step 1: Tulis test yang gagal**

Buat `backend/tests/Feature/Transaksi/RekapTerkunciTest.php`:

```php
<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RekapTerkunciTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $jemputPangan;

    private User $makloon;

    private User $ubJastasma;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->makloon = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
    }

    public function test_jemput_pangan_hanya_melihat_transaksi_yang_tahap_jp_sudah_terkunci(): void
    {
        $terkunci = $this->buatTjpDenganJpTerkunci();
        $belumTerkunci = $this->stageService->createTransaksi($this->jemputPangan);

        Sanctum::actingAs($this->jemputPangan);

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($terkunci->id_transaksi, $ids);
        $this->assertNotContains($belumTerkunci->id_transaksi, $ids);
    }

    public function test_makloon_hanya_melihat_transaksi_yang_tahap_makloon_sudah_terkunci(): void
    {
        // TJP: JP terkunci tapi Makloon belum -> tidak boleh muncul untuk role makloon.
        $makloonBelum = $this->buatTjpDenganJpTerkunci();

        // MPP: Makloon sudah terkunci -> harus muncul.
        $makloonSudah = $this->buatMppDenganMakloonTerkunci();

        Sanctum::actingAs($this->makloon);

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($makloonSudah->id_transaksi, $ids);
        $this->assertNotContains($makloonBelum->id_transaksi, $ids);
    }

    public function test_admin_melihat_transaksi_yang_tahap_awalnya_sudah_terkunci(): void
    {
        $tjpTerkunci = $this->buatTjpDenganJpTerkunci();
        $mppTerkunci = $this->buatMppDenganMakloonTerkunci();
        $belumApaApa = $this->stageService->createTransaksi($this->jemputPangan);

        Sanctum::actingAs($this->buatUser('admin'));

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($tjpTerkunci->id_transaksi, $ids);
        $this->assertContains($mppTerkunci->id_transaksi, $ids);
        $this->assertNotContains($belumApaApa->id_transaksi, $ids);
    }

    /** TJP dengan tahap Jemput Pangan sudah diterima Makloon (= terkunci). */
    private function buatTjpDenganJpTerkunci(): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-'.uniqid(),
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 XYZ',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => '2026-07-09',
            'kuantum' => 100,
            'jarak_ke_makloon_km' => 5,
        ]);

        $this->stageService->terima($transaksi->fresh(), $this->makloon);

        return $transaksi->fresh();
    }

    /** MPP dengan tahap Makloon sudah diterima UB Jastasma (= terkunci). */
    private function buatMppDenganMakloonTerkunci(): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->makloon);

        $this->stageService->submitStage($transaksi, $this->makloon, 'makloon', DataMakloonMpp::class, [
            'id_pemasok' => 'PEMASOK-'.uniqid(),
            'supir' => 'Supir',
            'plat_mobil' => 'B 2 ABC',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => '2026-07-10',
            'kuantum' => 200,
            'jarak_ke_makloon_km' => 7,
        ]);

        $this->stageService->terima($transaksi->fresh(), $this->ubJastasma);

        return $transaksi->fresh();
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }
}
```

Catatan: `DataMakloonTjp` dan `Transaksi` di-`use` untuk dipakai Task 2; kalau oxlint/PHPStan mengeluh unused di tahap ini, biarkan — Task 2 memakainya.

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

Jalankan dari direktori `backend/`:

```
php artisan test --filter=RekapTerkunciTest
```

Harapan: FAIL. Test `test_jemput_pangan_...` gagal pada `assertNotContains` karena `rekap()` belum menyaring apa pun, sehingga transaksi yang belum terkunci ikut terbawa.

- [ ] **Step 3: Implementasi filter terkunci**

Di `backend/app/Http/Controllers/Api/TransaksiController.php`, tambahkan `use Illuminate\Database\Eloquent\Builder;` pada daftar import, lalu ganti isi `rekap()` dan tambahkan method privat baru:

```php
    public function rekap(Request $request)
    {
        $role = $request->user()->role->nama_role;

        $query = Transaksi::with([
            'dataJemputPangan.makloon',
            'dataMakloonMpp',
            'dataMakloonTjp',
            'dataUbJastasma',
            'poDetail.dataPengadaan.dataKeuangan',
            'creator',
        ])->orderByDesc('created_at');

        // Role Jemput Pangan hanya relevan dengan skema TJP (MPP tidak punya tahap JP).
        if ($role === 'jemput_pangan') {
            $query->where('skema', 'TJP');
        }

        $this->terapkanFilterTerkunci($query, $role);

        $transaksi = $query->paginate($request->integer('per_page', 100));

        return TransaksiResource::collection($transaksi);
    }

    /**
     * Hanya data terkunci yang boleh masuk rekap. "Terkunci" = sudah disimpan dan sudah
     * diterima role berikutnya, sehingga tidak bisa diubah lagi kecuali oleh admin —
     * persis kondisi yang ditolak TransaksiStageService::submitStage().
     *
     * Tahap per transaksi memakai kolom `status`; tahap level PO (pengadaan/keuangan)
     * memakai `review_status` karena datanya milik PO gabungan, bukan satu transaksi.
     * Admin memakai aturan paling longgar (tahap awal saja) karena justru admin yang
     * bertugas memperbaiki transaksi bermasalah di tahap-tahap lanjut.
     */
    private function terapkanFilterTerkunci(Builder $query, string $role): void
    {
        match ($role) {
            'jemput_pangan' => $query->whereHas('dataJemputPangan',
                fn (Builder $q) => $q->where('status', 'diterima')),
            'ub_jastasma' => $query->whereHas('dataUbJastasma',
                fn (Builder $q) => $q->where('status', 'diterima')),
            'makloon' => $query->where(function (Builder $q) {
                $q->where(fn (Builder $t) => $t->where('skema', 'TJP')
                    ->whereHas('dataMakloonTjp', fn (Builder $m) => $m->where('status', 'diterima')))
                    ->orWhere(fn (Builder $t) => $t->where('skema', 'MPP')
                        ->whereHas('dataMakloonMpp', fn (Builder $m) => $m->where('status', 'diterima')));
            }),
            'pengadaan' => $query->whereHas('poDetail.dataPengadaan',
                fn (Builder $q) => $q->where('review_status', 'diterima')),
            'keuangan' => $query->whereHas('poDetail.dataPengadaan.dataKeuangan',
                fn (Builder $q) => $q->where('review_status', 'diterima')),
            // Tahap awal: Jemput Pangan untuk TJP, Makloon untuk MPP (lihat TransaksiStages::sequence()).
            'admin' => $query->where(function (Builder $q) {
                $q->where(fn (Builder $t) => $t->where('skema', 'TJP')
                    ->whereHas('dataJemputPangan', fn (Builder $m) => $m->where('status', 'diterima')))
                    ->orWhere(fn (Builder $t) => $t->where('skema', 'MPP')
                        ->whereHas('dataMakloonMpp', fn (Builder $m) => $m->where('status', 'diterima')));
            }),
            default => null,
        };
    }
```

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

```
php artisan test --filter=RekapTerkunciTest
```

Harapan: PASS, 3 test.

- [ ] **Step 5: Pastikan tidak ada regresi**

```
php artisan test
```

Harapan: seluruh test suite PASS. Bila ada test lama yang memanggil `/api/transaksi/rekap` dan kini kosong karena datanya belum terkunci, itu bukan bug — perbarui test tersebut agar mengunci tahapnya lebih dulu memakai pola `terima()` seperti di helper Step 1.

**JANGAN commit.** Laporkan hasilnya ke pemilik repo.

---

### Task 2: Backend — urutan skema → No. PO → ID transaksi

**Files:**
- Modify: `backend/app/Http/Controllers/Api/TransaksiController.php` (method `rekap()`)
- Test: `backend/tests/Feature/Transaksi/RekapTerkunciTest.php` (tambah satu test)

**Interfaces:**
- Consumes: `terapkanFilterTerkunci()` dari Task 1 (tidak berubah), model `DataPengadaan`, `PoDetail`.
- Produces: respons `/api/transaksi/rekap` terurut `skema` ASC → `no_po` ASC (NULL terakhir per blok skema) → `id_transaksi` ASC. Frontend Task 5 mengandalkan urutan ini agar sel gabungan No. PO berdampingan.

- [ ] **Step 1: Tulis test yang gagal**

Tambahkan import berikut di `RekapTerkunciTest.php` bila belum ada:

```php
use App\Models\DataPengadaan;
use App\Models\PoDetail;
```

Lalu tambahkan test ini di dalam kelas:

```php
    public function test_urutan_rekap_adalah_skema_lalu_no_po_lalu_id_transaksi(): void
    {
        // Tiga TJP dan satu MPP, semuanya terkunci di tahap awal supaya lolos filter admin.
        $tjpA = $this->buatTjpDenganJpTerkunci();
        $tjpB = $this->buatTjpDenganJpTerkunci();
        $tjpTanpaPo = $this->buatTjpDenganJpTerkunci();
        $mpp = $this->buatMppDenganMakloonTerkunci();

        // tjpB sengaja diberi PO bernomor lebih kecil daripada tjpA supaya urutan PO
        // benar-benar diuji, bukan kebetulan sama dengan urutan pembuatan.
        $this->pasangPo('PO-001', [$tjpB->id_transaksi]);
        $this->pasangPo('PO-002', [$tjpA->id_transaksi]);
        $this->pasangPo('PO-003', [$mpp->id_transaksi]);

        Sanctum::actingAs($this->buatUser('admin'));

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertSame([
            $tjpB->id_transaksi,      // TJP, PO-001
            $tjpA->id_transaksi,      // TJP, PO-002
            $tjpTanpaPo->id_transaksi, // TJP, tanpa PO -> akhir blok TJP
            $mpp->id_transaksi,       // MPP, PO-003
        ], $ids);
    }

    /**
     * Buat PO minimal lalu kaitkan transaksi-transaksi ke dalamnya lewat po_detail.
     * `$reviewStatus` mengendalikan apakah tahap Pengadaan dianggap terkunci.
     */
    private function pasangPo(string $noPo, array $transaksiIds, string $reviewStatus = 'menunggu_review'): DataPengadaan
    {
        $dataPengadaan = DataPengadaan::create([
            'tanggal_bongkar' => '2026-07-10',
            'id_pemasok' => 'PEMASOK-PO',
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => '100.00',
            'harga' => '6500.00',
            'total_harga' => '650000.00',
            'no_po' => $noPo,
            'status' => 'proses',
            'review_status' => $reviewStatus,
        ]);

        foreach ($transaksiIds as $id) {
            PoDetail::create([
                'data_pengadaan_id' => $dataPengadaan->id,
                'transaksi_id' => $id,
                'kuantum_kontribusi' => '100.00',
            ]);
        }

        return $dataPengadaan;
    }
```

Tambahkan juga test untuk dua role yang tahapnya beroperasi di level PO. Keduanya memakai `review_status`, bukan `status`, sehingga perlu diuji terpisah dari role per-transaksi di Task 1. Tambahkan import `use App\Models\DataKeuangan;` lalu test berikut:

```php
    public function test_pengadaan_hanya_melihat_transaksi_yang_po_nya_sudah_diterima_keuangan(): void
    {
        $poDiterima = $this->buatTjpDenganJpTerkunci();
        $poMenunggu = $this->buatTjpDenganJpTerkunci();
        $tanpaPo = $this->buatTjpDenganJpTerkunci();

        $this->pasangPo('PO-100', [$poDiterima->id_transaksi], 'diterima');
        $this->pasangPo('PO-200', [$poMenunggu->id_transaksi], 'menunggu_review');

        Sanctum::actingAs($this->buatUser('pengadaan'));

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($poDiterima->id_transaksi, $ids);
        $this->assertNotContains($poMenunggu->id_transaksi, $ids);
        $this->assertNotContains($tanpaPo->id_transaksi, $ids);
    }

    public function test_keuangan_hanya_melihat_transaksi_yang_pembayarannya_sudah_diterima_operasi(): void
    {
        $bayarDiterima = $this->buatTjpDenganJpTerkunci();
        $bayarMenunggu = $this->buatTjpDenganJpTerkunci();

        $poDiterima = $this->pasangPo('PO-300', [$bayarDiterima->id_transaksi], 'diterima');
        $poMenunggu = $this->pasangPo('PO-400', [$bayarMenunggu->id_transaksi], 'diterima');

        DataKeuangan::create([
            'data_pengadaan_id' => $poDiterima->id,
            'status_bayar' => 'dibayarkan',
            'tanggal_bayar' => '2026-07-15',
            'review_status' => 'diterima',
        ]);
        DataKeuangan::create([
            'data_pengadaan_id' => $poMenunggu->id,
            'status_bayar' => 'dibayarkan',
            'tanggal_bayar' => '2026-07-15',
            'review_status' => 'menunggu_review',
        ]);

        Sanctum::actingAs($this->buatUser('keuangan'));

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($bayarDiterima->id_transaksi, $ids);
        $this->assertNotContains($bayarMenunggu->id_transaksi, $ids);
    }
```

Kedua test ini menguji kode yang sudah ditulis di Task 1; ia diletakkan di sini karena membutuhkan helper `pasangPo`. Bila keduanya langsung lulus tanpa perubahan kode, itu wajar dan benar.

- [ ] **Step 2: Jalankan test untuk memastikan gagal**

```
php artisan test --filter=test_urutan_rekap_adalah_skema_lalu_no_po_lalu_id_transaksi
```

Harapan: FAIL pada `assertSame` — urutan yang diterima masih `created_at` menurun, jadi MPP muncul lebih dulu dan TJP terbalik.

- [ ] **Step 3: Implementasi pengurutan**

Di `TransaksiController.php`, tambahkan `use App\Models\DataPengadaan;` pada daftar import, lalu ganti pembangunan `$query` di dalam `rekap()` (bagian `Transaksi::with([...])->orderByDesc('created_at')`) menjadi:

```php
        // No. PO transaksi ini (lewat po_detail). Dipakai sebagai kunci urut supaya
        // baris-baris satu PO berdampingan — prasyarat sel gabungan di tabel frontend.
        $noPo = DataPengadaan::query()
            ->select('data_pengadaan.no_po')
            ->join('po_detail', 'po_detail.data_pengadaan_id', '=', 'data_pengadaan.id')
            ->whereColumn('po_detail.transaksi_id', 'transaksi.id_transaksi')
            ->limit(1);

        $query = Transaksi::query()
            ->select('transaksi.*')
            ->selectSub($noPo, 'urut_no_po')
            ->with([
                'dataJemputPangan.makloon',
                'dataMakloonMpp',
                'dataMakloonTjp',
                'dataUbJastasma',
                'poDetail.dataPengadaan.dataKeuangan',
                'creator',
            ])
            // JANGAN pakai orderBy('skema') biasa: kolomnya enum('TJP','MPP'), dan MySQL
            // mengurutkan enum berdasarkan indeks deklarasi (TJP, MPP) sementara Laravel
            // merender enum sebagai teks di SQLite sehingga urut alfabetis (MPP, TJP) —
            // dev dan test akan berbeda hasil. CASE membuat urutannya eksplisit.
            ->orderByRaw("CASE skema WHEN 'TJP' THEN 0 WHEN 'MPP' THEN 1 ELSE 2 END")
            // Transaksi tanpa PO ditaruh di akhir tiap blok skema; kalau tersebar di tengah,
            // blok sel gabungan di frontend akan terpotong. Ekspresi `IS NULL` menghasilkan
            // 0/1 baik di MySQL (dev) maupun SQLite (test).
            ->orderByRaw('urut_no_po IS NULL')
            ->orderBy('urut_no_po')
            ->orderBy('id_transaksi');
```

Kolom bantu `urut_no_po` tidak bocor ke respons karena `TransaksiResource` memetakan field secara eksplisit.

- [ ] **Step 4: Jalankan test untuk memastikan lulus**

```
php artisan test --filter=RekapTerkunciTest
```

Harapan: PASS, 6 test.

- [ ] **Step 5: Pastikan tidak ada regresi**

```
php artisan test
```

Harapan: seluruh suite PASS. Perhatikan khusus `FieldVisibilityTest` — ia memanggil endpoint rekap dan bisa terpengaruh perubahan `select`.

**JANGAN commit.** Laporkan hasilnya.

---

### Task 3: Frontend — filter per kolom di `DataSpreadsheet`

**Files:**
- Modify: `frontend/src/components/DataSpreadsheet.tsx`

**Interfaces:**
- Consumes: `ExportColumn<T>` dan `downloadCsv` dari `frontend/src/lib/exportCsv.ts` (tidak berubah).
- Produces: `SheetColumn<T>` bertambah field opsional `filterable?: boolean`. Task 5, 6, dan 7 memakainya. Daftar baris hasil saring bernama `filtered` dan tetap menjadi satu-satunya sumber untuk render tabel maupun ekspor CSV.

- [ ] **Step 1: Tambahkan `filterable` pada tipe kolom**

Di `frontend/src/components/DataSpreadsheet.tsx`, ubah `SheetColumn`:

```tsx
export type SheetColumn<T> = ExportColumn<T> & {
  /** Tampilan sel di layar; default memakai `value`. */
  render?: (row: T) => React.ReactNode
  align?: 'left' | 'right'
  /** Ikut dicari saat user mengetik di kotak pencarian. */
  searchable?: boolean
  /** Beri dropdown filter berisi nilai unik kolom ini. */
  filterable?: boolean
}
```

- [ ] **Step 2: Tambahkan state dan logika penyaringan**

Ganti blok `const [q, setQ] = useState('')` beserta `const filtered = useMemo(...)` yang sekarang dengan:

```tsx
  const [q, setQ] = useState('')
  // key kolom -> daftar nilai yang dipilih. Kolom tanpa entri berarti tidak difilter.
  const [filters, setFilters] = useState<Record<string, string[]>>({})

  const kolomFilter = useMemo(() => columns.filter((c) => c.filterable), [columns])

  /** Nilai unik per kolom filter, diambil dari data mentah supaya pilihan tidak ikut menyusut. */
  const opsiFilter = useMemo(() => {
    const hasil: Record<string, string[]> = {}
    for (const c of kolomFilter) {
      const nilai = new Set<string>()
      for (const row of rows) {
        const v = c.value(row)
        if (v !== null && v !== undefined && v !== '') nilai.add(String(v))
      }
      hasil[c.key] = [...nilai].sort((a, b) => a.localeCompare(b, 'id-ID'))
    }
    return hasil
  }, [rows, kolomFilter])

  const filtered = useMemo(() => {
    const key = q.trim().toLowerCase()
    const cariCols = columns.filter((c) => c.searchable !== false)
    const aktif = Object.entries(filters).filter(([, v]) => v.length > 0)

    return rows.filter((row) => {
      // Filter kolom digabung dengan AND antar kolom, OR antar nilai dalam satu kolom.
      for (const [colKey, dipilih] of aktif) {
        const col = columns.find((c) => c.key === colKey)
        if (!col) continue
        if (!dipilih.includes(String(col.value(row) ?? ''))) return false
      }
      if (!key) return true
      return cariCols.some((c) => String(c.value(row) ?? '').toLowerCase().includes(key))
    })
  }, [rows, columns, q, filters])

  function toggleFilter(colKey: string, nilai: string) {
    setFilters((prev) => {
      const sekarang = prev[colKey] ?? []
      const berikutnya = sekarang.includes(nilai)
        ? sekarang.filter((v) => v !== nilai)
        : [...sekarang, nilai]
      return { ...prev, [colKey]: berikutnya }
    })
  }

  const adaFilterAktif = Object.values(filters).some((v) => v.length > 0)
```

**Koreksi terhadap kode di atas (ditemukan saat review Task 3).** Kode itu punya
bug: `filters` tidak pernah direkonsiliasi dengan `opsiFilter`. Bila `rows`
berubah dan nilai yang sedang dipilih hilang dari data baru, centangnya lenyap
dari dropdown tapi filternya tetap berlaku — tabel menyusut atau kosong, badge
tetap berhitung, dan tak ada centang yang tampak.

Perbaikannya **diturunkan, bukan disinkronkan**: tambahkan memo `efektifFilters`
yang mengiriskan tiap pilihan tersimpan dengan nilai yang benar-benar ada di
`opsiFilter`, lalu pakai satu nilai turunan itu untuk ketiga konsumennya —
predikat penyaring baris, angka pada badge `<summary>`, dan `adaFilterAktif`.
State `filters` sendiri tidak boleh disentuh, supaya nilai yang muncul kembali
di refetch berikutnya otomatis aktif lagi. **Jangan** memakai `useEffect` yang
memangkas `filters`.

Penting: kolom yang irisannya kosong harus jatuh dari daftar filter aktif
(`.filter(([, v]) => v.length > 0)`), sehingga irisan kosong berarti "kolom ini
tidak disaring", bukan "tidak ada yang cocok". Terbalik di sini akan
mengosongkan tabel.

- [ ] **Step 3: Render bar filter**

Sisipkan blok berikut tepat setelah `</div>` penutup baris toolbar (yang berisi kotak pencarian dan tombol Ekspor CSV), sebelum `{isLoading && ...}`:

```tsx
      {kolomFilter.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {kolomFilter.map((c) => {
            const dipilih = filters[c.key] ?? []
            return (
              <details key={c.key} className="relative">
                <summary className="cursor-pointer list-none rounded-lg border border-border bg-white px-3 py-1.5 text-xs font-semibold text-primary-dark hover:bg-primary-tint/40">
                  {c.label}
                  {dipilih.length > 0 && ` (${dipilih.length})`}
                </summary>
                <div className="absolute z-20 mt-1 max-h-64 w-56 overflow-auto rounded-lg border border-border bg-white p-2 shadow-lg">
                  {opsiFilter[c.key]?.length === 0 && (
                    <div className="px-2 py-1 text-xs text-muted">Tidak ada nilai</div>
                  )}
                  {opsiFilter[c.key]?.map((nilai) => (
                    <label key={nilai} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-xs hover:bg-primary-tint/40">
                      <input
                        type="checkbox"
                        checked={dipilih.includes(nilai)}
                        onChange={() => toggleFilter(c.key, nilai)}
                      />
                      <span className="truncate">{nilai}</span>
                    </label>
                  ))}
                </div>
              </details>
            )
          })}

          {adaFilterAktif && (
            <button
              type="button"
              onClick={() => setFilters({})}
              className="rounded-lg px-2 py-1 text-xs font-semibold text-muted underline hover:text-primary-dark"
            >
              Bersihkan filter
            </button>
          )}
        </div>
      )}
```

- [ ] **Step 4: Perbarui pesan kosong agar menyebut filter**

Ganti dua baris di dalam blok `empty-state`:

```tsx
          <div className="empty-title">{rows.length === 0 ? emptyTitle : 'Tidak ada baris yang cocok'}</div>
          <p className="empty-copy">
            {rows.length === 0 ? emptyCopy : 'Coba kata kunci lain, atau longgarkan filter kolom.'}
          </p>
```

- [ ] **Step 5: Verifikasi**

Jalankan dari direktori `frontend/`:

```
npm run build
npm run lint
```

Harapan: `npm run build` selesai tanpa error TypeScript, `npm run lint` bersih.

Tombol Ekspor CSV sudah memakai `filtered` ([DataSpreadsheet.tsx:61](../../frontend/src/components/DataSpreadsheet.tsx)), jadi hasil filter otomatis ikut ter-download — tidak ada perubahan yang diperlukan di sana. Konfirmasi dengan membaca ulang baris `onClick={() => downloadCsv(namaFile, filtered, columns)}` bahwa argumennya memang `filtered`, bukan `rows`.

**JANGAN commit.**

---

### Task 4: Frontend — sel gabungan (`rowSpan`) di `DataSpreadsheet`

**Files:**
- Modify: `frontend/src/components/DataSpreadsheet.tsx`

**Interfaces:**
- Consumes: `filtered` dari Task 3.
- Produces: `SheetColumn<T>` bertambah field opsional `mergeKey?: (row: T) => string | null`. Task 5 memakainya pada kolom No. PO.

- [ ] **Step 1: Tambahkan `mergeKey` pada tipe kolom**

Tambahkan field ini ke `SheetColumn` (setelah `filterable`):

```tsx
  /**
   * Bila diisi, sel kolom ini digabung vertikal selama baris berurutan menghasilkan
   * kunci yang sama. Baris bernilai null tidak pernah digabung.
   */
  mergeKey?: (row: T) => string | null
```

- [ ] **Step 2: Hitung rowSpan per kolom**

Tambahkan helper ini di luar komponen, tepat di bawah definisi tipe `Props`:

```tsx
/**
 * Berapa baris yang harus digabung mulai dari tiap indeks. Nilai 0 berarti sel itu
 * sudah tertutup rowSpan baris di atasnya dan tidak boleh dirender sama sekali.
 * Dihitung dari daftar yang SUDAH tersaring, supaya sel gabungan ikut menyusut saat
 * sebagian barisnya terfilter dan tidak meninggalkan rowSpan menggantung.
 */
function hitungRowSpan<T>(rows: T[], mergeKey: (row: T) => string | null): number[] {
  const spans = new Array<number>(rows.length).fill(0)
  let i = 0
  while (i < rows.length) {
    const kunci = mergeKey(rows[i])
    if (kunci === null || kunci === '') {
      spans[i] = 1
      i += 1
      continue
    }
    let j = i + 1
    while (j < rows.length && mergeKey(rows[j]) === kunci) j += 1
    spans[i] = j - i
    i = j
  }
  return spans
}
```

Lalu di dalam komponen, setelah `const filtered = useMemo(...)`, tambahkan:

```tsx
  // key kolom -> rowSpan per baris, hanya untuk kolom yang punya mergeKey.
  const rowSpans = useMemo(() => {
    const hasil: Record<string, number[]> = {}
    for (const c of columns) {
      if (c.mergeKey) hasil[c.key] = hitungRowSpan(filtered, c.mergeKey)
    }
    return hasil
  }, [filtered, columns])
```

- [ ] **Step 3: Terapkan rowSpan saat render sel**

Ganti blok `{columns.map((c) => (<td ...>))}` di dalam `<tbody>` menjadi:

```tsx
                  {columns.map((c) => {
                    const span = rowSpans[c.key]?.[i]
                    // span === 0: sel sudah tertutup rowSpan baris di atasnya.
                    if (span === 0) return null
                    return (
                      <td
                        key={c.key}
                        rowSpan={span && span > 1 ? span : undefined}
                        className={`border-b border-r border-border px-3 py-2 last:border-r-0 ${c.align === 'right' ? 'text-right tabular-nums' : 'text-left'} ${span && span > 1 ? 'align-middle bg-white font-semibold' : ''}`}
                      >
                        {c.render ? c.render(row) : (c.value(row) ?? '-')}
                      </td>
                    )
                  })}
```

Sel gabungan diberi `bg-white` eksplisit karena zebra striping `odd:`/`even:` ada di `<tr>` dan akan terlihat belang bila sel merentang beberapa baris.

- [ ] **Step 4: Verifikasi**

Dari direktori `frontend/`:

```
npm run build
npm run lint
```

Harapan: keduanya bersih. Belum ada perubahan tampilan yang terlihat karena belum ada kolom yang memakai `mergeKey` — itu terjadi di Task 5.

**JANGAN commit.**

---

### Task 5: Frontend — Rekap Transaksi

**Files:**
- Modify: `frontend/src/pages/RekapTransaksiPage.tsx`

**Interfaces:**
- Consumes: `filterable` (Task 3), `mergeKey` (Task 4), urutan respons dari Task 2, filter terkunci dari Task 1.
- Produces: tidak ada; ini halaman ujung.

- [ ] **Step 1: Hapus komponen dan konstanta status**

Hapus seluruh blok `STATUS_LABEL` (baris 18-22) dan komponen `StatusBadge` beserta komentarnya (baris 33-48). Hapus juga `StageStatus` dari daftar import di baris 4 sehingga menjadi:

```tsx
import { useRekapTransaksi, type RekapTransaksi } from '../hooks/useRekapTransaksi'
```

- [ ] **Step 2: Hapus kolom status dan tandai kolom filter**

Ganti `COLS_UMUM` menjadi (kolom `status` hilang, `skema` dan `makloon_nama` jadi filterable):

```tsx
const COLS_UMUM: SheetColumn<RekapTransaksi>[] = [
  { key: 'id', label: 'ID Transaksi', value: (r) => r.id_transaksi },
  { key: 'skema', label: 'Skema', value: (r) => r.skema, filterable: true },
  { key: 'tahap', label: 'Tahap Saat Ini', value: (r) => r.current_stage.replaceAll('_', ' ') },
  { key: 'dibuat', label: 'Dibuat', value: (r) => tgl(r.created_at) },
  { key: 'makloon_nama', label: 'Makloon', value: (r) => r.nama_maklon, filterable: true },
]
```

Di `COLS_JP`, hapus entri `jp_status` (baris 60) dan tandai kolom wilayah:

```tsx
  { key: 'jp_kec', label: 'JP · Kecamatan', value: (r) => r.data_jemput_pangan?.kecamatan ?? null, filterable: true },
  { key: 'jp_kab', label: 'JP · Kabupaten', value: (r) => r.data_jemput_pangan?.kabupaten ?? null, filterable: true },
```

Di `COLS_MAKLOON`, hapus seluruh entri `mk_status` (baris 74-79). Kolom wilayah Makloon (`mk_kab`, `mk_kec`) sengaja **tidak** diberi `filterable` agar bar filter tidak berisi dua pasang "Kabupaten/Kecamatan" yang membingungkan.

Di `COLS_UB`, hapus entri `ub_status` (baris 91).

Ganti `COLS_PENGADAAN` menjadi (hapus `po_status`, beri `mergeKey` dan `filterable` pada No. PO):

```tsx
const COLS_PENGADAAN: SheetColumn<RekapTransaksi>[] = [
  {
    key: 'po_no',
    label: 'Pengadaan · No. PO',
    value: (r) => r.data_pengadaan?.no_po ?? null,
    // Satu PO menaungi beberapa transaksi; sel digabung agar hubungan itu terlihat.
    // Backend sudah mengurutkan skema -> no_po -> id, jadi barisnya pasti berdampingan.
    mergeKey: (r) => r.data_pengadaan?.no_po ?? null,
    filterable: true,
  },
  { key: 'po_in', label: 'Pengadaan · No. IN', value: (r) => noIn(r) },
  { key: 'po_harga', label: 'Pengadaan · Harga/kg', value: (r) => num(r.data_pengadaan?.harga), align: 'right' },
  { key: 'po_kuantum', label: 'Pengadaan · Total Kuantum (kg)', value: (r) => num(r.data_pengadaan?.total_kuantum), align: 'right' },
  { key: 'po_total', label: 'Pengadaan · Total Harga', value: (r) => num(r.data_pengadaan?.total_harga), align: 'right' },
]
```

Ganti `COLS_KEUANGAN` menjadi (hapus `ku_bayar`):

```tsx
const COLS_KEUANGAN: SheetColumn<RekapTransaksi>[] = [
  { key: 'ku_spp', label: 'Keuangan · No. SPP', value: (r) => r.data_pengadaan?.no_spp ?? null },
  { key: 'ku_tgl', label: 'Keuangan · Tanggal Bayar', value: (r) => tgl(r.data_pengadaan?.data_keuangan?.tanggal_bayar) },
]
```

- [ ] **Step 3: Ganti kartu statistik "Tahap Anda terkunci"**

Hapus perhitungan `terkunci` (baris 153-158) — filternya sudah pindah ke backend — dan ganti dengan:

```tsx
  // Semua baris kini pasti terkunci (disaring backend), jadi kartu "terkunci" tak lagi
  // bermakna. Jumlah PO unik lebih informatif sekarang setelah kolom No. PO digabung.
  const totalPo = new Set(rows.map((r) => r.data_pengadaan?.no_po).filter(Boolean)).size
```

Lalu ganti kartu keempat di `stats-grid`:

```tsx
          <div className="stat-card"><div className="stat-label">Total PO</div><div className="stat-value">{totalPo}</div></div>
```

- [ ] **Step 4: Perbarui teks yang menyesatkan**

Badge di `toolbar-card` (baris 183) kini keliru karena tidak ada lagi kolom status. Ganti:

```tsx
            <span className="badge badge-success">Hanya menampilkan data yang sudah terkunci</span>
```

Dan pada `subtitle` di `FormHero`, ganti kalimatnya menjadi:

```tsx
        subtitle={`${judul.sub} Tabel hanya memuat data yang sudah terkunci — sudah diterima tahap berikutnya dan tidak dapat diubah lagi. Dapat dicari, disaring per kolom, dan diekspor ke CSV.`}
```

- [ ] **Step 5: Verifikasi**

Dari direktori `frontend/`:

```
npm run build
npm run lint
```

Harapan: bersih. Bila `tsc` melaporkan `StatusBadge`/`STATUS_LABEL`/`StageStatus` tidak terpakai atau tidak ditemukan, berarti ada sisa referensi yang belum dihapus di Step 1.

**JANGAN commit.**

---

### Task 6: Frontend — Rekap Operasi

**Files:**
- Modify: `frontend/src/pages/OperasiRekapPage.tsx`

**Interfaces:**
- Consumes: `filterable` (Task 3), `sudahIsiHasil` dari `frontend/src/hooks/useOperasiList.ts`.
- Produces: tidak ada.

- [ ] **Step 1: Hapus kolom status dan konstantanya**

Hapus blok `STATUS_LABEL` (baris 6-10) dan entri kolom `status` (baris 25).

**Koreksi (ditemukan saat review Task 6).** Hapus juga entri kolom
`catatan_pengembalian` ("Catatan Pengembalian"). Setelah Step 3 menyaring baris
menjadi hanya batch `dikeluarkan`, kolom itu dijamin selalu kosong: field-nya
hanya terisi saat batch berstatus `dikembalikan`, dan justru dikosongkan pada
transisi ke `dikeluarkan`. Membiarkannya berarti satu kolom hampa di layar dan
di setiap file CSV.

- [ ] **Step 2: Tandai kolom filter**

Ubah entri kolom `gudang`:

```tsx
  { key: 'gudang', label: 'Gudang Penerima', value: (r) => r.data_gudang?.nama_gudang ?? null, filterable: true },
```

- [ ] **Step 3: Saring baris agar hanya yang sudah final**

Ubah import di baris 4 menjadi:

```tsx
import { useOperasiList, sudahIsiHasil, type PermintaanOperasi } from '../hooks/useOperasiList'
```

Lalu ganti pengambilan `rows`:

```tsx
  const { data, isLoading } = useOperasiList(1, 200)
  // Hanya batch yang sudah dikeluarkan Pengadaan dan hasil produksinya sudah diisi —
  // datanya tidak berubah lagi. Disaring di frontend, bukan di OperasiController::index(),
  // karena endpoint yang sama dipakai halaman input OperasiPage.
  const rows = (data?.items ?? []).filter(sudahIsiHasil)
```

`sudahIsiHasil` sudah berarti `status_out === 'dikeluarkan' && !!no_mo`, persis kriteria yang diminta, dan sudah dipakai `GudangRekapPage` — jadi kriterianya konsisten antar halaman tanpa duplikasi logika.

- [ ] **Step 4: Sesuaikan kartu statistik dan teks**

Kartu "Total batch" kini menghitung baris yang sudah tersaring, jadi labelnya perlu jujur. Ganti:

```tsx
          <div className="stat-card"><div className="stat-label">Batch selesai</div><div className="stat-value">{rows.length}</div></div>
```

Dan ganti `subtitle` pada `FormHero`:

```tsx
        subtitle="Batch yang sudah dikeluarkan dan hasil produksinya sudah diisi. Tabel dapat dicari, disaring per kolom, dan diekspor ke CSV (Excel/Google Sheets)."
```

- [ ] **Step 5: Verifikasi**

Dari direktori `frontend/`:

```
npm run build
npm run lint
```

Harapan: bersih.

**JANGAN commit.**

---

### Task 7: Frontend — Rekap Gudang

**Files:**
- Modify: `frontend/src/pages/GudangRekapPage.tsx`

**Interfaces:**
- Consumes: `filterable` (Task 3).
- Produces: tidak ada.

- [ ] **Step 1: Tandai kolom filter**

Halaman ini sudah tidak punya kolom status dan barisnya sudah tersaring dengan benar, jadi hanya kolom filter yang ditambahkan. Ubah entri kolom `gudang`:

```tsx
  { key: 'gudang', label: 'Nama Gudang', value: (r) => r.data_gudang?.nama_gudang ?? null, filterable: true },
```

- [ ] **Step 2: Sebutkan filter di subtitle**

Ganti `subtitle` pada `FormHero`:

```tsx
        subtitle="Seluruh batch hasil produksi yang sudah diterima gudang. Tabel dapat dicari, disaring per kolom, dan diekspor ke CSV (Excel/Google Sheets)."
```

- [ ] **Step 3: Verifikasi**

Dari direktori `frontend/`:

```
npm run build
npm run lint
```

Harapan: bersih.

**JANGAN commit.**

---

### Task 8: Verifikasi menyeluruh di aplikasi berjalan

**Files:** tidak ada yang diubah — ini task verifikasi.

**Interfaces:**
- Consumes: seluruh hasil Task 1-7.
- Produces: laporan hasil pemeriksaan untuk pemilik repo.

- [ ] **Step 1: Pastikan MySQL berjalan**

MySQL di Laragon ini bukan Windows service. Bila `php artisan migrate:status` dari `backend/` gagal dengan "connection refused", jalankan di latar belakang:

```
/c/laragon/bin/mysql/mysql-8.0.30-winx64/bin/mysqld.exe --defaults-file=/c/laragon/bin/mysql/mysql-8.0.30-winx64/my.ini --standalone
```

- [ ] **Step 2: Jalankan seluruh test backend**

Dari `backend/`:

```
php artisan test
```

Harapan: seluruh suite PASS.

- [ ] **Step 3: Jalankan build dan lint frontend**

Dari `frontend/`:

```
npm run build
npm run lint
```

Harapan: keduanya bersih.

- [ ] **Step 4: Periksa di browser**

Jalankan `php artisan serve` dari `backend/` dan `npm run dev` dari `frontend/`, lalu masuk sebagai beberapa role berbeda dan periksa satu per satu:

1. **Rekap Transaksi (role makloon):** tidak ada kolom berjudul "Status" apa pun; baris yang tahap Makloon-nya belum dikunci tidak muncul; urutan TJP dulu lalu MPP, di dalamnya mengelompok per No. PO.
2. **Rekap Transaksi (role pengadaan/keuangan):** kolom No. PO tampil sebagai sel gabungan yang merentang beberapa baris; kolom Harga/kg dan Total Kuantum tetap terisi di tiap baris.
   Perhatikan khusus tampilan belangnya: zebra striping ada di `<tr>`, sedangkan sel
   gabungan dipaksa `bg-white`. Sel gabungan yang kebetulan berjangkar di baris genap
   akan tampil putih sementara sel tetangganya di baris yang sama bernuansa `surface`.
   Nilai apakah itu terlihat wajar atau justru mengganggu — kalau mengganggu, ganti
   latar sel gabungan agar mengikuti nuansa baris jangkarnya.
3. **Filter kolom:** buka dropdown Skema, pilih `TJP`; tabel menyusut dan sel gabungan No. PO ikut menyusut tanpa merusak struktur tabel. Tekan "Bersihkan filter" dan pastikan tabel kembali utuh.
4. **Ekspor CSV saat terfilter:** dengan filter Skema=TJP masih aktif, klik Ekspor CSV. Buka berkasnya dan pastikan (a) jumlah barisnya sama persis dengan yang terlihat di layar, (b) tidak ada kolom Status, (c) No. PO terisi di **tiap** baris, bukan dikosongkan pada baris lanjutan.
5. **Rekap Operasi:** kolom Status hilang; batch yang masih menunggu Pengadaan tidak muncul; filter Gudang Penerima bekerja.
6. **Rekap Gudang:** tabel tidak berubah dari sebelumnya, hanya bertambah filter Nama Gudang.

- [ ] **Step 5: Laporkan**

Laporkan hasil tiap pemeriksaan apa adanya kepada pemilik repo, termasuk yang gagal. **Jangan commit** — pemilik repo yang melakukan staging dan commit sendiri.
