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

        $this->lifecycleService->updatePembayaran($po, 'dibayarkan', '2026-07-12');
    }

    public function test_pembayaran_sukses_mengunci_baris_keuangan_tanpa_menyentuh_no_spp(): void
    {
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(2);
        $noSppDariPengadaan = $po->fresh()->no_spp;

        $dataKeuangan = $this->bayarPo($po, '2026-07-12');

        $this->assertSame('dibayarkan', $dataKeuangan->status_bayar);
        $this->assertSame('2026-07-12', $dataKeuangan->tanggal_bayar->format('Y-m-d'));
        // No. SPP milik Pengadaan; pembayaran tidak boleh menimpanya.
        $this->assertSame($noSppDariPengadaan, $po->fresh()->no_spp);

        // Keuangan tahap terakhir, jadi current_stage berhenti di sini. Tapi pelunasan TIDAK
        // menutup transaksi -- penutupnya Status Sergab 'lengkap' dari Pengadaan.
        foreach ($transaksiIds as $id) {
            $transaksi = Transaksi::find($id);
            $this->assertSame('berjalan', $transaksi->status_keseluruhan);
            $this->assertSame('keuangan', $transaksi->current_stage);
        }
    }

    public function test_pembayaran_ulang_setelah_lunas_ditolak_guard(): void
    {
        [$po] = $this->buatPoDikirimKeKeuangan(1);

        $this->bayarPo($po, '2026-07-12');

        // Data Keuangan yang sudah 'diterima' tidak bisa dibayar ulang: guard di
        // updatePembayaran menolaknya (tidak ada efek samping ganda seperti dobel-advance
        // stage di skema lama).
        $this->expectException(HttpException::class);
        $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', '2026-07-12');
    }

    public function test_patch_pembayaran_via_http_ditolak_untuk_role_selain_keuangan(): void
    {
        [$po] = $this->buatPoDikirimKeKeuangan(1);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->patchJson("/api/po/{$po->id}/pembayaran", [
            'status_bayar' => 'dibayarkan',
            'tanggal_bayar' => '2026-07-12',
        ]);

        $response->assertForbidden();
    }

    public function test_patch_pembayaran_via_http_sukses(): void
    {
        [$po] = $this->buatPoDikirimKeKeuangan(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);
        $noSppDariPengadaan = $po->fresh()->no_spp;

        Sanctum::actingAs($this->keuangan);

        $response = $this->patchJson("/api/po/{$po->id}/pembayaran", [
            'status_bayar' => 'dibayarkan',
            'tanggal_bayar' => '2026-07-12',
            // Dikirim sengaja: endpoint ini tidak lagi menerima no_spp, jadi harus diabaikan.
            // Mengunci input di UI saja tidak menutup jalan ini.
            'no_spp' => 'SPP-DARI-KEUANGAN',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.status_bayar', 'dibayarkan');
        $this->assertSame($noSppDariPengadaan, $po->fresh()->no_spp);
    }

    /**
     * Pembayaran lunas = pekerjaan Keuangan habis. Transaksinya baru berstatus 'selesai' setelah
     * Pengadaan menutup Sergab, jadi tanpa pengurangan khusus di scopeAntreanRole() PO yang sudah
     * dibayar menggantung di antrean Keuangan dan salah berlabel "Perlu diisi" (tidak ada cabang
     * yang cocok di KerjaanTransaksi::ekspresi(), sehingga jatuh ke ELSE).
     */
    public function test_po_yang_sudah_lunas_keluar_dari_antrean_keuangan(): void
    {
        [$poLunas, $transaksiLunasIds] = $this->buatPoDikirimKeKeuangan(1);
        [, $transaksiBelumIds] = $this->buatPoDikirimKeKeuangan(1);

        $this->bayarPo($poLunas, '2026-07-12');

        // Belum ditutup Pengadaan, jadi transaksinya memang masih berjalan.
        $this->assertSame('berjalan', Transaksi::find($transaksiLunasIds[0])->status_keseluruhan);

        Sanctum::actingAs($this->keuangan);
        $ids = collect($this->getJson('/api/transaksi')->assertOk()->json('data'))->pluck('id_transaksi')->all();

        $this->assertNotContains($transaksiLunasIds[0], $ids);
        $this->assertContains($transaksiBelumIds[0], $ids);
    }

    public function test_transaksi_selesai_tidak_muncul_di_daftar_tindakan_keuangan(): void
    {
        [$poSelesai, $transaksiSelesaiIds] = $this->buatPoDikirimKeKeuangan(1);
        [$poMenunggu, $transaksiMenungguIds] = $this->buatPoDikirimKeKeuangan(1);

        // Yang menutup transaksi adalah Status Sergab 'lengkap' dari Pengadaan, bukan pembayaran.
        Sanctum::actingAs($this->pengadaan);
        $this->patchJson("/api/po/{$poSelesai->id}", ['status' => 'lengkap'])->assertOk();

        $this->assertSame('selesai', Transaksi::find($transaksiSelesaiIds[0])->status_keseluruhan);
        $this->assertSame('berjalan', Transaksi::find($transaksiMenungguIds[0])->status_keseluruhan);

        Sanctum::actingAs($this->keuangan);

        $response = $this->getJson('/api/transaksi');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertNotContains($transaksiSelesaiIds[0], $ids);
        $this->assertContains($transaksiMenungguIds[0], $ids);
        $this->assertSame('keuangan', $poMenunggu->fresh()->poDetail()->first()->transaksi->current_stage);
    }

    /**
     * Jalur yang dipakai UI setelah penolakan: Pengadaan mendarat kembali di langkah SPP (nomor IN
     * tidak hilang) dan menyimpan No. SPP yang SAMA sudah cukup untuk mengirim ulang. Kalau ini
     * pecah, PO yang ditolak tersangkut permanen -- form Sergab hanya mem-PATCH status dan tidak
     * pernah mengembalikan review_status ke 'menunggu_review'.
     */
    public function test_kirim_ulang_setelah_ditolak_cukup_lewat_endpoint_spp(): void
    {
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(1);
        $noSpp = $po->fresh()->no_spp;

        $this->reviewService->tolak($po->fresh(), $this->keuangan, 'Nomor IN salah.');
        $this->assertSame('pengadaan', Transaksi::find($transaksiIds[0])->current_stage);

        // Nomor IN tetap tersimpan, jadi tidak perlu diketik ulang.
        $this->assertNotNull($po->fresh()->poDetail()->first()->no_in);

        Sanctum::actingAs($this->pengadaan);
        $this->patchJson("/api/po/{$po->id}/spp", ['no_spp' => $noSpp])->assertOk();

        $this->assertSame('menunggu_review', $po->fresh()->review_status);
        $this->assertNull($po->fresh()->catatan_penolakan);
        $this->assertSame('keuangan', Transaksi::find($transaksiIds[0])->current_stage);
    }

    public function test_keuangan_tolak_po_lalu_pengadaan_revisi_mengirim_lagi_ke_keuangan(): void
    {
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(1);

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

    private function bayarPo(DataPengadaan $po, string $tanggalBayar)
    {
        if ($po->fresh()->review_status !== 'diterima') {
            $this->reviewService->terima($po->fresh(), $this->keuangan);
        }

        return $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', $tanggalBayar);
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
        $idPemasok = 'PEMASOK-'.uniqid();
        $t1 = $this->transaksiSampaiPengadaan($idPemasok, '2026-07-10', 100);

        return $this->poService->gabungkanPo([$t1->id_transaksi], 'PO-'.uniqid(), $this->pengadaan);
    }

    /**
     * PO yang sudah diserahkan ke Keuangan: seluruh IN terisi + No. SPP tersimpan. Status Sergab
     * DIBIARKAN 'proses' -- No. SPP yang mengirim, sedangkan Sergab 'lengkap' adalah penutup yang
     * langsung menandai transaksinya selesai (dan karenanya tidak cocok untuk fixture pembayaran).
     *
     * @return array{0: DataPengadaan, 1: array<int, string>}
     */
    private function buatPoDikirimKeKeuangan(int $jumlahBaris): array
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

        $po = $this->poService->isiNomorIn($po, $items, 'SPP-'.uniqid());

        return [$po, $transaksiIds];
    }
}
