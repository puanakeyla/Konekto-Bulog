# Draft Pengadaan & Keuangan + Kategori Antrean Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Memberi role Pengadaan & Keuangan kemampuan menyimpan draft, dan mengganti kategori antrean buntu `po` dengan empat kategori nyata (Perlu dicek / Perlu diisi / Perlu diperbaiki / Draft belum dikirim) yang berlaku untuk semua role.

**Architecture:** Draft dinyatakan lewat nilai enum baru `'draft'` pada kolom `review_status` yang sudah ada di `data_pengadaan` dan `data_keuangan` — tanpa kolom baru dan tanpa parameter request baru, karena sinyal "kirim" sudah ada di domainnya masing-masing (status Sergab `lengkap` untuk Pengadaan, `status_bayar='dibayarkan'` untuk Keuangan). Klasifikasi kerjaan dipusatkan ke SQL: `TransaksiController::index()` menandai tiap baris dengan hasil `KerjaanTransaksi::ekspresi()`, dan frontend berhenti mengklasifikasi ulang.

**Tech Stack:** Laravel 12 (PHP 8.4), Pest/PHPUnit, MySQL. React 19 + TypeScript + TanStack Query, Vite, `node --test` untuk test lib.

**Spec:** `docs/superpowers/specs/2026-07-31-draft-pengadaan-keuangan-design.md`

## Global Constraints

- Bahasa komentar & pesan error: **Indonesia**, mengikuti seluruh kode yang ada.
- Label kategori WAJIB persis: `Perlu dicek`, `Perlu diisi`, `Draft belum dikirim`, `Perlu diperbaiki`.
- **Jangan commit tanpa diminta** — pemilik repo melakukan stage & commit sendiri. Langkah "Commit" di tiap task berarti *laporkan siap di-commit*, bukan jalankan `git commit`.
- Baris lama **tidak** di-backfill saat migrasi.
- Urutan cabang `CASE` wajib tetap: `ditolak` → `periksa` → `draft` → `isi`.
- Test backend: `php artisan test --filter=<NamaTest>` dari `backend/`.
- Test frontend: `npm run test:lib` dan `npm run build` dari `frontend/`.

## File Structure

**Backend**
- Create: `backend/database/migrations/2026_07_31_140000_add_draft_to_review_status.php` — enum + default.
- Modify: `backend/app/Services/Pengadaan/PoGroupingService.php` — draft Pengadaan di `isiNomorIn()`.
- Modify: `backend/app/Http/Controllers/Api/PengadaanController.php` — draft Pengadaan di `update()`.
- Modify: `backend/app/Services/Pengadaan/PoLifecycleService.php` — draft Keuangan di `updatePembayaran()`.
- Modify: `backend/app/Services/Transaksi/KerjaanTransaksi.php` — hapus `po`, tambah cabang.
- Modify: `backend/app/Http/Controllers/Api/TransaksiController.php` — tandai baris.
- Modify: `backend/app/Http/Resources/TransaksiResource.php` — ekspos `kerjaan`.
- Create: `backend/tests/Feature/Pengadaan/DraftPoTest.php` — draft Pengadaan & Keuangan.
- Create: `backend/tests/Feature/Transaksi/KerjaanKategoriTest.php` — matriks kategori.

**Frontend**
- Modify: `frontend/src/lib/kerjaanTransaksi.ts` — hapus `po`, baca `row.kerjaan`.
- Modify: `frontend/src/lib/kerjaanTransaksi.test.ts` — sesuaikan.
- Modify: `frontend/src/hooks/useTransaksiList.ts` — field `kerjaan`.
- Modify: `frontend/src/components/pengadaan/PembayaranForm.tsx` — tombol Simpan.

`TransaksiDetailPage.tsx` **tidak disentuh**: `PembayaranForm` sudah dirender di sana (baris ~805,
digerbangi `showKeuanganBayar = poAccepted && !poPaid && isKeuanganRole`), jadi baris antrean
Keuangan sudah mengarah ke tempat yang bisa dikerjakan. Tombol Simpan dari Task 7 otomatis ikut
muncul di timeline maupun di halaman `/keuangan` karena komponennya sama.

---

### Task 1: Migrasi enum `review_status`

**Files:**
- Create: `backend/database/migrations/2026_07_31_140000_add_draft_to_review_status.php`

**Interfaces:**
- Consumes: —
- Produces: nilai `'draft'` sah pada `data_pengadaan.review_status` dan `data_keuangan.review_status`; default kedua kolom jadi `'draft'`.

- [ ] **Step 1: Tulis migrasi**

```php
<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Pengadaan & Keuangan sebelumnya tidak punya cara menyimpan tanpa mengirim. 'draft' memakai
 * kosakata yang sama dengan record tahap (draft/menunggu_review/diterima/ditolak) supaya tidak
 * ada dua istilah untuk satu konsep.
 *
 * Default ikut berubah: PO yang baru dibuat selama ini langsung bernilai 'menunggu_review'
 * padahal belum dikirim ke siapa pun. Baris lama sengaja TIDAK di-backfill -- yang bernilai
 * 'menunggu_review' sekarang memang benar-benar sedang menunggu direview.
 */
return new class extends Migration
{
    public function up(): void
    {
        foreach (['data_pengadaan', 'data_keuangan'] as $tabel) {
            DB::statement("ALTER TABLE {$tabel} MODIFY review_status
                ENUM('draft','menunggu_review','diterima','ditolak') NOT NULL DEFAULT 'draft'");
        }
    }

    public function down(): void
    {
        foreach (['data_pengadaan', 'data_keuangan'] as $tabel) {
            // Dipetakan lebih dulu, kalau tidak MySQL menolak baris ber-nilai 'draft'.
            DB::table($tabel)->where('review_status', 'draft')->update(['review_status' => 'menunggu_review']);

            DB::statement("ALTER TABLE {$tabel} MODIFY review_status
                ENUM('menunggu_review','diterima','ditolak') NOT NULL DEFAULT 'menunggu_review'");
        }
    }
};
```

- [ ] **Step 2: Pastikan seluruh test lama masih hijau**

Run: `php artisan test`
Expected: PASS semuanya (150 test). Migrasi enum tidak mengubah perilaku apa pun sampai Task 2.

- [ ] **Step 3: Commit**

```
Siap di-commit: backend/database/migrations/2026_07_31_140000_add_draft_to_review_status.php
Pesan usulan: "feat(po): tambah status draft ke review_status Pengadaan & Keuangan"
```

---

### Task 2: Draft Pengadaan

**Files:**
- Modify: `backend/app/Services/Pengadaan/PoGroupingService.php:283-287`
- Modify: `backend/app/Http/Controllers/Api/PengadaanController.php:117-122`
- Create: `backend/tests/Feature/Pengadaan/DraftPoTest.php`

**Interfaces:**
- Consumes: enum `'draft'` dari Task 1.
- Produces: `DataPengadaan::$review_status === 'draft'` selama status Sergab bukan `lengkap`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `backend/tests/Feature/Pengadaan/DraftPoTest.php`:

```php
<?php

namespace Tests\Feature\Pengadaan;

use App\Models\DataMakloonMpp;
use App\Models\DataPengadaan;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Pengadaan\PoLifecycleService;
use App\Services\Pengadaan\PoReviewService;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DraftPoTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private PoGroupingService $poService;

    private PoLifecycleService $lifecycleService;

    private PoReviewService $reviewService;

    private User $makloon;

    private User $ubJastasma;

    private User $pengadaan;

    private User $keuangan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->poService = app(PoGroupingService::class);
        $this->lifecycleService = app(PoLifecycleService::class);
        $this->reviewService = app(PoReviewService::class);

        $this->makloon = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
        $this->pengadaan = $this->buatUser('pengadaan');
        $this->keuangan = $this->buatUser('keuangan');
    }

    public function test_po_baru_digabung_berstatus_draft(): void
    {
        $po = $this->buatPoBelumLengkap();

        $this->assertSame('draft', $po->fresh()->review_status);
    }

    public function test_isi_nomor_in_tanpa_lengkap_tetap_draft_dan_tidak_memajukan_tahap(): void
    {
        $po = $this->buatPoBelumLengkap();
        $transaksiId = $po->poDetail->first()->transaksi_id;

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-001'],
        ], 'SPP-001', 'proses');

        $this->assertSame('draft', $po->fresh()->review_status);
        $this->assertSame('pengadaan', Transaksi::find($transaksiId)->current_stage);
    }

    public function test_status_lengkap_mengirim_dan_memajukan_ke_keuangan(): void
    {
        $po = $this->buatPoBelumLengkap();
        $transaksiId = $po->poDetail->first()->transaksi_id;

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-002'],
        ], 'SPP-002', 'lengkap');

        $this->assertSame('menunggu_review', $po->fresh()->review_status);
        $this->assertSame('keuangan', Transaksi::find($transaksiId)->current_stage);
    }

    public function test_po_ditolak_yang_disimpan_ulang_kembali_jadi_draft(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->reviewService->tolak($po->fresh(), $this->keuangan, 'Nomor IN salah.');

        $po = $po->fresh();
        $this->assertSame('ditolak', $po->review_status);

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-PERBAIKAN'],
        ], null, 'proses');

        $this->assertSame('draft', $po->fresh()->review_status);
        $this->assertSame('pengadaan', Transaksi::find($transaksiIds[0])->current_stage);
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function transaksiSampaiPengadaan(string $idPemasok, string $tanggalBongkar, float $kuantum): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->makloon);

        $this->stageService->submitStage($transaksi, $this->makloon, 'makloon', DataMakloonMpp::class, [
            'id_pemasok' => $idPemasok,
            'supir' => 'Supir',
            'plat_mobil' => 'B 1234 XYZ',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => $tanggalBongkar,
            'kuantum' => $kuantum,
            'jarak_ke_makloon_km' => 5,
        ]);

        $this->stageService->terima($transaksi->fresh(), $this->makloon);
        $this->stageService->terima($transaksi->fresh(), $this->ubJastasma);
        $this->stageService->submitStage($transaksi->fresh(), $this->ubJastasma, 'ub_jastasma', DataUbJastasma::class, [
            'ka1' => 12.5,
            'ka2' => 12.6,
            'ka3' => 12.7,
            'hampa' => 1.2,
            'butir_hijau' => 0.5,
        ]);
        $this->stageService->terima($transaksi->fresh(), $this->pengadaan);

        return $transaksi->fresh();
    }

    private function buatPoBelumLengkap(): DataPengadaan
    {
        $t1 = $this->transaksiSampaiPengadaan('PEMASOK-'.uniqid(), '2026-07-10', 100);

        return $this->poService->gabungkanPo([$t1->id_transaksi], 'PO-'.uniqid(), $this->pengadaan);
    }

    /**
     * @return array{0: DataPengadaan, 1: array<int, string>}
     */
    private function buatPoLengkap(int $jumlahBaris): array
    {
        $idPemasok = 'PEMASOK-'.uniqid();
        $transaksiIds = [];
        for ($i = 0; $i < $jumlahBaris; $i++) {
            $transaksiIds[] = $this->transaksiSampaiPengadaan($idPemasok, '2026-07-10', 100)->id_transaksi;
        }

        $po = $this->poService->gabungkanPo($transaksiIds, 'PO-'.uniqid(), $this->pengadaan);

        $items = $po->poDetail->values()->map(fn ($d, $i) => [
            'po_detail_id' => $d->id,
            'no_in' => 'IN-'.uniqid().'-'.$i,
        ])->all();

        $po = $this->poService->isiNomorIn($po, $items, 'SPP-'.uniqid(), 'lengkap');

        return [$po, $transaksiIds];
    }
}
```

> **Catatan untuk implementer:** `transaksiSampaiPengadaan()` disalin dari `PoLifecycleTest.php:193`. Kalau signature `submitStage()` untuk `ub_jastasma` di repo berbeda dari di atas, **salin persis versi dari `PoLifecycleTest.php`** — jangan mengarang field.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `php artisan test --filter=DraftPoTest`
Expected: FAIL. `test_po_baru_digabung_berstatus_draft` dan `test_isi_nomor_in_tanpa_lengkap_tetap_draft...` gagal dengan `'menunggu_review'` bukan `'draft'`.

- [ ] **Step 3: Tambah cabang draft di `PoGroupingService::isiNomorIn()`**

Di `backend/app/Services/Pengadaan/PoGroupingService.php`, blok pengiriman saat ini:

```php
            if (! $dataPengadaan->poDetail()->whereNull('no_in')->exists() && $dataPengadaan->no_spp !== null && $dataPengadaan->status === 'lengkap') {
                $this->resetReview($dataPengadaan);

                $this->majukanTahapTransaksi($dataPengadaan->id, 'keuangan');
            }
```

Ganti jadi:

```php
            if (! $dataPengadaan->poDetail()->whereNull('no_in')->exists() && $dataPengadaan->no_spp !== null && $dataPengadaan->status === 'lengkap') {
                $this->resetReview($dataPengadaan);

                $this->majukanTahapTransaksi($dataPengadaan->id, 'keuangan');
            } elseif ($dataPengadaan->review_status !== 'diterima') {
                // Belum memenuhi syarat kirim = masih draft. Termasuk PO yang tadinya 'ditolak':
                // begitu perbaikannya disimpan ia kembali jadi draft, sama seperti saveDraft()
                // pada role tahap. catatan_penolakan sengaja TIDAK dihapus supaya konteks
                // penolakannya tetap terlihat di PoInForm sampai PO dikirim ulang.
                $dataPengadaan->review_status = 'draft';
            }
```

- [ ] **Step 4: Tambah cabang draft di `PengadaanController::update()`**

Di `backend/app/Http/Controllers/Api/PengadaanController.php`, blok saat ini:

```php
            if ($dataPengadaan->status === 'lengkap') {
                $dataPengadaan->review_status = 'menunggu_review';
                $dataPengadaan->catatan_penolakan = null;
                $dataPengadaan->reviewed_by = null;
                $dataPengadaan->reviewed_at = null;
            }
```

Ganti jadi:

```php
            if ($dataPengadaan->status === 'lengkap') {
                $dataPengadaan->review_status = 'menunggu_review';
                $dataPengadaan->catatan_penolakan = null;
                $dataPengadaan->reviewed_by = null;
                $dataPengadaan->reviewed_at = null;
            } elseif ($dataPengadaan->status !== 'dibatalkan') {
                // Disimpan tapi belum lengkap = draft. PO yang sudah diterima Keuangan tidak
                // sampai ke sini -- ditahan penjaga di awal method.
                $dataPengadaan->review_status = 'draft';
            }
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `php artisan test --filter=DraftPoTest`
Expected: PASS (4 test).

- [ ] **Step 6: Pastikan test PO lama tidak rusak**

Run: `php artisan test --filter=Pengadaan`
Expected: PASS semuanya.

- [ ] **Step 7: Commit**

```
Siap di-commit: PoGroupingService.php, PengadaanController.php, tests/Feature/Pengadaan/DraftPoTest.php
Pesan usulan: "feat(pengadaan): tandai PO belum lengkap sebagai draft"
```

---

### Task 3: Draft Keuangan

**Files:**
- Modify: `backend/app/Services/Pengadaan/PoLifecycleService.php:41-47,74-80`
- Modify: `backend/tests/Feature/Pengadaan/DraftPoTest.php`

**Interfaces:**
- Consumes: enum `'draft'` (Task 1), helper `buatPoLengkap()` (Task 2).
- Produces: `DataKeuangan::$review_status === 'draft'` saat `status_bayar='belum'`.

- [ ] **Step 1: Tambah test yang gagal**

Tambahkan ke `backend/tests/Feature/Pengadaan/DraftPoTest.php`, sebelum blok `private function buatUser`:

```php
    public function test_simpan_pembayaran_belum_bayar_jadi_draft_dan_transaksi_belum_selesai(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null, 'SPP-DRAFT');

        $this->assertSame('draft', $keuangan->review_status);
        $this->assertSame('berjalan', Transaksi::find($transaksiIds[0])->status_keseluruhan);
        $this->assertSame('SPP-DRAFT', $po->fresh()->no_spp);
    }

    public function test_tandai_dibayarkan_tetap_menyelesaikan_transaksi(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', '2026-07-20', 'SPP-LUNAS');

        $this->assertSame('diterima', $keuangan->review_status);
        $this->assertSame('selesai', Transaksi::find($transaksiIds[0])->status_keseluruhan);
    }

    public function test_draft_lalu_dibayarkan_tetap_menyelesaikan_transaksi(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null, 'SPP-X');
        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', '2026-07-21', 'SPP-X');

        $this->assertSame('diterima', $keuangan->review_status);
        $this->assertSame('selesai', Transaksi::find($transaksiIds[0])->status_keseluruhan);
    }
```

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `php artisan test --filter=DraftPoTest`
Expected: FAIL pada `test_simpan_pembayaran_belum_bayar_jadi_draft...` — `review_status` masih `'menunggu_review'`.

- [ ] **Step 3: Ubah `resetReview()` jadi menulis draft**

Di `backend/app/Services/Pengadaan/PoLifecycleService.php`, method privat di bawah:

```php
    private function resetReview($record): void
    {
        $record->review_status = 'menunggu_review';
        $record->catatan_penolakan = null;
        $record->reviewed_by = null;
        $record->reviewed_at = null;
    }
```

Ganti jadi:

```php
    /**
     * Pembayaran yang disimpan tapi belum dilunasi = draft, bukan 'menunggu_review' -- Keuangan
     * adalah tahap terakhir, tidak ada siapa pun yang akan mereview baris ini. Cabang
     * 'dibayarkan' di updatePembayaran() menimpanya jadi 'diterima'.
     */
    private function resetReview($record): void
    {
        $record->review_status = 'draft';
        $record->catatan_penolakan = null;
        $record->reviewed_by = null;
        $record->reviewed_at = null;
    }
```

- [ ] **Step 4: Jalankan test, pastikan lulus**

Run: `php artisan test --filter=DraftPoTest`
Expected: PASS (7 test).

- [ ] **Step 5: Pastikan test PO lama tidak rusak**

Run: `php artisan test --filter=Pengadaan`
Expected: PASS semuanya. Kalau `PoLifecycleTest` punya assertion yang mengharapkan `'menunggu_review'` pada `data_keuangan` setelah simpan 'belum', perbarui ke `'draft'` — itu perubahan perilaku yang disengaja.

- [ ] **Step 6: Commit**

```
Siap di-commit: PoLifecycleService.php, tests/Feature/Pengadaan/DraftPoTest.php
Pesan usulan: "feat(keuangan): simpan pembayaran belum lunas sebagai draft"
```

---

### Task 4: Ekspresi kerjaan — hapus `po`, tambah cabang nyata

**Files:**
- Modify: `backend/app/Services/Transaksi/KerjaanTransaksi.php:25,48-66`

**Interfaces:**
- Consumes: `review_status='draft'` dari Task 2 & 3.
- Produces: `KerjaanTransaksi::SEMUA === ['periksa','isi','draft','ditolak']`; `ekspresi()` tidak pernah lagi menghasilkan `'po'`.

- [ ] **Step 1: Ubah `SEMUA`**

```php
    public const SEMUA = ['periksa', 'isi', 'draft', 'ditolak'];
```

- [ ] **Step 2: Ganti `ekspresi()`**

Ganti seluruh isi method `ekspresi()` jadi:

```php
    /** Ekspresi SQL yang menghasilkan salah satu dari self::SEMUA. */
    public static function ekspresi(): string
    {
        return "CASE
            WHEN kj_jp.status = 'ditolak'
              OR kj_tjp.status = 'ditolak'
              OR kj_mpp.status = 'ditolak'
              OR kj_ub.status = 'ditolak'
              OR kj_pd.review_status = 'ditolak'
              OR kj_keu.review_status = 'ditolak' THEN 'ditolak'
            WHEN (transaksi.current_stage = 'makloon' AND kj_jp.status = 'menunggu_review')
              OR (transaksi.current_stage = 'makloon_terima' AND kj_mpp.status = 'menunggu_review')
              OR (transaksi.current_stage = 'ub_jastasma' AND transaksi.skema = 'MPP' AND kj_mpp.status = 'menunggu_review')
              OR (transaksi.current_stage = 'ub_jastasma' AND transaksi.skema = 'TJP' AND kj_tjp.status = 'menunggu_review')
              OR (transaksi.current_stage = 'pengadaan' AND kj_ub.status = 'menunggu_review')
              OR (transaksi.current_stage = 'keuangan' AND kj_pd.review_status = 'menunggu_review') THEN 'periksa'
            WHEN (transaksi.current_stage = 'jemput_pangan' AND kj_jp.status = 'draft')
              OR (transaksi.current_stage = 'makloon' AND kj_tjp.status = 'draft')
              OR (transaksi.current_stage = 'makloon_kirim' AND kj_mpp.status = 'draft')
              OR (transaksi.current_stage = 'ub_jastasma' AND kj_ub.status = 'draft')
              OR (transaksi.current_stage = 'pengadaan' AND kj_pd.review_status = 'draft')
              OR (transaksi.current_stage = 'keuangan' AND kj_keu.review_status IN ('draft', 'menunggu_review')) THEN 'draft'
            ELSE 'isi'
        END";
    }
```

Perubahan dari versi lama: cabang `WHEN transaksi.current_stage IN ('pengadaan','keuangan') THEN 'po'` **dihapus**; `periksa` dapat satu baris `keuangan`; `draft` dapat dua baris (`pengadaan` + `keuangan`).

`'menunggu_review'` ikut dipetakan ke draft pada `kj_keu` demi baris `data_keuangan` lama yang terlanjur tersimpan lewat API langsung dengan `status_bayar='belum'`.

- [ ] **Step 3: Perbarui docblock kelas**

Di docblock kelas `KerjaanTransaksi`, ganti paragraf yang berbunyi *"dan Pengadaan/Keuangan dicek sebelum draft karena keduanya tidak punya baris data per transaksi"* jadi:

```
 * URUTAN CASE WAJIB: penolakan menang atas segalanya (saat ditolak transaksi dikembalikan ke
 * tahap asal sehingga kolom "menunggu review" bisa ikut terisi), lalu periksa, lalu draft.
 * Pengadaan & Keuangan tidak lagi punya kategori buntu sendiri: keduanya diklasifikasi dari
 * kondisi PO-nya (kj_pd/kj_keu) seperti role lain diklasifikasi dari record tahapnya.
```

- [ ] **Step 4: Jalankan seluruh test backend**

Run: `php artisan test`
Expected: test yang mengharapkan kategori `po` akan GAGAL. Catat namanya — diperbaiki di Task 5 setelah endpoint menandai baris. Kalau tidak ada yang gagal, lanjut.

- [ ] **Step 5: Commit**

```
Siap di-commit: KerjaanTransaksi.php
Pesan usulan: "feat(antrean): ganti kategori po dengan kategori nyata Pengadaan & Keuangan"
```

---

### Task 5: Tandai `kerjaan` per baris di `index()`

**Files:**
- Modify: `backend/app/Http/Controllers/Api/TransaksiController.php:47-66`
- Modify: `backend/app/Http/Resources/TransaksiResource.php:12-20`
- Create: `backend/tests/Feature/Transaksi/KerjaanKategoriTest.php`

**Interfaces:**
- Consumes: `KerjaanTransaksi::ekspresi()`, `joinTahap()`, `filter()` dari Task 4.
- Produces: field `kerjaan` (string, salah satu dari `KerjaanTransaksi::SEMUA`) pada tiap item response `GET /api/transaksi`.

- [ ] **Step 1: Tulis test yang gagal**

Buat `backend/tests/Feature/Transaksi/KerjaanKategoriTest.php`:

```php
<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataMakloonMpp;
use App\Models\DataPengadaan;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Pengadaan\PoLifecycleService;
use App\Services\Pengadaan\PoReviewService;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Badge tiap baris dan filter ?kerjaan= sekarang bersumber dari ekspresi SQL yang sama.
 * Test ini menguji keduanya berbarengan supaya keduanya mustahil menyimpang.
 */
class KerjaanKategoriTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private PoGroupingService $poService;

    private PoLifecycleService $lifecycleService;

    private PoReviewService $reviewService;

    private User $makloon;

    private User $ubJastasma;

    private User $pengadaan;

    private User $keuangan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->poService = app(PoGroupingService::class);
        $this->lifecycleService = app(PoLifecycleService::class);
        $this->reviewService = app(PoReviewService::class);

        $this->makloon = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
        $this->pengadaan = $this->buatUser('pengadaan');
        $this->keuangan = $this->buatUser('keuangan');
    }

    public function test_pengadaan_menunggu_review_ub_berkategori_periksa(): void
    {
        $this->transaksiSampaiPengadaan('PEMASOK-A', belumDiterima: true);

        $this->assertKerjaan($this->pengadaan, 'periksa');
    }

    public function test_pengadaan_belum_punya_po_berkategori_isi(): void
    {
        $this->transaksiSampaiPengadaan('PEMASOK-B');

        $this->assertKerjaan($this->pengadaan, 'isi');
    }

    public function test_pengadaan_dengan_po_draft_berkategori_draft(): void
    {
        $t = $this->transaksiSampaiPengadaan('PEMASOK-C');
        $this->poService->gabungkanPo([$t->id_transaksi], 'PO-'.uniqid(), $this->pengadaan);

        $this->assertKerjaan($this->pengadaan, 'draft');
    }

    public function test_keuangan_dengan_po_menunggu_review_berkategori_periksa(): void
    {
        $this->buatPoLengkap();

        $this->assertKerjaan($this->keuangan, 'periksa');
    }

    public function test_keuangan_setelah_terima_po_berkategori_isi(): void
    {
        $po = $this->buatPoLengkap();
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $this->assertKerjaan($this->keuangan, 'isi');
    }

    public function test_keuangan_dengan_pembayaran_tersimpan_berkategori_draft(): void
    {
        $po = $this->buatPoLengkap();
        $this->reviewService->terima($po->fresh(), $this->keuangan);
        $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null, 'SPP-DRAFT');

        $this->assertKerjaan($this->keuangan, 'draft');
    }

    public function test_po_ditolak_keuangan_berkategori_ditolak_di_pengadaan(): void
    {
        $po = $this->buatPoLengkap();
        $this->reviewService->tolak($po->fresh(), $this->keuangan, 'Nomor IN salah.');

        $this->assertKerjaan($this->pengadaan, 'ditolak');
    }

    public function test_filter_kerjaan_po_ditolak_karena_kategori_sudah_dihapus(): void
    {
        Sanctum::actingAs($this->pengadaan);

        $this->getJson('/api/transaksi?kerjaan=po')->assertStatus(422);
    }

    /**
     * Menguji badge (field `kerjaan` di response) DAN filter (?kerjaan=) sekaligus:
     * keduanya harus sepakat, karena keduanya berasal dari ekspresi SQL yang sama.
     */
    private function assertKerjaan(User $viewer, string $harapan): void
    {
        Sanctum::actingAs($viewer);

        $baris = $this->getJson('/api/transaksi')->assertOk()->json('data');
        $this->assertCount(1, $baris, 'Antrean role ini seharusnya berisi tepat satu transaksi.');
        $this->assertSame($harapan, $baris[0]['kerjaan']);

        $terfilter = $this->getJson("/api/transaksi?kerjaan={$harapan}")->assertOk()->json('data');
        $this->assertCount(1, $terfilter, "Filter ?kerjaan={$harapan} seharusnya memuat baris ini.");
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function transaksiSampaiPengadaan(string $idPemasok, bool $belumDiterima = false): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->makloon);

        $this->stageService->submitStage($transaksi, $this->makloon, 'makloon', DataMakloonMpp::class, [
            'id_pemasok' => $idPemasok,
            'supir' => 'Supir',
            'plat_mobil' => 'B 1234 XYZ',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => '2026-07-10',
            'kuantum' => 100,
            'jarak_ke_makloon_km' => 5,
        ]);

        $this->stageService->terima($transaksi->fresh(), $this->makloon);
        $this->stageService->terima($transaksi->fresh(), $this->ubJastasma);
        $this->stageService->submitStage($transaksi->fresh(), $this->ubJastasma, 'ub_jastasma', DataUbJastasma::class, [
            'ka1' => 12.5,
            'ka2' => 12.6,
            'ka3' => 12.7,
            'hampa' => 1.2,
            'butir_hijau' => 0.5,
        ]);

        // Tahap UB sudah dikirim tapi belum diterima Pengadaan -> kategori 'periksa' milik Pengadaan.
        if (! $belumDiterima) {
            $this->stageService->terima($transaksi->fresh(), $this->pengadaan);
        }

        return $transaksi->fresh();
    }

    private function buatPoLengkap(): DataPengadaan
    {
        $t = $this->transaksiSampaiPengadaan('PEMASOK-'.uniqid());
        $po = $this->poService->gabungkanPo([$t->id_transaksi], 'PO-'.uniqid(), $this->pengadaan);

        $items = $po->poDetail->values()->map(fn ($d, $i) => [
            'po_detail_id' => $d->id,
            'no_in' => 'IN-'.uniqid().'-'.$i,
        ])->all();

        return $this->poService->isiNomorIn($po, $items, 'SPP-'.uniqid(), 'lengkap');
    }
}
```

> **Catatan untuk implementer:** sama seperti Task 2 — kalau signature `submitStage()` di repo berbeda, salin persis dari `PoLifecycleTest.php:193`, jangan mengarang field.

- [ ] **Step 2: Jalankan test, pastikan gagal**

Run: `php artisan test --filter=KerjaanKategoriTest`
Expected: FAIL — `Undefined array key "kerjaan"`, karena response belum memuat field itu.

- [ ] **Step 3: Tandai baris di `index()`**

Di `backend/app/Http/Controllers/Api/TransaksiController.php`, pada method `index()`:

Setelah blok `$query = Transaksi::query()->...->orderBy('transaksi.id_transaksi');`, tambahkan:

```php
        // Klasifikasi kerjaan dihitung SEKALI di SQL lalu ikut tiap baris, bukan dihitung ulang
        // di browser. Frontend tidak memuat data PO, jadi dulu ia terpaksa melempar Pengadaan &
        // Keuangan ke satu kategori buntu -- sekarang badge, chip, dan filter bersumber sama.
        // joinTahap() HANYA BOLEH dipanggil sekali: alias kj_* akan bentrok kalau didaftarkan dua kali.
        $query = KerjaanTransaksi::joinTahap($query)
            ->addSelect(DB::raw(KerjaanTransaksi::ekspresi().' as kerjaan'));
```

Lalu ganti cabang filter yang lama:

```php
        if (isset($validated['kerjaan'])) {
            KerjaanTransaksi::filter(KerjaanTransaksi::joinTahap($query), $validated['kerjaan']);
        }
```

jadi:

```php
        if (isset($validated['kerjaan'])) {
            KerjaanTransaksi::filter($query, $validated['kerjaan']);
        }
```

Pastikan `use Illuminate\Support\Facades\DB;` ada di daftar import file itu (tambahkan bila belum).

- [ ] **Step 4: Ekspos `kerjaan` di resource**

Di `backend/app/Http/Resources/TransaksiResource.php`, tambahkan setelah baris `'status_keseluruhan' => $this->status_keseluruhan,`:

```php
            // Diisi hanya oleh TransaksiController::index() lewat selectRaw; endpoint lain
            // (show/rekap) tidak menghitungnya, jadi field-nya absen di sana, bukan null.
            'kerjaan' => $this->when(isset($this->kerjaan), fn () => $this->kerjaan),
```

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `php artisan test --filter=KerjaanKategoriTest`
Expected: PASS (8 test).

- [ ] **Step 6: Jalankan seluruh test backend**

Run: `php artisan test`
Expected: PASS semuanya. Kalau ada test lama yang mengharapkan `kerjaan=po`, perbarui ke kategori barunya sesuai matriks §5 spec.

- [ ] **Step 7: Commit**

```
Siap di-commit: TransaksiController.php, TransaksiResource.php, tests/Feature/Transaksi/KerjaanKategoriTest.php
Pesan usulan: "feat(antrean): tandai kategori kerjaan tiap baris dari SQL"
```

---

### Task 6: Frontend berhenti mengklasifikasi

**Files:**
- Modify: `frontend/src/hooks/useTransaksiList.ts:20-27`
- Modify: `frontend/src/lib/kerjaanTransaksi.ts`
- Modify: `frontend/src/lib/kerjaanTransaksi.test.ts`

**Interfaces:**
- Consumes: field `kerjaan` dari Task 5.
- Produces: `kerjaan(row: TransaksiListItem): Kerjaan` yang membaca `row.kerjaan`; tipe `KerjaanId` tanpa `'po'`.

- [ ] **Step 1: Tambah field `kerjaan` ke tipe baris**

Di `frontend/src/hooks/useTransaksiList.ts`, tambahkan ke `TransaksiListItem` (impor `KerjaanId` dari `../lib/kerjaanTransaksi`):

```ts
  kerjaan: KerjaanId
```

- [ ] **Step 2: Sesuaikan test lib lebih dulu**

Di `frontend/src/lib/kerjaanTransaksi.test.ts`, helper `baris()` sekarang wajib menyertakan `kerjaan`. Ubah default-nya:

```ts
function baris(patch: Partial<TransaksiListItem>): TransaksiListItem {
  return {
    id_transaksi: '00001/07/2026/TJP',
    skema: 'TJP',
    current_stage: 'jemput_pangan',
    status_keseluruhan: 'berjalan',
    kerjaan: 'isi',
    created_at: '2026-07-01T00:00:00Z',
    nama_maklon: null,
    makloon_kecamatan: null,
    makloon_kabupaten: null,
    ...patch,
  }
}
```

Ganti seluruh test yang menguji *klasifikasi* (mis. "current_stage jemput_pangan tanpa data → isi") jadi test *pemetaan presentasi*. Ganti isi file setelah helper `baris()` dengan:

```ts
test('label diambil dari kategori yang dikirim server, bukan dihitung ulang', () => {
  assert.equal(kerjaan(baris({ kerjaan: 'isi' })).label, 'Perlu diisi')
  assert.equal(kerjaan(baris({ kerjaan: 'periksa' })).label, 'Perlu dicek')
  assert.equal(kerjaan(baris({ kerjaan: 'draft' })).label, 'Draft belum dikirim')
  assert.equal(kerjaan(baris({ kerjaan: 'ditolak' })).label, 'Perlu diperbaiki')
})

test('setiap kategori punya label, keterangan, dan urutan chip', () => {
  for (const id of KERJAAN_URUT) {
    assert.ok(KERJAAN_LABEL[id], `label kosong untuk ${id}`)
    assert.ok(KERJAAN_KETERANGAN[id], `keterangan kosong untuk ${id}`)
  }
  assert.equal(KERJAAN_URUT.length, 4)
})

test('kategori po sudah dihapus', () => {
  assert.equal((KERJAAN_LABEL as Record<string, string>).po, undefined)
  assert.ok(!(KERJAAN_URUT as string[]).includes('po'))
})

test('baris ditolak menyebut tahap penolaknya di tooltip bila datanya ada', () => {
  const row = baris({
    kerjaan: 'ditolak',
    current_stage: 'jemput_pangan',
    data_jemput_pangan: { status: 'ditolak', catatan_penolakan: 'Foto buram' },
  } as Partial<TransaksiListItem>)

  assert.match(kerjaan(row).judul, /Jemput Pangan/)
})

test('baris ditolak tanpa detail tahap tetap punya tooltip yang masuk akal', () => {
  assert.equal(kerjaan(baris({ kerjaan: 'ditolak' })).judul, KERJAAN_KETERANGAN.ditolak)
})
```

Sesuaikan baris import di atas file jadi:

```ts
import { KERJAAN_KETERANGAN, KERJAAN_LABEL, KERJAAN_URUT, kerjaan } from './kerjaanTransaksi.ts'
```

- [ ] **Step 3: Jalankan test, pastikan gagal**

Run (dari `frontend/`): `npm run test:lib`
Expected: FAIL — `kerjaan()` masih mengklasifikasi sendiri dan `'po'` masih ada.

- [ ] **Step 4: Sederhanakan `kerjaanTransaksi.ts`**

Hapus `'po'` dari tipe & tabel:

```ts
export type KerjaanId = 'periksa' | 'isi' | 'draft' | 'ditolak'

export const KERJAAN_LABEL: Record<KerjaanId, string> = {
  periksa: 'Perlu dicek',
  isi: 'Perlu diisi',
  draft: 'Draft belum dikirim',
  ditolak: 'Perlu diperbaiki',
}

export const KERJAAN_KETERANGAN: Record<KerjaanId, string> = {
  periksa: 'Buka transaksinya, cek data dari tahap sebelumnya, lalu tekan Terima atau Tolak.',
  isi: 'Lengkapi data tahap Anda, lalu kirim ke tahap berikutnya.',
  draft: 'Data sudah tersimpan tapi belum dikirim. Buka lalu tekan Kirim.',
  ditolak: 'Ditolak oleh tahap berikutnya. Perbaiki datanya lalu kirim ulang.',
}

export const KERJAAN_URUT: KerjaanId[] = ['periksa', 'isi', 'draft', 'ditolak']
```

Ganti fungsi `kerjaan()` jadi pemetaan presentasi murni:

```ts
const KERJAAN_CLS: Record<KerjaanId, string> = {
  periksa: 'badge-warning',
  isi: 'badge',
  draft: 'badge',
  ditolak: 'badge-danger',
}

/**
 * Klasifikasinya SUDAH dihitung server (KerjaanTransaksi::ekspresi()) dan ikut tiap baris.
 * Dulu logika ini diduplikasi di sini, tapi endpoint daftar tidak memuat data PO sehingga
 * Pengadaan & Keuangan terpaksa dilempar ke satu kategori buntu. Fungsi ini kini hanya
 * memetakan kategori ke tampilannya -- jangan kembalikan percabangan klasifikasi ke sini.
 */
export function kerjaan(row: TransaksiListItem): Kerjaan {
  const id = row.kerjaan
  const ditolak = rejectedStages(row)

  const judul = id === 'ditolak' && ditolak.length > 0
    ? `Ditolak di tahap ${labelTahap(ditolak[0].stage)} — perbaiki lalu kirim ulang`
    : KERJAAN_KETERANGAN[id]

  return { id, label: KERJAAN_LABEL[id], cls: KERJAAN_CLS[id], judul }
}
```

Hapus fungsi `dataTahapSaatIni()` dan `dataMenungguReview()` **hanya jika** tidak ada pemakai lain — periksa dengan:

```
grep -rn "dataTahapSaatIni\|dataMenungguReview" frontend/src
```

Kalau masih dipakai file lain, biarkan. `rejectedStages()`, `labelTahap()`, `STAGE_LABELS`, dan `TAHAP_SEBELUM` tetap dipakai — jangan dihapus kecuali `grep` membuktikan sebaliknya.

- [ ] **Step 5: Jalankan test, pastikan lulus**

Run: `npm run test:lib`
Expected: PASS.

- [ ] **Step 6: Typecheck & build**

Run: `npx tsc --noEmit` lalu `npm run build`
Expected: keduanya bersih. `DashboardPage.tsx` memakai `KERJAAN_URUT`/`KERJAAN_LABEL` lewat indeks `KerjaanId`, jadi hilangnya `'po'` seharusnya tidak menimbulkan error. Kalau ada, perbaiki di situ.

- [ ] **Step 7: Commit**

```
Siap di-commit: useTransaksiList.ts, kerjaanTransaksi.ts, kerjaanTransaksi.test.ts
Pesan usulan: "refactor(antrean): frontend membaca kategori dari server, hapus duplikasi aturan"
```

---

### Task 7: Tombol Simpan di `PembayaranForm`

**Files:**
- Modify: `frontend/src/components/pengadaan/PembayaranForm.tsx`

**Interfaces:**
- Consumes: endpoint `PATCH /api/po/{id}/pembayaran` dengan `status_bayar: 'belum'` (Task 3).
- Produces: `PembayaranForm` dengan dua tombol; props tidak berubah (`{ po: PoItem; onChanged?: () => void }`).

- [ ] **Step 1: Ubah mutation agar menerima aksi**

Ganti blok `const mutation = useMutation({...})` jadi:

```tsx
  const mutation = useMutation({
    mutationFn: (aksi: 'simpan' | 'bayar') => api.patch(`/api/po/${po.id}/pembayaran`, {
      status_bayar: aksi === 'bayar' ? 'dibayarkan' : 'belum',
      // Backend hanya mewajibkan tanggal saat dibayarkan, jadi draft boleh mengirim null.
      tanggal_bayar: tanggalBayar || null,
      no_spp: noSpp.trim(),
    }),
    onSuccess: (_data, aksi) => {
      setConfirmBayar(false)
      queryClient.invalidateQueries({ queryKey: ['po-list'] })
      onChanged?.()
      toast.success(aksi === 'bayar'
        ? `PO ${po.no_po} ditandai dibayarkan dan transaksi selesai.`
        : `Pembayaran PO ${po.no_po} tersimpan sebagai draft.`)
    },
    onError: (err) => toast.error(apiErrorMessage(err, 'Gagal menyimpan pembayaran.')),
  })
```

- [ ] **Step 2: Ganti baris tombol**

Ganti baris tombol tunggal:

```tsx
      <div className="mt-4 flex justify-end"><button type="submit" disabled={!tanggalBayar || !noSpp.trim() || mutation.isPending} className="btn btn-primary">{mutation.isPending ? 'Menyimpan...' : 'Tandai Dibayarkan'}</button></div>
```

jadi:

```tsx
      {/* Simpan menahan No. SPP & tanggal tanpa melunasi -- "Tandai Dibayarkan" tetap satu-satunya
          aksi final (transaksi jadi selesai dan tidak bisa dibatalkan). */}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => mutation.mutate('simpan')}
          disabled={!noSpp.trim() || mutation.isPending}
          className="btn btn-ghost border border-border bg-white"
        >
          {mutation.isPending ? 'Menyimpan...' : 'Simpan'}
        </button>
        <button type="submit" disabled={!tanggalBayar || !noSpp.trim() || mutation.isPending} className="btn btn-primary">
          {mutation.isPending ? 'Menyimpan...' : 'Tandai Dibayarkan'}
        </button>
      </div>
```

- [ ] **Step 3: Longgarkan `required` pada tanggal bayar**

Input tanggal saat ini `required`, yang memblokir submit HTML. Karena "Simpan" kini `type="button"` ia tidak terpengaruh, tapi `required` tetap benar untuk tombol submit. **Biarkan `required` apa adanya** — Simpan melewati validasi form, Tandai Dibayarkan tetap mewajibkannya.

Ubah hanya label agar jujur:

```tsx
<span className="label">Tanggal Bayar (wajib untuk menandai dibayarkan)</span>
```

- [ ] **Step 4: Sesuaikan pemanggilan konfirmasi**

`ConfirmDialog` memanggil `onConfirm={() => mutation.mutate()}` — sekarang wajib berargumen:

```tsx
        onConfirm={() => mutation.mutate('bayar')}
```

- [ ] **Step 5: Typecheck & build**

Run: `npx tsc --noEmit` lalu `npm run build`
Expected: bersih.

- [ ] **Step 6: Verifikasi manual alur Keuangan ujung ke ujung**

`PembayaranForm` sudah dirender di dua tempat — halaman `/keuangan` dan timeline
`TransaksiDetailPage` (digerbangi `showKeuanganBayar`) — jadi tombol Simpan otomatis muncul di
keduanya tanpa perubahan tambahan. Jalankan `npm run dev` + backend, masuk sebagai Keuangan pada
PO yang sudah diterima:

1. Dashboard → baris berlabel **Perlu diisi**.
2. Klik baris → timeline transaksi menampilkan form pembayaran.
3. Isi No. SPP, tekan **Simpan** → toast draft; kembali ke dashboard, baris jadi **Draft belum dikirim**.
4. Isi tanggal, tekan **Tandai Dibayarkan** → transaksi selesai dan hilang dari antrean.
5. Buka `/keuangan` → form yang sama menampilkan kedua tombol.

- [ ] **Step 7: Commit**

```
Siap di-commit: PembayaranForm.tsx
Pesan usulan: "feat(keuangan): tombol Simpan pada form pembayaran"
```

---

### Task 8: Verifikasi menyeluruh

**Files:** —

- [ ] **Step 1: Seluruh test backend**

Run (dari `backend/`): `php artisan test`
Expected: PASS semuanya.

- [ ] **Step 2: Seluruh test & build frontend**

Run (dari `frontend/`): `npm run test:lib && npx tsc --noEmit && npm run build && npm run lint`
Expected: test PASS, tsc bersih, build sukses, lint tanpa warning **baru** (warning lama di `DashboardPage.tsx`, `useAuth.tsx`, `sonner.tsx` memang sudah ada).

- [ ] **Step 3: Sisa referensi `po`**

Run: `grep -rn "'po'" frontend/src/lib/kerjaanTransaksi.ts backend/app/Services/Transaksi/KerjaanTransaksi.php`
Expected: tidak ada hasil.

- [ ] **Step 4: Laporkan siap di-commit**

Rangkum file yang berubah beserta hasil test. Jangan jalankan `git commit`.

---

## Self-Review

**Cakupan spec:** §3 → Task 1. §4.1 → Task 2 & 3. §4.2 → Task 4. §4.3 → Task 5. §5 → test di Task 5. §6 → Task 6 & 7. §7 (di luar cakupan) tidak butuh task. §8 → test tersebar di Task 2, 3, 5, 6, plus Task 8.

**Koreksi terhadap spec §K5:** spec menyatakan `PembayaranForm` perlu ditambahkan ke
`TransaksiDetailPage`. Itu **keliru** — komponennya sudah dirender di sana (baris ~805, gerbang
`showKeuanganBayar = poAccepted && !poPaid && isKeuanganRole`). Tidak ada task untuk itu; premis
"terkurung di /keuangan" pada spec tidak berlaku. Konsekuensi desainnya tidak berubah: baris
antrean Keuangan tetap mengarah ke tempat yang bisa dikerjakan.

**Konsistensi tipe:** `KerjaanId` (4 nilai) dipakai di Task 5 (`KerjaanTransaksi::SEMUA`), Task 6 (`useTransaksiList`, `kerjaanTransaksi.ts`). Field response `kerjaan` didefinisikan Task 5, dikonsumsi Task 6. `mutation.mutate(aksi)` didefinisikan Task 7 Step 1, dipakai Step 2 & 4.

**Nama field yang sudah diverifikasi ke kode, bukan dikarang:** tahap `ub_jastasma` memakai
`ka1`, `ka2`, `ka3`, `hampa`, `butir_hijau` (lihat `DataUbJastasma::$fillable` dan
`PoLifecycleTest.php:211`) — bukan field pengolahan/beras.

**Risiko yang sudah ditandai eksplisit:** `joinTahap()` sekali saja (Task 5 Step 3); `resetReview()` ada di dua service berbeda dan hanya versi `PoLifecycleService` yang diubah (Task 3) sedangkan versi `PoGroupingService` tetap menulis `menunggu_review` karena itu memang jalur kirim (Task 2).
