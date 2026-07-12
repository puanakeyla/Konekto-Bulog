<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\Role;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RiwayatPenolakanTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $jemputPangan;

    private User $makloon;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->makloon = $this->buatUser('makloon');
    }

    public function test_tolak_tiga_kali_menyimpan_tiga_baris_riwayat_penolakan(): void
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        foreach (['Catatan pertama', 'Catatan kedua', 'Catatan ketiga'] as $index => $catatan) {
            $this->stageService->submitStage($transaksi->fresh(), $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
                'id_pemasok' => 'PEMASOK-'.$index,
                'supir' => 'Supir',
                'plat_mobil' => 'B 1 XYZ',
                'nama_poktan_gapoktan' => 'Poktan',
                'desa' => 'Desa',
                'kecamatan' => 'Kecamatan',
                'kabupaten' => 'Kabupaten',
                'makloon_user_id' => $this->makloon->id,
                'tanggal_kirim' => '2026-07-09',
                'kuantum' => 100 + $index,
                'jarak_ke_makloon_km' => 5,
            ]);

            $this->stageService->tolak($transaksi->fresh(), $this->makloon, $catatan);
        }

        $this->assertDatabaseCount('riwayat_penolakan', 3);
        $this->assertDatabaseHas('data_jemput_pangan', [
            'transaksi_id' => $transaksi->id_transaksi,
            'status' => 'ditolak',
            'catatan_penolakan' => 'Catatan ketiga',
        ]);

        $this->assertSame(
            ['Catatan pertama', 'Catatan kedua', 'Catatan ketiga'],
            DB::table('riwayat_penolakan')->orderBy('id')->pluck('catatan')->all()
        );
    }

    public function test_detail_transaksi_memuat_riwayat_penolakan(): void
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);
        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-RIW',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 XYZ',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => '2026-07-09',
            'kuantum' => 100,
            'jarak_ke_makloon_km' => 5,
        ]);
        $this->stageService->tolak($transaksi->fresh(), $this->makloon, 'Kurang jelas');

        Sanctum::actingAs($this->jemputPangan);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}");

        $response->assertOk();
        $response->assertJsonPath('data.riwayat_penolakan.0.tahap', 'jemput_pangan');
        $response->assertJsonPath('data.riwayat_penolakan.0.catatan', 'Kurang jelas');
        $response->assertJsonPath('data.riwayat_penolakan.0.ditolak_oleh', $this->makloon->id);
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
