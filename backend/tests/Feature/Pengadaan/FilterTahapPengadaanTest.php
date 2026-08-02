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

/**
 * Chip filter tahap di dashboard Pengadaan (?pengadaan_tahap=). Tiap chip harus memuat
 * transaksi yang benar-benar berada di langkah itu, dan tidak memuat yang bukan.
 */
class FilterTahapPengadaanTest extends TestCase
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

    public function test_tiap_chip_memuat_hanya_transaksi_pada_langkah_itu(): void
    {
        // (a) baru masuk, UB Jastasma belum ditinjau -> "Perlu dicek"
        $perluDicek = $this->transaksiSampaiPengadaan('PMK-A', terima: false);

        // (b) sudah diterima, belum ada PO -> "PO/IN"
        $belumPo = $this->transaksiSampaiPengadaan('PMK-B');

        // (c) sudah PO, nomor IN belum diisi -> "PO/IN"
        $poTanpaIn = $this->transaksiSampaiPengadaan('PMK-C');
        $this->poService->gabungkanPo([$poTanpaIn->id_transaksi], 'PO-C', $this->pengadaan);

        // (d) IN lengkap, SPP kosong -> "SPP"
        $siapSpp = $this->transaksiSampaiPengadaan('PMK-D');
        $poD = $this->poService->gabungkanPo([$siapSpp->id_transaksi], 'PO-D', $this->pengadaan);
        $this->isiSemuaIn($poD, 'IN-D');

        // (e) No. SPP tersimpan -> PO sudah dikirim ke Keuangan, sisa Status Sergab -> "Sergab"
        $siapSergab = $this->transaksiSampaiPengadaan('PMK-E');
        $poE = $this->poService->gabungkanPo([$siapSergab->id_transaksi], 'PO-E', $this->pengadaan);
        $this->isiSemuaIn($poE, 'IN-E');
        Sanctum::actingAs($this->pengadaan);
        $this->patchJson("/api/po/{$poE->id}/spp", ['no_spp' => 'SPP-E'])->assertOk();
        $this->assertSame('keuangan', $siapSergab->fresh()->current_stage);

        $this->assertSame([$perluDicek->id_transaksi], $this->idsUntuk('perlu_dicek'));
        // Regresi: yang belum ditinjau juga belum punya PO, dan dulu ikut terjaring di sini.
        $this->assertSame([$belumPo->id_transaksi, $poTanpaIn->id_transaksi], $this->idsUntuk('po_in'));
        $this->assertSame([$siapSpp->id_transaksi], $this->idsUntuk('spp'));
        $this->assertSame([$siapSergab->id_transaksi], $this->idsUntuk('sergab'));
        $this->assertSame([], $this->idsUntuk('perlu_diperbaiki'));
    }

    /** @return list<string> */
    private function idsUntuk(string $tahap): array
    {
        Sanctum::actingAs($this->pengadaan);
        $response = $this->getJson('/api/transaksi?per_page=100'.($tahap === 'semua' ? '' : '&pengadaan_tahap='.$tahap));
        $response->assertOk();

        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();
        sort($ids);

        return $ids;
    }

    private function isiSemuaIn($po, string $prefix): void
    {
        $this->poService->isiNomorIn($po, $po->poDetail
            ->map(fn ($detail, $i) => ['po_detail_id' => $detail->id, 'no_in' => $prefix.'-'.$i])
            ->all());
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function transaksiSampaiPengadaan(string $idPemasok, bool $terima = true): Transaksi
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
        $this->stageService->submitStage($transaksi->fresh(), $this->ubJastasma, 'ub_jastasma', DataUbJastasma::class, [
            'ka1' => 12.5,
            'ka2' => 12.6,
            'ka3' => 12.7,
            'hampa' => 1.2,
            'butir_hijau' => 0.5,
        ]);

        if ($terima) {
            $this->stageService->terima($transaksi->fresh(), $this->pengadaan);
        }

        return $transaksi->fresh();
    }
}
