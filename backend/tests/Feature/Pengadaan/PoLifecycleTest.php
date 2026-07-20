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
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class PoLifecycleTest extends TestCase
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

    // ---------- Pembayaran (Keuangan) ----------

    public function test_pembayaran_ditolak_jika_po_belum_berstatus_lengkap(): void
    {
        $po = $this->buatPoBelumLengkap();

        $this->expectException(HttpException::class);

        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12', 'SPP-001');
    }

    public function test_pembayaran_sukses_set_no_spp_dan_menyelesaikan_transaksi(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(2);

        $dataKeuangan = $this->bayarPo($po, '2026-07-12', 'SPP-001');

        $this->assertSame('dibayarkan', $dataKeuangan->status_bayar);
        $this->assertSame('2026-07-12', $dataKeuangan->tanggal_bayar->format('Y-m-d'));
        $this->assertSame('SPP-001', $po->fresh()->no_spp);

        // Keuangan adalah tahap terakhir: pembayaran penuh menandai transaksi selesai,
        // current_stage tetap di 'keuangan' (tidak ada tahap Operasi/Gudang di timeline lagi).
        foreach ($transaksiIds as $id) {
            $transaksi = Transaksi::find($id);
            $this->assertSame('selesai', $transaksi->status_keseluruhan);
            $this->assertSame('keuangan', $transaksi->current_stage);
        }
    }

    public function test_pembayaran_ulang_setelah_selesai_ditolak_guard(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);

        $this->bayarPo($po, '2026-07-12', 'SPP-002');
        $this->assertSame('selesai', Transaksi::find($transaksiIds[0])->status_keseluruhan);

        // Data Keuangan yang sudah 'diterima' tidak bisa dibayar ulang: guard di
        // updatePembayaran menolaknya, jadi status selesai tetap final (tidak ada
        // efek samping ganda seperti dobel-advance stage di skema lama).
        $this->expectException(HttpException::class);
        $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', '2026-07-12', null);
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
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        Sanctum::actingAs($this->keuangan);

        $response = $this->patchJson("/api/po/{$po->id}/pembayaran", [
            'status_bayar' => 'dibayarkan',
            'tanggal_bayar' => '2026-07-12',
            'no_spp' => 'SPP-HTTP-001',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.status_bayar', 'dibayarkan');
    }

    public function test_keuangan_tolak_po_lalu_pengadaan_revisi_mengirim_lagi_ke_keuangan(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);

        $this->reviewService->tolak($po->fresh(), $this->keuangan, 'Nomor IN salah.');

        $this->assertSame('ditolak', $po->fresh()->review_status);
        $this->assertSame('pengadaan', Transaksi::find($transaksiIds[0])->current_stage);

        $detail = $po->poDetail()->first();
        $this->poService->isiNomorIn($po->fresh(), [
            ['po_detail_id' => $detail->id, 'no_in' => 'IN-REVISI-001'],
        ]);

        $this->assertSame('menunggu_review', $po->fresh()->review_status);
        $this->assertSame('keuangan', Transaksi::find($transaksiIds[0])->current_stage);
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

    private function bayarPo(DataPengadaan $po, string $tanggalBayar, string $noSpp)
    {
        if ($po->fresh()->review_status !== 'diterima') {
            $this->reviewService->terima($po->fresh(), $this->keuangan);
        }

        return $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', $tanggalBayar, $noSpp);
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
