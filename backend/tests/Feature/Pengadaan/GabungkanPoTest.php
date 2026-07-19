<?php

namespace Tests\Feature\Pengadaan;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Pengadaan\PoGroupingService;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Validation\ValidationException;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class GabungkanPoTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $makloon;

    private User $jemputPangan;

    private User $ubJastasma;

    private User $pengadaan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);

        $this->makloon = $this->buatUser('makloon');
        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
        $this->pengadaan = $this->buatUser('pengadaan');
    }

    public function test_gabungkan_po_menjumlahkan_kuantum_transaksi_mpp_sekelompok(): void
    {
        $t1 = $this->transaksiMppSampaiPengadaan('PEMASOK-A', '2026-07-10', 100);
        $t2 = $this->transaksiMppSampaiPengadaan('PEMASOK-A', '2026-07-10', 50);

        $po = app(PoGroupingService::class)->gabungkanPo(
            [$t1->id_transaksi, $t2->id_transaksi],
            'PO-TEST-001',
            $this->pengadaan
        );

        $this->assertSame('150.00', $po->total_kuantum);
        $this->assertSame('6500.00', $po->harga);
        $this->assertSame('975000.00', $po->total_harga);
        $this->assertSame('PEMASOK-A', $po->id_pemasok);
        $this->assertSame('proses', $po->status);
        $this->assertCount(2, $po->poDetail);

        $this->assertSame('keuangan', $t1->fresh()->current_stage);
        $this->assertSame('keuangan', $t2->fresh()->current_stage);

        $kontribusi = $po->poDetail->pluck('kuantum_kontribusi', 'transaksi_id');
        $this->assertSame('100.00', $kontribusi[$t1->id_transaksi]);
        $this->assertSame('50.00', $kontribusi[$t2->id_transaksi]);
    }

    /**
     * PO yang lahir langsung berstatus 'dibatalkan' sengaja menahan transaksinya di tahap
     * Pengadaan supaya bisa digabung ulang. Kalau baris po_detail-nya ikut ditinggalkan,
     * transaksi itu akan jadi anggota DUA PO setelah digabung ulang — melanggar asumsi
     * "satu transaksi paling banyak satu PO" yang dipakai pengurutan rekap (kunci grup =
     * id_transaksi terkecil antar anggota PO) maupun kolom No. PO di tabel. Jalur
     * pembatalan yang normal di PengadaanController::update() memang sudah menghapusnya.
     */
    public function test_gabungkan_po_yang_langsung_dibatalkan_tidak_meninggalkan_po_detail(): void
    {
        $t1 = $this->transaksiMppSampaiPengadaan('PEMASOK-B', '2026-07-11', 80);
        $t2 = $this->transaksiMppSampaiPengadaan('PEMASOK-B', '2026-07-11', 20);

        $po = app(PoGroupingService::class)->gabungkanPo(
            [$t1->id_transaksi, $t2->id_transaksi],
            'PO-BATAL-001',
            $this->pengadaan,
            null,
            'dibatalkan'
        );

        $this->assertSame('dibatalkan', $po->status);
        // Transaksi tetap di Pengadaan supaya bisa digabung ulang.
        $this->assertSame('pengadaan', $t1->fresh()->current_stage);
        $this->assertSame('pengadaan', $t2->fresh()->current_stage);

        // Tapi keanggotaan PO-nya tidak boleh tertinggal.
        $this->assertCount(0, PoDetail::where('data_pengadaan_id', $po->id)->get());
        $this->assertCount(0, PoDetail::where('transaksi_id', $t1->id_transaksi)->get());
        $this->assertCount(0, PoDetail::where('transaksi_id', $t2->id_transaksi)->get());
    }

    /**
     * Konsekuensi langsung dari test di atas: setelah PO batal, transaksi bisa digabung
     * ulang dan hanya menjadi anggota PO yang baru — bukan dua-duanya.
     */
    public function test_transaksi_dari_po_batal_hanya_jadi_anggota_po_penggantinya(): void
    {
        $t1 = $this->transaksiMppSampaiPengadaan('PEMASOK-C', '2026-07-12', 60);

        app(PoGroupingService::class)->gabungkanPo(
            [$t1->id_transaksi],
            'PO-BATAL-002',
            $this->pengadaan,
            null,
            'dibatalkan'
        );

        $poBaru = app(PoGroupingService::class)->gabungkanPo(
            [$t1->id_transaksi],
            'PO-GANTI-002',
            $this->pengadaan
        );

        $detail = PoDetail::where('transaksi_id', $t1->id_transaksi)->get();
        $this->assertCount(1, $detail);
        $this->assertSame($poBaru->id, $detail->first()->data_pengadaan_id);
    }

    public function test_gabungkan_po_menolak_transaksi_dengan_kelompok_berbeda(): void
    {
        $t1 = $this->transaksiMppSampaiPengadaan('PEMASOK-A', '2026-07-10', 100);
        $t2 = $this->transaksiMppSampaiPengadaan('PEMASOK-B', '2026-07-10', 50);

        $this->expectException(HttpException::class);

        app(PoGroupingService::class)->gabungkanPo(
            [$t1->id_transaksi, $t2->id_transaksi],
            'PO-TEST-002',
            $this->pengadaan
        );
    }

    public function test_gabungkan_po_menolak_transaksi_yang_belum_sampai_tahap_pengadaan(): void
    {
        $transaksi = $this->stageService->createTransaksi($this->makloon);
        $this->stageService->submitStage($transaksi, $this->makloon, 'makloon', DataMakloonMpp::class, $this->dataMakloonMpp('PEMASOK-A', '2026-07-10', 100));

        $this->expectException(HttpException::class);

        app(PoGroupingService::class)->gabungkanPo(
            [$transaksi->id_transaksi],
            'PO-TEST-003',
            $this->pengadaan
        );
    }

    public function test_gabungkan_po_skema_tjp_mengambil_field_dari_tabel_yang_benar(): void
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-TJP',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 XYZ',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => '2026-07-09',
            'kuantum' => 999, // kuantum JP tidak boleh dipakai di PO (field tersembunyi)
            'jarak_ke_makloon_km' => 5,
        ]);

        $this->stageService->terima($transaksi->fresh(), $this->makloon);
        $this->stageService->submitStage($transaksi->fresh(), $this->makloon, 'makloon', DataMakloonTjp::class, [
            'tanggal_bongkar' => '2026-07-10',
            'kuantum_bongkar' => 80,
        ]);

        $this->stageService->terima($transaksi->fresh(), $this->ubJastasma);
        $this->stageService->submitStage($transaksi->fresh(), $this->ubJastasma, 'ub_jastasma', DataUbJastasma::class, $this->dataUbJastasma());

        $this->stageService->terima($transaksi->fresh(), $this->pengadaan);

        $po = app(PoGroupingService::class)->gabungkanPo(
            [$transaksi->fresh()->id_transaksi],
            'PO-TEST-004',
            $this->pengadaan
        );

        $this->assertSame('PEMASOK-TJP', $po->id_pemasok);
        $this->assertSame($this->makloon->id, $po->makloon_user_id);
        $this->assertSame('80.00', $po->total_kuantum);
        $this->assertSame('2026-07-10', $po->tanggal_bongkar->format('Y-m-d'));
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function dataMakloonMpp(string $idPemasok, string $tanggalBongkar, float $kuantum): array
    {
        return [
            'id_pemasok' => $idPemasok,
            'supir' => 'Supir',
            'plat_mobil' => 'B 1234 XYZ',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => $tanggalBongkar,
            'kuantum' => $kuantum,
            'jarak_ke_makloon_km' => 5,
        ];
    }

    private function dataUbJastasma(): array
    {
        return [
            'ka1' => 12.5,
            'ka2' => 12.6,
            'ka3' => 12.7,
            'hampa' => 1.2,
            'butir_hijau' => 0.5,
        ];
    }

    private function transaksiMppSampaiPengadaan(string $idPemasok, string $tanggalBongkar, float $kuantum): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->makloon);

        $this->stageService->submitStage($transaksi, $this->makloon, 'makloon', DataMakloonMpp::class, $this->dataMakloonMpp($idPemasok, $tanggalBongkar, $kuantum));

        $this->stageService->terima($transaksi->fresh(), $this->ubJastasma);
        $this->stageService->submitStage($transaksi->fresh(), $this->ubJastasma, 'ub_jastasma', DataUbJastasma::class, $this->dataUbJastasma());

        $this->stageService->terima($transaksi->fresh(), $this->pengadaan);

        return $transaksi->fresh();
    }
}
