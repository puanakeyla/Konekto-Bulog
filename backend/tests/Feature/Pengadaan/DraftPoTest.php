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
use Tests\TestCase;

class DraftPoTest extends TestCase
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

    public function test_po_baru_digabung_berstatus_draft(): void
    {
        $po = $this->buatPoBelumLengkap();

        $this->assertSame('draft', $po->fresh()->review_status);
    }

    public function test_isi_nomor_in_tanpa_lengkap_tetap_draft_dan_tidak_memajukan_tahap(): void
    {
        $po = $this->buatPoBelumLengkap();
        $transaksiId = $po->poDetail->first()->transaksi_id;

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-001'],
        ], 'SPP-001', 'proses');

        $this->assertSame('draft', $po->fresh()->review_status);
        $this->assertSame('pengadaan', Transaksi::find($transaksiId)->current_stage);
    }

    public function test_status_lengkap_mengirim_dan_memajukan_ke_keuangan(): void
    {
        $po = $this->buatPoBelumLengkap();
        $transaksiId = $po->poDetail->first()->transaksi_id;

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-002'],
        ], 'SPP-002', 'lengkap');

        $this->assertSame('menunggu_review', $po->fresh()->review_status);
        $this->assertSame('keuangan', Transaksi::find($transaksiId)->current_stage);
    }

    public function test_po_ditolak_yang_disimpan_ulang_kembali_jadi_draft(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->reviewService->tolak($po->fresh(), $this->keuangan, 'Nomor IN salah.');

        $po = $po->fresh();
        $this->assertSame('ditolak', $po->review_status);

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-PERBAIKAN'],
        ], null, 'proses');

        $this->assertSame('draft', $po->fresh()->review_status);
        $this->assertSame('pengadaan', Transaksi::find($transaksiIds[0])->current_stage);
    }

    public function test_patch_po_via_http_dengan_status_belum_lengkap_mengubah_review_status_jadi_draft(): void
    {
        $po = $this->buatPoBelumLengkap();
        // Dipaksa ke 'ditolak' dulu supaya assertion di bawah benar-benar membuktikan
        // cabang draft yang baru, bukan cuma nilai default kolom migrasi.
        $po->update(['review_status' => 'ditolak']);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->patchJson("/api/po/{$po->id}", [
            'status' => 'kwitansi_belum_upload',
        ]);

        $response->assertOk();
        $this->assertSame('draft', $po->fresh()->review_status);
    }

    public function test_patch_po_via_http_tidak_mendemosikan_po_yang_sudah_menunggu_review(): void
    {
        // PO ini sudah dikirim ke Keuangan (status='lengkap', review_status='menunggu_review',
        // transaksi anggotanya sudah di current_stage='keuangan'). Kalau di-PATCH dengan status
        // non-lengkap tanpa penjaga, review_status jatuh ke 'draft' padahal current_stage anggotanya
        // tetap 'keuangan' -- PO tersangkut tanpa kartu review/pembayaran apa pun.
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->assertSame('menunggu_review', $po->fresh()->review_status);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->patchJson("/api/po/{$po->id}", [
            'status' => 'kwitansi_belum_upload',
        ]);

        $response->assertOk();
        $this->assertSame('menunggu_review', $po->fresh()->review_status);
        $this->assertSame('keuangan', Transaksi::find($transaksiIds[0])->current_stage);
    }

    public function test_patch_po_via_http_ditolak_jika_review_status_sudah_diterima(): void
    {
        [$po] = $this->buatPoLengkap(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->patchJson("/api/po/{$po->id}", [
            'status' => 'kwitansi_belum_upload',
        ]);

        $response->assertStatus(422);
        $this->assertSame('diterima', $po->fresh()->review_status);
    }

    /**
     * Lubang yang bisa dicapai lewat rantai dua request API: update() menurunkan status Sergab
     * jadi bukan-lengkap (tanpa memindahkan tahap), lalu isiNomorIn() melewati penjaga di awalnya
     * karena status sudah bukan 'lengkap'. Tanpa pengecualian 'menunggu_review' di isiNomorIn(),
     * PO turun jadi draft sementara transaksinya tertinggal di tahap Keuangan -- tersangkut.
     */
    public function test_isi_nomor_in_tidak_mendemosikan_po_yang_sudah_dikirim(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->assertSame('menunggu_review', $po->fresh()->review_status);
        $this->assertSame('keuangan', Transaksi::find($transaksiIds[0])->current_stage);

        // Langkah pertama rantai: status Sergab diturunkan, review_status ditahan penjaga update().
        Sanctum::actingAs($this->pengadaan);
        $this->patchJson("/api/po/{$po->id}", ['status' => 'kwitansi_belum_upload'])->assertOk();
        $this->assertSame('menunggu_review', $po->fresh()->review_status);

        // Langkah kedua: jalur yang dulu masih bocor.
        $po = $this->poService->isiNomorIn($po->fresh(), [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-RANTAI'],
        ], null, 'kwitansi_belum_upload');

        $this->assertSame('menunggu_review', $po->fresh()->review_status);
        $this->assertSame('keuangan', Transaksi::find($transaksiIds[0])->current_stage);
    }

    /**
     * Simpan draft yang hanya mengubah No. SPP mengirim tanggal_bayar = null. Menulisnya apa
     * adanya akan menghapus tanggal yang sudah tersimpan tanpa diminta.
     */
    public function test_simpan_draft_tanpa_tanggal_tidak_menghapus_tanggal_tersimpan(): void
    {
        [$po] = $this->buatPoLengkap(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', '2026-07-20', 'SPP-A');

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null, 'SPP-B');

        $this->assertSame('2026-07-20', $keuangan->tanggal_bayar->format('Y-m-d'));
        $this->assertSame('SPP-B', $po->fresh()->no_spp);
    }

    public function test_simpan_pembayaran_belum_bayar_jadi_draft_dan_transaksi_belum_selesai(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null, 'SPP-DRAFT');

        $this->assertSame('draft', $keuangan->review_status);
        $this->assertSame('berjalan', Transaksi::find($transaksiIds[0])->status_keseluruhan);
        $this->assertSame('SPP-DRAFT', $po->fresh()->no_spp);
    }

    // Beda dengan test_pembayaran_sukses_set_no_spp_dan_menyelesaikan_transaksi di PoLifecycleTest:
    // test itu tidak pernah mengasersi DataKeuangan::review_status, hanya status_bayar/no_spp/stage.
    public function test_tandai_dibayarkan_tetap_menyelesaikan_transaksi(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', '2026-07-20', 'SPP-LUNAS');

        $this->assertSame('diterima', $keuangan->review_status);
        $this->assertSame('selesai', Transaksi::find($transaksiIds[0])->status_keseluruhan);
    }

    public function test_draft_lalu_dibayarkan_tetap_menyelesaikan_transaksi(): void
    {
        [$po, $transaksiIds] = $this->buatPoLengkap(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $draft = $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null, 'SPP-X');

        // Buktikan transisi melewati state draft yang sesungguhnya, bukan cuma titik akhirnya --
        // kalau resetReview() di-revert ke 'menunggu_review', assertion ini akan gagal duluan.
        $this->assertSame('draft', $draft->review_status);
        $this->assertSame('berjalan', Transaksi::find($transaksiIds[0])->status_keseluruhan);

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', '2026-07-21', 'SPP-X');

        $this->assertSame('diterima', $keuangan->review_status);
        $this->assertSame('selesai', Transaksi::find($transaksiIds[0])->status_keseluruhan);
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

        // Tahap "Makloon Terima" (MPP) dikerjakan makloon sendiri, bukan UB Jastasma.
        $this->stageService->terima($transaksi->fresh(), $this->makloon);
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
        $t1 = $this->transaksiSampaiPengadaan('PEMASOK-'.uniqid(), '2026-07-10', 100);

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

        $po = $this->poService->isiNomorIn($po, $items, 'SPP-'.uniqid(), 'lengkap');

        return [$po, $transaksiIds];
    }
}
