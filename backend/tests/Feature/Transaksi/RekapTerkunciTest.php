<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;
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

    private User $pengadaan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->makloon = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
        // Role berikutnya setelah ub_jastasma dalam sequence -- dibutuhkan untuk
        // memanggil terima() saat mengunci tahap UB Jastasma.
        $this->pengadaan = $this->buatUser('pengadaan');
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

    public function test_ub_jastasma_hanya_melihat_transaksi_yang_tahap_ub_sudah_terkunci(): void
    {
        $terkunci = $this->buatMppDenganUbTerkunci();
        // Tahap UB sudah diajukan tapi belum diterima Pengadaan -> masih menunggu_review.
        $belumTerkunci = $this->buatMppDenganUbDiajukan();

        Sanctum::actingAs($this->ubJastasma);

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($terkunci->id_transaksi, $ids);
        $this->assertNotContains($belumTerkunci->id_transaksi, $ids);
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

    /** MPP dengan tahap UB Jastasma sudah diajukan tapi belum diterima Pengadaan (belum terkunci). */
    private function buatMppDenganUbDiajukan(): Transaksi
    {
        $transaksi = $this->buatMppDenganMakloonTerkunci();

        $this->stageService->submitStage($transaksi, $this->ubJastasma, 'ub_jastasma', DataUbJastasma::class, [
            'ka1' => 10,
            'ka2' => 11,
            'ka3' => 12,
            'hampa' => 1,
            'butir_hijau' => 1,
        ]);

        return $transaksi->fresh();
    }

    /** MPP dengan tahap UB Jastasma sudah diterima Pengadaan (= terkunci). */
    private function buatMppDenganUbTerkunci(): Transaksi
    {
        $transaksi = $this->buatMppDenganUbDiajukan();

        $this->stageService->terima($transaksi, $this->pengadaan);

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
