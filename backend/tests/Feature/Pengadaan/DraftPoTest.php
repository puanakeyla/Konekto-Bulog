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

    public function test_isi_nomor_in_tanpa_no_spp_tetap_draft_dan_tidak_memajukan_tahap(): void
    {
        $po = $this->buatPoBelumLengkap();
        $transaksiId = $po->poDetail->first()->transaksi_id;

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-001'],
        ], null, 'proses');

        $this->assertSame('draft', $po->fresh()->review_status);
        $this->assertSame('pengadaan', Transaksi::find($transaksiId)->current_stage);
    }

    /** No. SPP-lah yang mengirim ke Keuangan; Status Sergab tidak lagi jadi syaratnya. */
    public function test_no_spp_mengirim_ke_keuangan_walau_status_sergab_belum_lengkap(): void
    {
        $po = $this->buatPoBelumLengkap();
        $transaksiId = $po->poDetail->first()->transaksi_id;

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-002'],
        ], 'SPP-002', 'proses');

        $this->assertSame('menunggu_review', $po->fresh()->review_status);

        $transaksi = Transaksi::find($transaksiId);
        $this->assertSame('keuangan', $transaksi->current_stage);
        $this->assertSame('berjalan', $transaksi->status_keseluruhan);
    }

    /** Status Sergab 'lengkap' adalah penutup: transaksinya ditandai selesai. */
    public function test_status_sergab_lengkap_menyelesaikan_transaksi(): void
    {
        $po = $this->buatPoBelumLengkap();
        $transaksiId = $po->poDetail->first()->transaksi_id;

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-003'],
        ], 'SPP-003', 'lengkap');

        $transaksi = Transaksi::find($transaksiId);
        $this->assertSame('keuangan', $transaksi->current_stage);
        $this->assertSame('selesai', $transaksi->status_keseluruhan);
    }

    /**
     * PO yang ditolak Keuangan sudah punya No. SPP, jadi menyimpan perbaikannya langsung
     * mengirim ulang -- tidak singgah di draft. Draft hanya untuk PO yang belum ber-SPP.
     */
    public function test_po_ditolak_yang_disimpan_ulang_langsung_dikirim_lagi(): void
    {
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(1);
        $this->reviewService->tolak($po->fresh(), $this->keuangan, 'Nomor IN salah.');

        $po = $po->fresh();
        $this->assertSame('ditolak', $po->review_status);
        $this->assertSame('pengadaan', Transaksi::find($transaksiIds[0])->current_stage);

        $po = $this->poService->isiNomorIn($po, [
            ['po_detail_id' => $po->poDetail->first()->id, 'no_in' => 'IN-PERBAIKAN'],
        ], null, 'proses');

        $this->assertSame('menunggu_review', $po->fresh()->review_status);
        $this->assertSame('keuangan', Transaksi::find($transaksiIds[0])->current_stage);
    }

    /**
     * Status Sergab adalah langkah terpisah dari pengiriman, jadi PATCH status tidak boleh
     * menyentuh review_status sama sekali -- termasuk mengembalikan PO yang ditolak jadi draft.
     */
    public function test_patch_status_sergab_tidak_menyentuh_review_status(): void
    {
        $po = $this->buatPoBelumLengkap();
        $po->update(['review_status' => 'ditolak']);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->patchJson("/api/po/{$po->id}", [
            'status' => 'kwitansi_belum_upload',
        ]);

        $response->assertOk();
        $this->assertSame('ditolak', $po->fresh()->review_status);
        $this->assertSame('kwitansi_belum_upload', $po->fresh()->status);
    }

    public function test_patch_po_via_http_tidak_mendemosikan_po_yang_sudah_menunggu_review(): void
    {
        // PO ini sudah dikirim ke Keuangan (status='lengkap', review_status='menunggu_review',
        // transaksi anggotanya sudah di current_stage='keuangan'). Kalau di-PATCH dengan status
        // non-lengkap tanpa penjaga, review_status jatuh ke 'draft' padahal current_stage anggotanya
        // tetap 'keuangan' -- PO tersangkut tanpa kartu review/pembayaran apa pun.
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(1);
        $this->assertSame('menunggu_review', $po->fresh()->review_status);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->patchJson("/api/po/{$po->id}", [
            'status' => 'kwitansi_belum_upload',
        ]);

        $response->assertOk();
        $this->assertSame('menunggu_review', $po->fresh()->review_status);
        $this->assertSame('keuangan', Transaksi::find($transaksiIds[0])->current_stage);
    }

    /**
     * PO yang sudah diterima Keuangan terkunci pada isi KONTRAKnya (nomor, harga, pembatalan),
     * tapi Status Sergab harus tetap bisa ditutup Pengadaan -- kalau ikut terkunci, Keuangan yang
     * cepat menerima PO membuat Sergab-nya tidak pernah bisa diselesaikan.
     */
    public function test_po_diterima_masih_bisa_ditutup_sergab_tapi_kontraknya_terkunci(): void
    {
        [$po] = $this->buatPoDikirimKeKeuangan(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        Sanctum::actingAs($this->pengadaan);

        $this->patchJson("/api/po/{$po->id}", ['status' => 'kwitansi_belum_upload'])->assertOk();
        $this->assertSame('kwitansi_belum_upload', $po->fresh()->status);

        $this->patchJson("/api/po/{$po->id}", ['harga' => 7000])->assertStatus(422);
        $this->patchJson("/api/po/{$po->id}", ['status' => 'dibatalkan'])->assertStatus(422);
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
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(1);
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
     * Simpan draft mengirim tanggal_bayar = null. Menulisnya apa adanya akan menghapus tanggal
     * yang sudah tersimpan tanpa diminta.
     */
    public function test_simpan_draft_tanpa_tanggal_tidak_menghapus_tanggal_tersimpan(): void
    {
        [$po] = $this->buatPoDikirimKeKeuangan(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);
        $noSppDariPengadaan = $po->fresh()->no_spp;

        $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', '2026-07-20');

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null);

        $this->assertSame('2026-07-20', $keuangan->tanggal_bayar->format('Y-m-d'));
        // No. SPP milik Pengadaan; jalur pembayaran tidak boleh menyentuhnya.
        $this->assertSame($noSppDariPengadaan, $po->fresh()->no_spp);
    }

    public function test_simpan_pembayaran_belum_bayar_jadi_draft_dan_transaksi_belum_selesai(): void
    {
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);
        $noSppDariPengadaan = $po->fresh()->no_spp;

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null);

        $this->assertSame('draft', $keuangan->review_status);
        $this->assertSame('berjalan', Transaksi::find($transaksiIds[0])->status_keseluruhan);
        $this->assertSame($noSppDariPengadaan, $po->fresh()->no_spp);
    }

    /**
     * Pelunasan mengunci baris Keuangan ('diterima') tapi TIDAK menutup transaksinya:
     * penutupnya Status Sergab dari Pengadaan, yang berjalan paralel dengan pembayaran.
     */
    public function test_tandai_dibayarkan_mengunci_keuangan_tanpa_menyelesaikan_transaksi(): void
    {
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', '2026-07-20');

        $this->assertSame('diterima', $keuangan->review_status);
        $this->assertSame('berjalan', Transaksi::find($transaksiIds[0])->status_keseluruhan);
    }

    public function test_draft_lalu_dibayarkan_mengunci_keuangan(): void
    {
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(1);
        $this->reviewService->terima($po->fresh(), $this->keuangan);

        $draft = $this->lifecycleService->updatePembayaran($po->fresh(), 'belum', null);

        // Buktikan transisi melewati state draft yang sesungguhnya, bukan cuma titik akhirnya --
        // kalau resetReview() di-revert ke 'menunggu_review', assertion ini akan gagal duluan.
        $this->assertSame('draft', $draft->review_status);

        $keuangan = $this->lifecycleService->updatePembayaran($po->fresh(), 'dibayarkan', '2026-07-21');

        $this->assertSame('diterima', $keuangan->review_status);
        $this->assertSame('berjalan', Transaksi::find($transaksiIds[0])->status_keseluruhan);
    }

    /** Penutup transaksi: Status Sergab 'lengkap' dari Pengadaan, terlepas dari pembayaran. */
    public function test_status_sergab_lengkap_menutup_transaksi_walau_belum_dibayar(): void
    {
        [$po, $transaksiIds] = $this->buatPoDikirimKeKeuangan(1);

        Sanctum::actingAs($this->pengadaan);
        $this->patchJson("/api/po/{$po->id}", ['status' => 'lengkap'])->assertOk();

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
     * PO yang sudah diserahkan ke Keuangan: seluruh IN terisi + No. SPP tersimpan. Status Sergab
     * DIBIARKAN 'proses' -- No. SPP yang mengirim, sedangkan Sergab 'lengkap' adalah penutup yang
     * langsung menandai transaksinya selesai.
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
