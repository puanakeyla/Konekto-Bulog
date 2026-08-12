<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataKeuangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTerima;
use App\Models\DataMakloonTjp;
use App\Models\DataPengadaan;
use App\Models\DataUbJastasma;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RekapTerkunciTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $jemputPangan;

    private User $makloon;

    private User $ubJastasma;

    private User $pengadaan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->makloon = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
        // Role berikutnya setelah ub_jastasma dalam sequence -- dibutuhkan untuk
        // memanggil terima() saat mengunci tahap UB Jastasma.
        $this->pengadaan = $this->buatUser('pengadaan');
    }

    public function test_jemput_pangan_hanya_melihat_transaksi_yang_tahap_jp_sudah_terkunci(): void
    {
        $terkunci = $this->buatTjpDenganJpTerkunci();
        $belumTerkunci = $this->stageService->createTransaksi($this->jemputPangan);

        Sanctum::actingAs($this->jemputPangan);

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($terkunci->id_transaksi, $ids);
        $this->assertNotContains($belumTerkunci->id_transaksi, $ids);
    }

    public function test_makloon_hanya_melihat_transaksi_yang_tahap_makloon_sudah_terkunci(): void
    {
        // TJP: JP terkunci tapi Makloon belum -> tidak boleh muncul untuk role makloon.
        $makloonBelum = $this->buatTjpDenganJpTerkunci();

        // MPP: Makloon sudah terkunci -> harus muncul.
        $makloonSudah = $this->buatMppDenganMakloonTerkunci();

        Sanctum::actingAs($this->makloon);

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($makloonSudah->id_transaksi, $ids);
        $this->assertNotContains($makloonBelum->id_transaksi, $ids);
    }

    public function test_admin_melihat_transaksi_yang_tahap_awalnya_sudah_terkunci(): void
    {
        $tjpTerkunci = $this->buatTjpDenganJpTerkunci();
        $mppTerkunci = $this->buatMppDenganMakloonTerkunci();
        $belumApaApa = $this->stageService->createTransaksi($this->jemputPangan);

        Sanctum::actingAs($this->buatUser('admin'));

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($tjpTerkunci->id_transaksi, $ids);
        $this->assertContains($mppTerkunci->id_transaksi, $ids);
        $this->assertNotContains($belumApaApa->id_transaksi, $ids);
    }

    public function test_ub_jastasma_hanya_melihat_transaksi_yang_tahap_ub_sudah_terkunci(): void
    {
        $terkunci = $this->buatMppDenganUbTerkunci();
        // Tahap UB sudah diajukan tapi belum diterima Pengadaan -> masih menunggu_review.
        $belumTerkunci = $this->buatMppDenganUbDiajukan();

        Sanctum::actingAs($this->ubJastasma);

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($terkunci->id_transaksi, $ids);
        $this->assertNotContains($belumTerkunci->id_transaksi, $ids);
    }

    /**
     * Keluhan yang dilaporkan: "PO 25-27, di bawahnya 30, eh tiba-tiba ada 24."
     *
     * Blok PO dulu diurutkan menurut id_transaksi terkecil anggotanya, yang tidak punya
     * hubungan apa pun dengan tanggal -- jadi blok tersusun menurut urutan pembuatan, bukan
     * waktu kejadian. Sekarang kuncinya tanggal TERAWAL dalam satu PO.
     */
    public function test_blok_po_tersusun_menurut_tanggal_terawal_anggotanya(): void
    {
        // Dibuat dengan urutan yang SENGAJA berlawanan dengan urutan tanggalnya: kalau kunci
        // urutnya masih id terkecil, hasilnya persis keluhan di atas (25-27, 30, lalu 24).
        $x1 = $this->buatTjpDenganJpTerkunci('2026-07-25');
        $x2 = $this->buatTjpDenganJpTerkunci('2026-07-27');
        $y = $this->buatTjpDenganJpTerkunci('2026-07-30');
        $z = $this->buatTjpDenganJpTerkunci('2026-07-24');

        $this->pasangPo('PO-X', [$x1->id_transaksi, $x2->id_transaksi]);
        $this->pasangPo('PO-Y', [$y->id_transaksi]);
        $this->pasangPo('PO-Z', [$z->id_transaksi]);

        Sanctum::actingAs($this->buatUser('admin'));
        $ids = collect($this->getJson('/api/transaksi/rekap')->assertOk()->json('data'))->pluck('id_transaksi')->all();

        $this->assertSame([
            $z->id_transaksi,   // PO-Z, 24 Jul -- blok paling awal walau dibuat paling akhir
            $x1->id_transaksi,  // PO-X, 25 Jul
            $x2->id_transaksi,  // PO-X, 27 Jul -- anggota kedua, tetap berdampingan
            $y->id_transaksi,   // PO-Y, 30 Jul
        ], $ids);
    }

    public function test_urutan_rekap_adalah_skema_lalu_kelompok_po_lalu_id_transaksi(): void
    {
        // Enam TJP dan satu MPP, semuanya terkunci di tahap awal supaya lolos filter admin.
        $tjpA = $this->buatTjpDenganJpTerkunci();
        $tjpB = $this->buatTjpDenganJpTerkunci();
        $tjpMultiA = $this->buatTjpDenganJpTerkunci();
        $tjpMultiB = $this->buatTjpDenganJpTerkunci();
        $tjpTanpaPo = $this->buatTjpDenganJpTerkunci();
        $mpp = $this->buatMppDenganMakloonTerkunci();

        // no_po sengaja dipasang BERLAWANAN arah dengan urutan id_transaksi: "PO-900" (besar
        // secara alfabetis) dipasangkan ke tjpA yang id-nya lebih kecil, "PO-100" (kecil
        // secara alfabetis) dipasangkan ke tjpB yang id-nya lebih besar. Kalau pengurutan
        // masih memakai no_po, tjpB akan nongol duluan walau id-nya lebih besar -- persis
        // defect "ID Transaksi belum urut" yang dilaporkan.
        $this->pasangPo('PO-900', [$tjpA->id_transaksi]);
        $this->pasangPo('PO-100', [$tjpB->id_transaksi]);

        // PO beranggota dua transaksi: membuktikan baris-barisnya tetap berdampingan
        // (prasyarat sel gabungan di frontend) walau kunci urut sekarang id minimum
        // dalam grup, bukan no_po itu sendiri.
        $this->pasangPo('PO-500', [$tjpMultiA->id_transaksi, $tjpMultiB->id_transaksi]);

        Sanctum::actingAs($this->buatUser('admin'));

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertSame([
            $tjpA->id_transaksi,       // TJP, PO-900 -- id terkecil di grupnya walau no_po "besar" alfabetis
            $tjpB->id_transaksi,       // TJP, PO-100 -- no_po "kecil" alfabetis tapi id lebih besar dari tjpA
            $tjpMultiA->id_transaksi,  // TJP, PO-500 (anggota pertama)
            $tjpMultiB->id_transaksi,  // TJP, PO-500 (anggota kedua) -- berdampingan dengan tjpMultiA
            $tjpTanpaPo->id_transaksi, // TJP, tanpa PO -> id sendiri jadi kunci urut
            $mpp->id_transaksi,        // MPP
        ], $ids);

        // Anggota PO-500 harus benar-benar berdampingan (selisih posisi 1), bukan cuma
        // kebetulan cocok dengan urutan penuh di atas.
        $posisiMultiA = array_search($tjpMultiA->id_transaksi, $ids);
        $posisiMultiB = array_search($tjpMultiB->id_transaksi, $ids);
        $this->assertSame(1, abs($posisiMultiA - $posisiMultiB));
    }

    /**
     * Buat PO minimal lalu kaitkan transaksi-transaksi ke dalamnya lewat po_detail.
     * `$reviewStatus` mengendalikan apakah tahap Pengadaan dianggap terkunci.
     */
    private function pasangPo(string $noPo, array $transaksiIds, string $reviewStatus = 'menunggu_review'): DataPengadaan
    {
        $dataPengadaan = DataPengadaan::create([
            'tanggal_bongkar' => '2026-07-10',
            'id_pemasok' => 'PEMASOK-PO',
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => '100.00',
            'harga' => '6500.00',
            'total_harga' => '650000.00',
            'no_po' => $noPo,
            'status' => 'proses',
            'review_status' => $reviewStatus,
        ]);

        foreach ($transaksiIds as $id) {
            PoDetail::create([
                'data_pengadaan_id' => $dataPengadaan->id,
                'transaksi_id' => $id,
                'kuantum_kontribusi' => '100.00',
            ]);
        }

        return $dataPengadaan;
    }

    public function test_pengadaan_hanya_melihat_transaksi_yang_po_nya_sudah_diterima_keuangan(): void
    {
        $poDiterima = $this->buatTjpDenganJpTerkunci();
        $poMenunggu = $this->buatTjpDenganJpTerkunci();
        $tanpaPo = $this->buatTjpDenganJpTerkunci();

        $this->pasangPo('PO-100', [$poDiterima->id_transaksi], 'diterima');
        $this->pasangPo('PO-200', [$poMenunggu->id_transaksi], 'menunggu_review');

        Sanctum::actingAs($this->buatUser('pengadaan'));

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($poDiterima->id_transaksi, $ids);
        $this->assertNotContains($poMenunggu->id_transaksi, $ids);
        $this->assertNotContains($tanpaPo->id_transaksi, $ids);
    }

    /**
     * Keuangan adalah tahap TERAKHIR: tidak ada role yang mereviewnya. `review_status = 'diterima'`
     * di data_keuangan dipasang sendiri oleh updatePembayaran() saat status_bayar jadi 'dibayarkan',
     * jadi artinya "pembayaran sudah difinalisasi", bukan "sudah diterima Operasi".
     */
    public function test_keuangan_hanya_melihat_transaksi_yang_pembayarannya_sudah_difinalisasi(): void
    {
        $bayarDiterima = $this->buatTjpDenganJpTerkunci();
        $bayarMenunggu = $this->buatTjpDenganJpTerkunci();

        $poDiterima = $this->pasangPo('PO-300', [$bayarDiterima->id_transaksi], 'diterima');
        $poMenunggu = $this->pasangPo('PO-400', [$bayarMenunggu->id_transaksi], 'diterima');

        DataKeuangan::create([
            'data_pengadaan_id' => $poDiterima->id,
            'status_bayar' => 'dibayarkan',
            'tanggal_bayar' => '2026-07-15',
            'review_status' => 'diterima',
        ]);
        DataKeuangan::create([
            'data_pengadaan_id' => $poMenunggu->id,
            'status_bayar' => 'dibayarkan',
            'tanggal_bayar' => '2026-07-15',
            'review_status' => 'menunggu_review',
        ]);

        Sanctum::actingAs($this->buatUser('keuangan'));

        $response = $this->getJson('/api/transaksi/rekap');

        $response->assertOk();
        $ids = collect($response->json('data'))->pluck('id_transaksi')->all();

        $this->assertContains($bayarDiterima->id_transaksi, $ids);
        $this->assertNotContains($bayarMenunggu->id_transaksi, $ids);
    }

    /** TJP dengan tahap Jemput Pangan sudah diterima Makloon (= terkunci). */
    private function buatTjpDenganJpTerkunci(string $tanggalKirim = '2026-07-09'): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-'.uniqid(),
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 XYZ',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => $tanggalKirim,
            'kuantum' => 100,
            'jarak_ke_makloon_km' => 5,
        ]);

        $this->stageService->terima($transaksi->fresh(), $this->makloon);

        return $transaksi->fresh();
    }

    /** MPP dengan tahap Makloon sudah diterima UB Jastasma (= terkunci). */
    private function buatMppDenganMakloonTerkunci(): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->makloon);

        $this->stageService->submitStage($transaksi, $this->makloon, 'makloon', DataMakloonMpp::class, [
            'id_pemasok' => 'PEMASOK-'.uniqid(),
            'supir' => 'Supir',
            'plat_mobil' => 'B 2 ABC',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => '2026-07-10',
            'kuantum' => 200,
            'jarak_ke_makloon_km' => 7,
        ]);

        // Makloon Terima kini tahap berdata sendiri: makloon menerima data Kirim, MENGISI hasil
        // timbang, lalu mengirimnya -- baru setelah itu UB Jastasma yang memeriksanya.
        $this->stageService->terima($transaksi->fresh(), $this->makloon);
        $this->stageService->submitStage($transaksi->fresh(), $this->makloon, 'makloon_terima', DataMakloonTerima::class, ['kuantum_bongkar' => 980]);
        $this->stageService->terima($transaksi->fresh(), $this->ubJastasma);

        return $transaksi->fresh();
    }

    /** MPP dengan tahap UB Jastasma sudah diajukan tapi belum diterima Pengadaan (belum terkunci). */
    private function buatMppDenganUbDiajukan(): Transaksi
    {
        $transaksi = $this->buatMppDenganMakloonTerkunci();

        $this->stageService->submitStage($transaksi, $this->ubJastasma, 'ub_jastasma', DataUbJastasma::class, [
            'ka1' => 10,
            'ka2' => 11,
            'ka3' => 12,
            'hampa' => 1,
            'butir_hijau' => 1,
        ]);

        return $transaksi->fresh();
    }

    /** MPP dengan tahap UB Jastasma sudah diterima Pengadaan (= terkunci). */
    private function buatMppDenganUbTerkunci(): Transaksi
    {
        $transaksi = $this->buatMppDenganUbDiajukan();

        $this->stageService->terima($transaksi, $this->pengadaan);

        return $transaksi->fresh();
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }
}
