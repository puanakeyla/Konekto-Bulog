<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTerima;
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

    /**
     * Sejak Makloon Terima punya tabel sendiri, data MPP selalu sudah 'diterima' ketika
     * transaksi sampai ke UB. Klasifikasi lama masih melihat data MPP di sini, sehingga UB
     * tidak pernah mendapat chip "Perlu dicek" -- yang menunggu diperiksa adalah HASIL TIMBANG.
     */
    public function test_ub_dengan_hasil_timbang_menunggu_review_berkategori_periksa(): void
    {
        $this->transaksiSampaiUb();

        $this->assertKerjaan($this->ubJastasma, 'periksa');
    }

    public function test_makloon_dengan_draft_hasil_timbang_berkategori_draft(): void
    {
        $transaksi = $this->transaksiSampaiMakloonTerima();
        $this->stageService->saveDraft($transaksi->fresh(), $this->makloon, 'makloon_terima', DataMakloonTerima::class, ['kuantum_bongkar' => 900]);

        $this->assertKerjaan($this->makloon, 'draft');
    }

    public function test_hasil_timbang_ditolak_ub_berkategori_ditolak(): void
    {
        $transaksi = $this->transaksiSampaiUb();
        $this->stageService->tolak($transaksi->fresh(), $this->ubJastasma, 'Timbangan tidak cocok');

        $this->assertKerjaan($this->makloon, 'ditolak');
    }

    /** MPP yang data Makloon Kirim-nya sudah diterima, berhenti di tahap Makloon Terima. */
    private function transaksiSampaiMakloonTerima(): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->makloon);

        $this->stageService->submitStage($transaksi, $this->makloon, 'makloon', DataMakloonMpp::class, [
            'id_pemasok' => 'PEMASOK-MT',
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

        return $transaksi->fresh();
    }

    /** Lanjutan: hasil timbang sudah dikirim, menunggu diperiksa UB. */
    private function transaksiSampaiUb(): Transaksi
    {
        $transaksi = $this->transaksiSampaiMakloonTerima();
        $this->stageService->submitStage($transaksi->fresh(), $this->makloon, 'makloon_terima', DataMakloonTerima::class, ['kuantum_bongkar' => 980]);

        return $transaksi->fresh();
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
        $this->buatPoDikirimKeKeuangan();

        $this->assertKerjaan($this->keuangan, 'periksa');
    }

    public function test_keuangan_setelah_terima_po_berkategori_isi(): void
    {
        $po = $this->buatPoDikirimKeKeuangan();
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $this->assertKerjaan($this->keuangan, 'isi');
    }

    public function test_keuangan_dengan_pembayaran_tersimpan_berkategori_draft(): void
    {
        $po = $this->buatPoDikirimKeKeuangan();
        $this->reviewService->terima($po->fresh(), $this->keuangan);
        $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null);

        $this->assertKerjaan($this->keuangan, 'draft');
    }

    public function test_po_ditolak_keuangan_berkategori_ditolak_di_pengadaan(): void
    {
        $po = $this->buatPoDikirimKeKeuangan();
        $this->reviewService->tolak($po->fresh(), $this->keuangan, 'Nomor IN salah.');

        $this->assertKerjaan($this->pengadaan, 'ditolak');
    }

    /**
     * Panel "Transaksi ditolak" di dashboard menyebut tahap penolak & catatannya lewat
     * rejectedStages(), yang membaca data_pengadaan pada baris. Endpoint daftar dulu tidak
     * memuat relasi PO, sehingga untuk penolakan level PO panel itu selalu kosong padahal
     * chip "Perlu diperbaiki" berangka. Ini penjaga agar datanya benar-benar terkirim.
     */
    public function test_daftar_mengirim_data_po_untuk_baris_yang_ditolak(): void
    {
        $po = $this->buatPoDikirimKeKeuangan();
        $this->reviewService->tolak($po->fresh(), $this->keuangan, 'Nomor IN salah.');

        Sanctum::actingAs($this->pengadaan);
        $baris = $this->getJson('/api/transaksi')->assertOk()->json('data.0');

        $this->assertSame('ditolak', $baris['kerjaan']);
        $this->assertSame('ditolak', $baris['data_pengadaan']['review_status']);
        $this->assertSame('Nomor IN salah.', $baris['data_pengadaan']['catatan_penolakan']);
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

        // Makloon Terima: terima data Kirim, isi hasil timbang, kirim -- lalu UB memeriksanya.
        $this->stageService->terima($transaksi->fresh(), $this->makloon);
        $this->stageService->submitStage($transaksi->fresh(), $this->makloon, 'makloon_terima', DataMakloonTerima::class, ['kuantum_bongkar' => 980]);
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

    /**
     * PO yang sudah diserahkan ke Keuangan: seluruh IN terisi + No. SPP tersimpan. Status Sergab
     * SENGAJA dibiarkan 'proses' -- di alur sekarang 'lengkap' adalah penutup yang menandai
     * transaksinya selesai, sehingga ia akan langsung hilang dari antrean role mana pun.
     */
    private function buatPoDikirimKeKeuangan(): DataPengadaan
    {
        $t = $this->transaksiSampaiPengadaan('PEMASOK-'.uniqid());
        $po = $this->poService->gabungkanPo([$t->id_transaksi], 'PO-'.uniqid(), $this->pengadaan);

        $items = $po->poDetail->values()->map(fn ($d, $i) => [
            'po_detail_id' => $d->id,
            'no_in' => 'IN-'.uniqid().'-'.$i,
        ])->all();

        return $this->poService->isiNomorIn($po, $items, 'SPP-'.uniqid());
    }
}
