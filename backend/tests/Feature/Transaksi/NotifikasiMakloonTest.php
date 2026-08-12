<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\Notifikasi;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Notifikasi tidak boleh bocor antar mitra makloon.
 *
 * NotifikasiService memilih penerima dari ROLE. Untuk role internal BULOG itu benar -- datanya
 * memang milik bersama. Untuk makloon tidak: tiap mitra adalah perusahaan yang berdiri sendiri,
 * dan judul/pesan notifikasi memuat nomor transaksi serta catatan penolakan milik mitra lain.
 * Aturan kepemilikannya sudah ada di Transaksi::dimilikiOleh(); berkas ini memastikan
 * NotifikasiService benar-benar memakainya.
 */
class NotifikasiMakloonTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $jemputPangan;

    private User $makloonA;

    private User $makloonB;

    private User $ub;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        $this->stageService = app(TransaksiStageService::class);

        $buat = fn (string $role, array $extra = []) => User::factory()->create([
            'role_id' => Role::where('nama_role', $role)->value('id'),
            ...$extra,
        ]);

        $this->jemputPangan = $buat('jemput_pangan');
        $this->makloonA = $buat('makloon', ['nama_maklon' => 'PT. MAKLOON A']);
        $this->makloonB = $buat('makloon', ['nama_maklon' => 'PT. MAKLOON B']);
        $this->ub = $buat('ub_jastasma');
        $this->admin = $buat('admin');
    }

    private function jumlahNotifikasi(User $user): int
    {
        return Notifikasi::where('user_id', $user->id)->count();
    }

    /** TJP: makloon penerima ditunjuk Jemput Pangan lewat makloon_user_id. */
    public function test_notifikasi_tjp_hanya_ke_makloon_yang_ditunjuk(): void
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-NOTIF',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 NOTIF',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloonA->id,
            'tanggal_kirim' => '2026-08-01',
            'kuantum' => 1000,
            'jarak_ke_makloon_km' => 5,
        ]);

        $this->assertSame(1, $this->jumlahNotifikasi($this->makloonA), 'Makloon yang ditunjuk harus diberi tahu.');
        $this->assertSame(0, $this->jumlahNotifikasi($this->makloonB), 'Makloon lain tidak boleh tahu transaksi ini ada.');
        $this->assertSame(1, $this->jumlahNotifikasi($this->admin), 'Admin tetap memantau semuanya.');
    }

    /** MPP: pemiliknya adalah makloon yang membuat transaksinya sendiri (created_by). */
    public function test_notifikasi_mpp_tidak_bocor_ke_makloon_lain(): void
    {
        $transaksi = $this->stageService->createTransaksi($this->makloonA);

        // Makloon Kirim -> Makloon Terima. Aktornya makloon A sendiri, jadi tanpa penyaringan
        // satu-satunya penerima ber-role makloon adalah makloon B -- persis kebocorannya.
        $this->stageService->submitStage($transaksi, $this->makloonA, 'makloon_kirim', DataMakloonMpp::class, [
            'id_pemasok' => 'PEMASOK-MPP',
            'supir' => 'Supir',
            'plat_mobil' => 'B 2 NOTIF',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => '2026-08-02',
            'kuantum' => 1000,
            'jarak_ke_makloon_km' => 5,
        ]);

        $this->assertSame(0, $this->jumlahNotifikasi($this->makloonB));
        $this->assertSame(1, $this->jumlahNotifikasi($this->admin));
    }

    /** Penolakan memuat catatan -- justru isi yang paling tidak boleh salah alamat. */
    public function test_catatan_penolakan_tidak_sampai_ke_makloon_lain(): void
    {
        $transaksi = $this->transaksiTjpSampaiUb();

        $this->stageService->tolak($transaksi->fresh(), $this->ub, 'Kadar air terlalu tinggi');

        $this->assertSame(0, $this->jumlahNotifikasi($this->makloonB));
        $this->assertGreaterThan(0, $this->jumlahNotifikasi($this->makloonA));
    }

    /** Role internal BULOG tidak ikut tersaring -- pembatasan mereka per-field, bukan per-baris. */
    public function test_role_internal_tetap_menerima_notifikasi_transaksi_makloon_lain(): void
    {
        $sebelum = $this->jumlahNotifikasi($this->ub);

        $this->transaksiTjpSampaiUb();

        $this->assertGreaterThan($sebelum, $this->jumlahNotifikasi($this->ub));
    }

    private function transaksiTjpSampaiUb(): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-TOLAK',
            'supir' => 'Supir',
            'plat_mobil' => 'B 3 NOTIF',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloonA->id,
            'tanggal_kirim' => '2026-08-01',
            'kuantum' => 1000,
            'jarak_ke_makloon_km' => 5,
        ]);
        $this->stageService->terima($transaksi->fresh(), $this->makloonA);

        $this->stageService->submitStage($transaksi->fresh(), $this->makloonA, 'makloon', DataMakloonTjp::class, [
            'tanggal_bongkar' => '2026-08-02',
            'kuantum_bongkar' => 980,
        ]);

        return $transaksi->fresh();
    }
}
