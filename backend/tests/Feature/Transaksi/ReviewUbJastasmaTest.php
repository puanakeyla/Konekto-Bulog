<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Testing\File;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Data UB Jastasma diperiksa Pengadaan -- tahap berikutnya, sesuai pola seluruh rantai:
 * yang menerima/menolak selalu tahap SESUDAHNYA, bukan tahap itu sendiri.
 *
 * Berkas ini memastikan keadaan yang dibutuhkan tombol Terima/Tolak di timeline benar-benar
 * terbentuk: setelah UB mengirim, transaksinya pindah ke tahap pengadaan DAN datanya berstatus
 * 'menunggu_review'. Kalau salah satu saja tidak terpenuhi, tombolnya tidak akan pernah tampil.
 */
class ReviewUbJastasmaTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $jemputPangan;

    private User $makloon;

    private User $ub;

    private User $pengadaan;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('foto-transaksi');
        $this->seed(RoleSeeder::class);
        $this->stageService = app(TransaksiStageService::class);

        $buat = fn (string $role) => User::factory()->create(['role_id' => Role::where('nama_role', $role)->value('id')]);
        $this->jemputPangan = $buat('jemput_pangan');
        $this->makloon = $buat('makloon');
        $this->ub = $buat('ub_jastasma');
        $this->pengadaan = $buat('pengadaan');
    }

    private function sampaiTahapUb(): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-UB',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 UB',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => '2026-08-01',
            'kuantum' => 1000,
            'jarak_ke_makloon_km' => 5,
        ]);
        $this->stageService->terima($transaksi->fresh(), $this->makloon);

        $this->stageService->submitStage($transaksi->fresh(), $this->makloon, 'makloon', DataMakloonTjp::class, [
            'tanggal_bongkar' => '2026-08-02',
            'kuantum_bongkar' => 980,
        ]);
        $this->stageService->terima($transaksi->fresh(), $this->ub);

        return $transaksi->fresh();
    }

    /** UB wajib melampirkan foto LHPK/HPK sebelum datanya boleh dikirim. */
    private function kirimDataUb(Transaksi $transaksi): void
    {
        Sanctum::actingAs($this->ub);

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/ub-jastasma", [
            'aksi' => 'draft',
            'ka1' => 14, 'ka2' => 2, 'ka3' => 1, 'hampa' => 1, 'butir_hijau' => 1,
        ])->assertOk();

        $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/foto", [
            'jenis_foto' => 'foto_lhpk_hpk',
            'foto' => File::image('lhpk.jpg'),
        ])->assertCreated();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/ub-jastasma", [
            'aksi' => 'submit',
            'ka1' => 14, 'ka2' => 2, 'ka3' => 1, 'hampa' => 1, 'butir_hijau' => 1,
        ])->assertOk();
    }

    public function test_setelah_ub_mengirim_transaksi_menunggu_review_pengadaan(): void
    {
        $transaksi = $this->sampaiTahapUb();

        $this->kirimDataUb($transaksi);

        $transaksi->refresh();

        // Dua syarat tombol Terima/Tolak muncul di blok UB Jastasma milik Pengadaan.
        $this->assertSame('pengadaan', $transaksi->current_stage);
        $this->assertSame('menunggu_review', DataUbJastasma::where('transaksi_id', $transaksi->id_transaksi)->value('status'));
    }

    public function test_pengadaan_bisa_menerima_data_ub(): void
    {
        $transaksi = $this->sampaiTahapUb();

        $this->kirimDataUb($transaksi);

        Sanctum::actingAs($this->pengadaan);
        $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/terima")->assertOk();

        $this->assertSame('diterima', DataUbJastasma::where('transaksi_id', $transaksi->id_transaksi)->value('status'));
    }

    public function test_pengadaan_bisa_menolak_data_ub(): void
    {
        $transaksi = $this->sampaiTahapUb();

        $this->kirimDataUb($transaksi);

        Sanctum::actingAs($this->pengadaan);
        $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/tolak", ['catatan' => 'Mutu tidak sesuai'])->assertOk();

        $transaksi->refresh();
        $this->assertSame('ub_jastasma', $transaksi->current_stage);
        $this->assertSame('ditolak', DataUbJastasma::where('transaksi_id', $transaksi->id_transaksi)->value('status'));
    }
}
