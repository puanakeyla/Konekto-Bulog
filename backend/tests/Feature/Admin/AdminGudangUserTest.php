<?php

namespace Tests\Feature\Admin;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AdminGudangUserTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function admin(): User
    {
        return User::create([
            'username' => 'admin_'.uniqid(),
            'password' => bcrypt('secret12'),
            'role_id' => Role::where('nama_role', 'admin')->value('id'),
        ]);
    }

    public function test_buat_user_gudang_wajib_nama_gudang(): void
    {
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');

        $this->actingAs($this->admin())
            ->postJson('/api/admin/users', [
                'username' => 'gudang_jaya_1',
                'password' => 'rahasia12',
                'password_confirmation' => 'rahasia12',
                'role_id' => $gudangRoleId,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('nama_gudang');
    }

    public function test_buat_user_gudang_dengan_nama_gudang_berhasil(): void
    {
        $gudangRoleId = Role::where('nama_role', 'gudang')->value('id');

        $this->actingAs($this->admin())
            ->postJson('/api/admin/users', [
                'username' => 'gudang_jaya_1',
                'password' => 'rahasia12',
                'password_confirmation' => 'rahasia12',
                'role_id' => $gudangRoleId,
                'nama_gudang' => 'Gudang Jaya 1',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.nama_gudang', 'Gudang Jaya 1');
    }

    public function test_nama_gudang_dikosongkan_untuk_role_non_gudang(): void
    {
        $operasiRoleId = Role::where('nama_role', 'operasi')->value('id');

        $this->actingAs($this->admin())
            ->postJson('/api/admin/users', [
                'username' => 'operasi_1',
                'password' => 'rahasia12',
                'password_confirmation' => 'rahasia12',
                'role_id' => $operasiRoleId,
                'nama_gudang' => 'Bukan Gudang',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.nama_gudang', null);
    }
}
