<?php

namespace Tests\Feature\Pengadaan;

use App\Models\DataMakloonMpp;
use App\Models\DataOperasi;
use App\Models\DataPengadaan;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Pengadaan\PoLifecycleService;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class PoLifecycleTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private PoGroupingService $poService;

    private PoLifecycleService $lifecycleService;

    private User $makloon;

    private User $ubJastasma;

    private User $pengadaan;

    private User $keuangan;

    private User $operasi;

    private User $gudang;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->poService = app(PoGroupingService::class);
        $this->lifecycleService = app(PoLifecycleService::class);

        $this->makloon = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
        $this->pengadaan = $this->buatUser('pengadaan');
        $this->keuangan = $this->buatUser('keuangan');
        $this->operasi = $this->buatUser('operasi');
        $this->gudang = $this->buatUser('gudang');
    }

    // ---------- Pembayaran (Keuangan) ----------

    public function test_pembayaran_ditolak_jika_po_belum_berstatus_lengkap(): void
    {
        $po = $this->buatPoBelumLengkap();

        $this->expectException(HttpException::class);

        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-001');
    }

    public function test_pembayaran_sukses_set_no_spp_dan_memajukan_current_stage_ke_operasi(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(2);

        $dataKeuangan = $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-001');

        $this->assertSame('dibayarkan', $dataKeuangan->status_bayar);
        $this->assertSame('2026-07-12', $dataKeuangan->tanggal_bayar->format('Y-m-d'));
        $this->assertSame('SPP-001', $po->fresh()->no_spp);

        foreach ($transaksiIds as $id) {
            $this->assertSame('operasi', Transaksi::find($id)->current_stage);
        }
    }

    public function test_pembayaran_tidak_memajukan_stage_dua_kali_jika_dipanggil_ulang(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);

        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-002');
        Transaksi::whereIn('id_transaksi', $transaksiIds)->update(['current_stage' => 'gudang']);

        // panggil ulang dengan status yang sama - tidak boleh menimpa current_stage yang sudah maju lebih jauh
        $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', '2026-07-12', null);

        $this->assertSame('gudang', Transaksi::find($transaksiIds[0])->current_stage);
    }

    public function test_patch_pembayaran_via_http_ditolak_untuk_role_selain_keuangan(): void
    {
        [$po] = $this->buatPoLengkap(1);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->patchJson("/api/po/{$po->id}/pembayaran", [
            'status_bayar' => 'dibayarkan',
            'tanggal_bayar' => '2026-07-12',
        ]);

        $response->assertForbidden();
    }

    public function test_patch_pembayaran_via_http_sukses(): void
    {
        [$po] = $this->buatPoLengkap(1);

        Sanctum::actingAs($this->keuangan);

        $response = $this->patchJson("/api/po/{$po->id}/pembayaran", [
            'status_bayar' => 'dibayarkan',
            'tanggal_bayar' => '2026-07-12',
            'no_spp' => 'SPP-HTTP-001',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.status_bayar', 'dibayarkan');
    }

    // ---------- Operasi ----------

    public function test_operasi_ditolak_jika_belum_dibayarkan(): void
    {
        [$po] = $this->buatPoLengkap(1);

        $this->expectException(HttpException::class);

        $this->lifecycleService->inputOperasi($po, $this->dataOperasi());
    }

    public function test_operasi_sukses_dan_memajukan_current_stage_ke_gudang(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(2);
        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-003');

        $dataOperasi = $this->lifecycleService->inputOperasi($po->fresh(), $this->dataOperasi());

        $this->assertSame('MO-001', $dataOperasi->no_mo);
        foreach ($transaksiIds as $id) {
            $this->assertSame('gudang', Transaksi::find($id)->current_stage);
        }
    }

    public function test_operasi_menolak_duplikat_untuk_po_yang_sama(): void
    {
        [$po] = $this->buatPoLengkap(1);
        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-004');
        $this->lifecycleService->inputOperasi($po->fresh(), $this->dataOperasi());

        $this->expectException(HttpException::class);

        $this->lifecycleService->inputOperasi($po->fresh(), $this->dataOperasi());
    }

    public function test_post_operasi_via_http_ditolak_untuk_role_selain_operasi(): void
    {
        [$po] = $this->buatPoLengkap(1);
        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-005');

        Sanctum::actingAs($this->keuangan);

        $response = $this->postJson("/api/po/{$po->id}/operasi", $this->dataOperasi());

        $response->assertForbidden();
    }

    // ---------- Gudang ----------

    public function test_gudang_sukses_menyelesaikan_transaksi_terkait(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(2);
        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-006');
        $dataOperasi = $this->lifecycleService->inputOperasi($po->fresh(), $this->dataOperasi());

        $dataGudang = $this->lifecycleService->inputGudang($dataOperasi, $this->dataGudang());

        $this->assertSame('Gudang A', $dataGudang->nama_gudang);
        foreach ($transaksiIds as $id) {
            $this->assertSame('selesai', Transaksi::find($id)->status_keseluruhan);
        }
    }

    public function test_gudang_menolak_duplikat_untuk_operasi_yang_sama(): void
    {
        [$po] = $this->buatPoLengkap(1);
        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-007');
        $dataOperasi = $this->lifecycleService->inputOperasi($po->fresh(), $this->dataOperasi());
        $this->lifecycleService->inputGudang($dataOperasi, $this->dataGudang());

        $this->expectException(HttpException::class);

        $this->lifecycleService->inputGudang($dataOperasi->fresh(), $this->dataGudang());
    }

    public function test_post_gudang_via_http_ditolak_untuk_role_selain_gudang(): void
    {
        [$po] = $this->buatPoLengkap(1);
        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-008');
        $dataOperasi = $this->lifecycleService->inputOperasi($po->fresh(), $this->dataOperasi());

        Sanctum::actingAs($this->operasi);

        $response = $this->postJson("/api/operasi/{$dataOperasi->id}/gudang", $this->dataGudang());

        $response->assertForbidden();
    }

    public function test_post_gudang_via_http_sukses(): void
    {
        [$po] = $this->buatPoLengkap(1);
        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-009');
        $dataOperasi = $this->lifecycleService->inputOperasi($po->fresh(), $this->dataOperasi());

        Sanctum::actingAs($this->gudang);

        $response = $this->postJson("/api/operasi/{$dataOperasi->id}/gudang", $this->dataGudang());

        $response->assertCreated();
        $response->assertJsonPath('data.nama_gudang', 'Gudang A');
    }

    // ---------- helpers ----------

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function dataOperasi(): array
    {
        return [
            'no_mo' => 'MO-001',
            'no_tm' => 'TM-001',
            'hgl_persen' => 60.5,
            'broken_persen' => 5.2,
            'menir_persen' => 2.1,
            'katul_persen' => 3.3,
            'rendemen_persen' => 62.0,
        ];
    }

    private function dataGudang(): array
    {
        return [
            'tanggal_masuk' => '2026-07-15',
            'nama_gudang' => 'Gudang A',
            'realisasi_hgl' => 61.0,
            'no_tm' => 'TM-001',
        ];
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

    private function buatPoBelumLengkap(): DataPengadaan
    {
        $idPemasok = 'PEMASOK-'.uniqid();
        $t1 = $this->transaksiSampaiPengadaan($idPemasok, '2026-07-10', 100);

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

        $po = $this->poService->isiNomorIn($po, $items);

        return [$po, $transaksiIds];
    }
}
