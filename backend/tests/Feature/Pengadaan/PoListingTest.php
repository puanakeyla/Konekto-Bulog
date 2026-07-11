<?php

namespace Tests\Feature\Pengadaan;

use App\Models\DataMakloonMpp;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class PoListingTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private PoGroupingService $poService;

    private User $makloon;

    private User $ubJastasma;

    private User $pengadaan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->poService = app(PoGroupingService::class);

        $this->makloon = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
        $this->pengadaan = $this->buatUser('pengadaan');
    }

    public function test_get_po_menampilkan_daftar_po_untuk_role_pengadaan(): void
    {
        $this->buatPo('PO-LIST-001');

        Sanctum::actingAs($this->pengadaan);
        $response = $this->getJson('/api/po');

        $response->assertOk();
        $response->assertJsonPath('data.0.no_po', 'PO-LIST-001');
        $response->assertJsonPath('data.0.status', 'proses');
    }

    public function test_get_po_ditolak_untuk_role_selain_pengadaan_keuangan_operasi_gudang_admin(): void
    {
        Sanctum::actingAs($this->makloon);
        $response = $this->getJson('/api/po');

        $response->assertForbidden();
    }

    public function test_get_po_detail_menampilkan_po_detail_dengan_no_in(): void
    {
        $po = $this->buatPo('PO-LIST-002');
        $detail = $po->poDetail->first();
        $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $detail->id, 'no_in' => 'IN-LIST-1'],
        ]);

        Sanctum::actingAs($this->pengadaan);
        $response = $this->getJson("/api/po/{$po->id}");

        $response->assertOk();
        $response->assertJsonPath('data.no_po', 'PO-LIST-002');
        $response->assertJsonPath('data.po_detail.0.no_in', 'IN-LIST-1');
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function transaksiSampaiPengadaan(string $idPemasok): Transaksi
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

    private function buatPo(string $noPo)
    {
        $idPemasok = 'PEMASOK-'.uniqid();
        $t1 = $this->transaksiSampaiPengadaan($idPemasok);

        return $this->poService->gabungkanPo([$t1->id_transaksi], $noPo, $this->pengadaan);
    }
}
