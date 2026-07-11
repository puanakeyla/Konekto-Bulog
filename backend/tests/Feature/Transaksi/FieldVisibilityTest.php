<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class FieldVisibilityTest extends TestCase
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

    public function test_kuantum_jemput_pangan_tersembunyi_untuk_ub_jastasma(): void
    {
        $transaksi = $this->buatTransaksiTjpDenganKuantum(123.45);

        Sanctum::actingAs($this->buatUser('ub_jastasma'));
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}");

        $response->assertOk();
        $response->assertJsonMissingPath('data.data_jemput_pangan.kuantum');
    }

    public function test_kuantum_jemput_pangan_tersembunyi_untuk_pengadaan_keuangan_operasi_gudang(): void
    {
        $transaksi = $this->buatTransaksiTjpDenganKuantum(50);

        foreach (['pengadaan', 'keuangan', 'operasi', 'gudang'] as $role) {
            Sanctum::actingAs($this->buatUser($role));
            $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}");

            $response->assertOk();
            $response->assertJsonMissingPath('data.data_jemput_pangan.kuantum');
        }
    }

    public function test_kuantum_jemput_pangan_tetap_terlihat_untuk_admin(): void
    {
        $transaksi = $this->buatTransaksiTjpDenganKuantum(77.5);

        Sanctum::actingAs($this->buatUser('admin'));
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}");

        $response->assertOk();
        $response->assertJsonPath('data.data_jemput_pangan.kuantum', '77.50');
    }

    public function test_kuantum_jemput_pangan_tetap_terlihat_untuk_jemput_pangan_dan_makloon(): void
    {
        $transaksi = $this->buatTransaksiTjpDenganKuantum(88);

        Sanctum::actingAs($this->jemputPangan);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}");
        $response->assertJsonPath('data.data_jemput_pangan.kuantum', '88.00');

        Sanctum::actingAs($this->makloon);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}");
        $response->assertJsonPath('data.data_jemput_pangan.kuantum', '88.00');
    }

    public function test_field_lain_data_jemput_pangan_tetap_terlihat_untuk_ub_jastasma(): void
    {
        $transaksi = $this->buatTransaksiTjpDenganKuantum(10);

        Sanctum::actingAs($this->buatUser('ub_jastasma'));
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}");

        $response->assertJsonPath('data.data_jemput_pangan.id_pemasok', 'PEMASOK-VIS');
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function buatTransaksiTjpDenganKuantum(float $kuantum): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-VIS',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 XYZ',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => '2026-07-09',
            'kuantum' => $kuantum,
            'jarak_ke_makloon_km' => 5,
        ]);

        return $transaksi->fresh();
    }
}
