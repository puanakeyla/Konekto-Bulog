<?php

namespace Tests\Feature\Pengadaan;

use App\Models\DataMakloonMpp;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PengadaanEndpointTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $makloon;

    private User $ubJastasma;

    private User $pengadaan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);

        $this->makloon = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
        $this->pengadaan = $this->buatUser('pengadaan');
    }

    public function test_post_gabungkan_po_membuat_po_dan_memajukan_tahap_transaksi(): void
    {
        $transaksi = $this->transaksiSampaiPengadaan('PEMASOK-X', '2026-07-10', 120);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->postJson('/api/pengadaan/gabungkan-po', [
            'transaksi_ids' => [$transaksi->id_transaksi],
            'no_po' => 'PO-HTTP-001',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('data.no_po', 'PO-HTTP-001');
        $response->assertJsonPath('data.total_kuantum', '120.00');
        $response->assertJsonPath('data.harga', '6500.00');
        $response->assertJsonPath('data.total_harga', '780000.00');

        $this->assertSame('keuangan', $transaksi->fresh()->current_stage);
    }

    public function test_post_gabungkan_po_ditolak_untuk_role_selain_pengadaan(): void
    {
        $transaksi = $this->transaksiSampaiPengadaan('PEMASOK-X', '2026-07-10', 120);

        Sanctum::actingAs($this->makloon);

        $response = $this->postJson('/api/pengadaan/gabungkan-po', [
            'transaksi_ids' => [$transaksi->id_transaksi],
            'no_po' => 'PO-HTTP-002',
        ]);

        $response->assertForbidden();
    }

    public function test_patch_po_mengubah_harga_dan_menghitung_ulang_total_harga(): void
    {
        $transaksi = $this->transaksiSampaiPengadaan('PEMASOK-X', '2026-07-10', 100);

        Sanctum::actingAs($this->pengadaan);

        $created = $this->postJson('/api/pengadaan/gabungkan-po', [
            'transaksi_ids' => [$transaksi->id_transaksi],
            'no_po' => 'PO-HTTP-003',
        ])->json('data');

        $response = $this->patchJson("/api/po/{$created['id']}", [
            'harga' => 7000,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.harga', '7000.00');
        $response->assertJsonPath('data.total_harga', '700000.00');
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
}
