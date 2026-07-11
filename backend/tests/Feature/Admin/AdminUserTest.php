<?php

namespace Tests\Feature\Admin;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class AdminUserTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        $this->admin = $this->buatUser('admin');
    }

    public function test_admin_dapat_membuat_user_makloon(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/users', [
            'username' => 'makloon_baru',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'Makloon Lampung',
            'kecamatan' => 'Metro Pusat',
            'kabupaten' => 'Metro',
            'is_active' => true,
        ]);

        $response->assertCreated();
        $response->assertJsonPath('data.username', 'makloon_baru');
        $response->assertJsonPath('data.nama_maklon', 'Makloon Lampung');
        $response->assertJsonMissingPath('data.password');

        $this->assertDatabaseHas('users', [
            'username' => 'makloon_baru',
            'nama_maklon' => 'Makloon Lampung',
            'is_active' => true,
        ]);
    }

    public function test_nama_maklon_wajib_untuk_role_makloon(): void
    {
        Sanctum::actingAs($this->admin);

        $response = $this->postJson('/api/admin/users', [
            'username' => 'makloon_tanpa_nama',
            'password' => 'password123',
            'password_confirmation' => 'password123',
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
        ]);

        $response->assertUnprocessable();
        $response->assertJsonValidationErrors('nama_maklon');
    }

    public function test_admin_dapat_mengubah_user_dan_membersihkan_nama_maklon_jika_bukan_makloon(): void
    {
        Sanctum::actingAs($this->admin);
        $user = $this->buatUser('makloon', ['nama_maklon' => 'Makloon Lama']);

        $response = $this->patchJson("/api/admin/users/{$user->id}", [
            'username' => 'operator_pengadaan',
            'role_id' => Role::where('nama_role', 'pengadaan')->value('id'),
            'is_active' => false,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.username', 'operator_pengadaan');
        $response->assertJsonPath('data.nama_maklon', null);
        $response->assertJsonPath('data.is_active', false);
    }

    public function test_edit_user_makloon_tidak_wajib_mengirim_ulang_nama_maklon(): void
    {
        Sanctum::actingAs($this->admin);
        $user = $this->buatUser('makloon', ['nama_maklon' => 'Makloon Tetap']);

        $response = $this->patchJson("/api/admin/users/{$user->id}", [
            'is_active' => false,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.nama_maklon', 'Makloon Tetap');
        $response->assertJsonPath('data.is_active', false);
    }

    public function test_admin_dapat_reset_password_user(): void
    {
        Sanctum::actingAs($this->admin);
        $user = $this->buatUser('gudang');

        $response = $this->patchJson("/api/admin/users/{$user->id}/reset-password", [
            'password' => 'password-baru',
            'password_confirmation' => 'password-baru',
        ]);

        $response->assertNoContent();
        $this->assertTrue(Hash::check('password-baru', $user->fresh()->password));
    }

    public function test_admin_dapat_nonaktifkan_dan_hapus_user(): void
    {
        Sanctum::actingAs($this->admin);
        $user = $this->buatUser('operasi');

        $this->patchJson("/api/admin/users/{$user->id}/deactivate")
            ->assertOk()
            ->assertJsonPath('data.is_active', false);

        $this->deleteJson("/api/admin/users/{$user->id}")->assertNoContent();
        $this->assertDatabaseMissing('users', ['id' => $user->id]);
    }

    public function test_non_admin_tidak_dapat_mengakses_admin_users(): void
    {
        Sanctum::actingAs($this->buatUser('pengadaan'));

        $this->getJson('/api/admin/users')->assertForbidden();
    }

    private function buatUser(string $role, array $attributes = []): User
    {
        return User::create(array_merge([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret123'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ], $attributes));
    }
}
