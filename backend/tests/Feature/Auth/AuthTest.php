<?php

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthTest extends TestCase
{
    use RefreshDatabase;

    private function buatUser(string $role = 'makloon', array $attrs = []): User
    {
        $this->seed(RoleSeeder::class);

        return User::factory()->create([
            'role_id' => Role::where('nama_role', $role)->value('id'),
            ...$attrs,
        ]);
    }

    public function test_login_berhasil_mengembalikan_user_beserta_rolenya(): void
    {
        $user = $this->buatUser('makloon', ['nama_maklon' => 'Makloon A']);

        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'password'])
            ->assertOk()
            ->assertJsonPath('user.username', $user->username)
            ->assertJsonPath('user.role.nama_role', 'makloon');
    }

    public function test_login_menolak_password_salah(): void
    {
        $user = $this->buatUser();

        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'salah-sekali'])
            ->assertStatus(422);
    }

    public function test_login_menolak_akun_nonaktif(): void
    {
        $user = $this->buatUser('makloon', ['is_active' => false]);

        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'password'])
            ->assertStatus(422);
    }

    public function test_me_menolak_tamu(): void
    {
        $this->getJson('/api/me')->assertStatus(401);
    }

    public function test_logout_mengakhiri_sesi(): void
    {
        $user = $this->buatUser();

        $this->actingAs($user)->postJson('/api/logout')->assertNoContent();
    }

    /**
     * Regresi: `is_active` dulu hanya diperiksa saat login, sehingga menonaktifkan akun tidak
     * menendang sesi yang sedang berjalan -- user tetap bisa bekerja sampai sesinya kedaluwarsa.
     */
    public function test_sesi_yang_sedang_berjalan_ditolak_setelah_akun_dinonaktifkan(): void
    {
        $user = $this->buatUser();

        $this->actingAs($user)->getJson('/api/me')->assertOk();

        $user->update(['is_active' => false]);

        $this->actingAs($user->fresh())->getJson('/api/me')->assertStatus(401);
    }

    public function test_penonaktifan_oleh_admin_langsung_mengunci_sesi_target(): void
    {
        $this->seed(RoleSeeder::class);
        $admin = User::factory()->create(['role_id' => Role::where('nama_role', 'admin')->value('id')]);
        $target = User::factory()->create(['role_id' => Role::where('nama_role', 'makloon')->value('id')]);

        $this->actingAs($target)->getJson('/api/transaksi')->assertOk();

        $this->actingAs($admin)->deleteJson("/api/admin/users/{$target->id}")->assertOk();

        $this->actingAs($target->fresh())->getJson('/api/transaksi')->assertStatus(401);
    }

    public function test_akun_aktif_tidak_ikut_terkena_middleware(): void
    {
        $user = $this->buatUser();

        $this->actingAs($user)->getJson('/api/me')->assertOk();
    }
}
