<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonTjp;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\FotoUploadService;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Testing\File;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Mitra makloon adalah perusahaan yang berdiri sendiri: data satu makloon RAHASIA bagi makloon
 * lain. Sebelumnya tidak ada satu pun pengecekan kepemilikan, sehingga Makloon B bisa membaca
 * transaksi Makloon A -- baik dari antrean maupun dengan menebak id_transaksi yang berpola urut.
 *
 * Tiap test di sini menutup satu jalur keluar. Menambah endpoint baru yang mengembalikan
 * transaksi berarti menambah test di sini juga.
 */
class IsolasiMakloonTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private FotoUploadService $fotoService;

    private User $jemputPangan;

    private User $makloonA;

    private User $makloonB;

    private User $ubJastasma;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('foto-transaksi');
        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->fotoService = app(FotoUploadService::class);

        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->makloonA = $this->buatUser('makloon');
        $this->makloonB = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
    }

    public function test_antrean_makloon_b_tidak_memuat_transaksi_makloon_a(): void
    {
        $milikA = $this->transaksiUntuk($this->makloonA);
        $milikB = $this->transaksiUntuk($this->makloonB);

        Sanctum::actingAs($this->makloonB);
        $id = array_column($this->getJson('/api/transaksi')->assertOk()->json('data'), 'id_transaksi');

        $this->assertContains($milikB->id_transaksi, $id);
        $this->assertNotContains($milikA->id_transaksi, $id);
    }

    public function test_detail_transaksi_makloon_a_menjadi_404_bagi_makloon_b(): void
    {
        $milikA = $this->transaksiUntuk($this->makloonA);

        Sanctum::actingAs($this->makloonB);

        // 404, bukan 403: 403 tetap mengonfirmasi transaksi itu ada.
        $this->getJson('/api/transaksi/'.$milikA->id_transaksi)->assertStatus(404);
    }

    public function test_makloon_tetap_bisa_membuka_transaksinya_sendiri(): void
    {
        $milikA = $this->transaksiUntuk($this->makloonA);

        Sanctum::actingAs($this->makloonA);

        $this->getJson('/api/transaksi/'.$milikA->id_transaksi)
            ->assertOk()
            ->assertJsonPath('data.data_jemput_pangan.id_pemasok', 'RAHASIA-A');
    }

    public function test_hitungan_dashboard_makloon_b_tidak_menghitung_transaksi_makloon_a(): void
    {
        $this->transaksiUntuk($this->makloonA);
        $this->transaksiUntuk($this->makloonA);
        $this->transaksiUntuk($this->makloonB);

        Sanctum::actingAs($this->makloonB);
        $antrean = $this->getJson('/api/dashboard/ringkasan')->assertOk()->json('data.antrean');

        // Angka kartu/chip harus ikut disaring; kalau tidak, jumlahnya membocorkan keberadaan
        // transaksi makloon lain walau barisnya tidak pernah tampil.
        $this->assertSame(1, $antrean['total']);
    }

    public function test_foto_transaksi_makloon_a_tidak_bisa_diambil_makloon_b(): void
    {
        $milikA = $this->transaksiUntuk($this->makloonA);
        $this->fotoService->upload($milikA, $this->jemputPangan, 'foto_petani', File::image('petani.jpg'));

        Sanctum::actingAs($this->makloonB);

        $this->getJson('/api/transaksi/'.$milikA->id_transaksi.'/foto')
            ->assertOk()
            ->assertJson(['data' => []]);

        $this->getJson('/api/transaksi/'.$milikA->id_transaksi.'/foto/foto_petani')->assertStatus(404);
    }

    public function test_rekap_makloon_b_tidak_memuat_transaksi_makloon_a(): void
    {
        $milikA = $this->transaksiUntuk($this->makloonA, terkunci: true);
        $milikB = $this->transaksiUntuk($this->makloonB, terkunci: true);

        Sanctum::actingAs($this->makloonB);
        $id = array_column($this->getJson('/api/transaksi/rekap')->assertOk()->json('data'), 'id_transaksi');

        $this->assertContains($milikB->id_transaksi, $id);
        $this->assertNotContains($milikA->id_transaksi, $id);
    }

    public function test_makloon_tidak_melihat_data_tahap_setelah_tahapnya(): void
    {
        $milikA = $this->transaksiUntuk($this->makloonA, terkunci: true);

        // Transaksi sudah lanjut ke UB Jastasma dan datanya terisi.
        $this->stageService->submitStage($milikA->fresh(), $this->ubJastasma, 'ub_jastasma', \App\Models\DataUbJastasma::class, [
            'ka1' => 12.5,
            'ka2' => 12.6,
            'ka3' => 12.7,
            'hampa' => 1.2,
            'butir_hijau' => 0.5,
        ]);

        Sanctum::actingAs($this->ubJastasma);
        $this->assertNotNull(
            $this->getJson('/api/transaksi/'.$milikA->id_transaksi)->json('data.data_ub_jastasma'),
            'Role internal seharusnya tetap melihat data UB Jastasma.'
        );

        Sanctum::actingAs($this->makloonA);
        $detail = $this->getJson('/api/transaksi/'.$milikA->id_transaksi)->assertOk();

        // Miliknya sendiri: tetap bisa dibuka, tapi mentok di tahap Makloon.
        $detail->assertJsonPath('data.data_ub_jastasma', null);
        $detail->assertJsonPath('data.data_pengadaan', null);
        $this->assertNotNull($detail->json('data.data_makloon_tjp'));
    }

    public function test_monitoring_makloon_hanya_untuk_admin(): void
    {
        Sanctum::actingAs($this->makloonB);
        $this->getJson('/api/monitoring/makloon')->assertStatus(403);

        Sanctum::actingAs($this->buatUser('admin'));
        $this->getJson('/api/monitoring/makloon')->assertOk();
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
            'nama_maklon' => $role === 'makloon' ? 'Makloon '.uniqid() : null,
        ]);
    }

    /** Transaksi TJP yang makloon tujuannya $makloon. `terkunci` = tahap Makloon sudah diterima. */
    private function transaksiUntuk(User $makloon, bool $terkunci = false): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'RAHASIA-A',
            'supir' => 'Supir Rahasia',
            'plat_mobil' => 'B 1 RHS',
            'nama_poktan_gapoktan' => 'Poktan Rahasia',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $makloon->id,
            'tanggal_kirim' => '2026-07-11',
            'kuantum' => 12345,
            'jarak_ke_makloon_km' => 5,
        ]);

        if ($terkunci) {
            $this->stageService->terima($transaksi->fresh(), $makloon);
            $this->stageService->submitStage($transaksi->fresh(), $makloon, 'makloon', DataMakloonTjp::class, [
                'tanggal_bongkar' => '2026-07-12',
                'kuantum_bongkar' => 12000,
            ]);
            $this->stageService->terima($transaksi->fresh(), $this->ubJastasma);
        }

        return $transaksi->fresh();
    }
}
