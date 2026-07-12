<?php

namespace Tests\Feature\Monitoring;

use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MonitoringTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_sebaran_tahap_tetap_ok_meski_ada_tahap_tanpa_transaksi(): void
    {
        // Hanya ada satu transaksi di tahap jemput_pangan -- semua tahap lain berjumlah 0.
        // Regression guard: tahap kosong (lookup null) harus tetap menghasilkan total 0,
        // bukan error saat membaca properti pada null.
        Transaksi::create([
            'id_transaksi' => '00001/07/2026/TJP',
            'skema' => 'TJP',
            'current_stage' => 'jemput_pangan',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->buatUser('jemput_pangan')->id,
        ]);

        Sanctum::actingAs($this->buatUser('pengadaan'));
        $response = $this->getJson('/api/monitoring/sebaran-tahap');

        $response->assertOk();
        $response->assertJsonPath('data.0.skema', 'TJP');
        // Tahap pertama TJP punya 1 transaksi, tahap-tahap kosong harus bernilai 0 (bukan error).
        $response->assertJsonPath('data.0.stages.0.total', 1);
        $response->assertJsonPath('data.0.stages.1.total', 0);
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
