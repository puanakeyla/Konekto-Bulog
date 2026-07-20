<?php

namespace Tests\Feature;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GudangOptionTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_daftar_opsi_gudang_hanya_user_gudang_aktif(): void
    {
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');
        User::create(['username' => 'g1', 'password' => bcrypt('x'), 'role_id' => $gudangRoleId, 'nama_gudang' => 'Gudang Jaya 1']);
        User::create(['username' => 'g2', 'password' => bcrypt('x'), 'role_id' => $gudangRoleId, 'nama_gudang' => 'Gudang Jaya 2', 'is_active' => false]);
        $operasi = User::create(['username' => 'op', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'operasi')->value('id')]);

        $this->actingAs($operasi)
            ->getJson('/api/gudang-options')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.nama_gudang', 'Gudang Jaya 1');
    }
}
