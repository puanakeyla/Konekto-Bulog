<?php

namespace Tests\Feature\Pengadaan;

use App\Models\DataMakloonMpp;
use App\Models\DataPengadaan;
use App\Models\DataUbJastasma;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class IsiNomorInTest extends TestCase
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

    public function test_isi_nomor_in_menyimpan_no_in_dan_belum_mengubah_status_jika_belum_semua_terisi(): void
    {
        $po = $this->buatPoDenganDuaBaris();
        $details = $po->poDetail;

        $result = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $details[0]->id, 'no_in' => 'IN-001'],
        ]);

        $this->assertSame('IN-001', PoDetail::find($details[0]->id)->no_in);
        $this->assertNull(PoDetail::find($details[1]->id)->no_in);
        $this->assertSame('proses', $result->status);
    }

    public function test_isi_nomor_in_mengubah_status_jadi_lengkap_setelah_semua_baris_terisi(): void
    {
        $po = $this->buatPoDenganDuaBaris();
        $details = $po->poDetail;

        $result = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $details[0]->id, 'no_in' => 'IN-001'],
            ['po_detail_id' => $details[1]->id, 'no_in' => 'IN-002'],
        ]);

        $this->assertSame('lengkap', $result->status);
        $this->assertSame('lengkap', $po->fresh()->status);
    }

    public function test_isi_nomor_in_menolak_duplikat_dalam_satu_request(): void
    {
        $po = $this->buatPoDenganDuaBaris();
        $details = $po->poDetail;

        $this->expectException(HttpException::class);

        $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $details[0]->id, 'no_in' => 'IN-SAMA'],
            ['po_detail_id' => $details[1]->id, 'no_in' => 'IN-SAMA'],
        ]);
    }

    public function test_isi_nomor_in_menolak_no_in_yang_sudah_dipakai_baris_lain(): void
    {
        $po = $this->buatPoDenganDuaBaris();
        $details = $po->poDetail;

        $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $details[0]->id, 'no_in' => 'IN-DIPAKAI'],
        ]);

        $this->expectException(HttpException::class);

        $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $details[1]->id, 'no_in' => 'IN-DIPAKAI'],
        ]);
    }

    public function test_isi_nomor_in_menolak_po_detail_milik_po_lain(): void
    {
        $poA = $this->buatPoDenganDuaBaris();
        $poB = $this->buatPoDenganDuaBaris();

        $this->expectException(HttpException::class);

        $this->poService->isiNomorIn($poA, [
            ['po_detail_id' => $poB->poDetail[0]->id, 'no_in' => 'IN-SALAH'],
        ]);
    }

    public function test_isi_nomor_in_menolak_po_yang_sudah_berstatus_lengkap(): void
    {
        $po = $this->buatPoDenganDuaBaris();
        $details = $po->poDetail;

        $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $details[0]->id, 'no_in' => 'IN-001'],
            ['po_detail_id' => $details[1]->id, 'no_in' => 'IN-002'],
        ]);

        $this->assertSame('lengkap', $po->fresh()->status);

        $this->expectException(HttpException::class);

        $this->poService->isiNomorIn($po->fresh(), [
            ['po_detail_id' => $details[0]->id, 'no_in' => 'IN-BARU'],
        ]);
    }

    public function test_patch_po_in_via_http_mengisi_no_in(): void
    {
        $po = $this->buatPoDenganDuaBaris();
        $details = $po->poDetail;

        Sanctum::actingAs($this->pengadaan);

        $response = $this->patchJson("/api/po/{$po->id}/in", [
            'items' => [
                ['po_detail_id' => $details[0]->id, 'no_in' => 'IN-HTTP-1'],
                ['po_detail_id' => $details[1]->id, 'no_in' => 'IN-HTTP-2'],
            ],
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.status', 'lengkap');
    }

    public function test_patch_po_in_ditolak_untuk_role_selain_pengadaan(): void
    {
        $po = $this->buatPoDenganDuaBaris();
        $details = $po->poDetail;

        Sanctum::actingAs($this->makloon);

        $response = $this->patchJson("/api/po/{$po->id}/in", [
            'items' => [
                ['po_detail_id' => $details[0]->id, 'no_in' => 'IN-HTTP-3'],
            ],
        ]);

        $response->assertForbidden();
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

    private function buatPoDenganDuaBaris(): DataPengadaan
    {
        $idPemasok = 'PEMASOK-'.uniqid();
        $t1 = $this->transaksiSampaiPengadaan($idPemasok, '2026-07-10', 100);
        $t2 = $this->transaksiSampaiPengadaan($idPemasok, '2026-07-10', 50);

        return $this->poService->gabungkanPo(
            [$t1->id_transaksi, $t2->id_transaksi],
            'PO-'.uniqid(),
            $this->pengadaan
        );
    }
}
