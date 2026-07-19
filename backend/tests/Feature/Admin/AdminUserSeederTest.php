<?php

namespace Tests\Feature\Admin;

use App\Models\Role;
use App\Models\User;
use Database\Seeders\AdminUserSeeder;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Aplikasi memakai dua sistem role sekaligus: kolom `users.role_id` (App\Models\Role)
 * dan paket spatie/laravel-permission (tabel `permission_roles`). Middleware `role:`
 * di routes/api.php memakai Spatie, jadi user yang hanya punya `role_id` akan ditolak
 * 403 di SELURUH rute berpenjaga role.
 */
class AdminUserSeederTest extends TestCase
{
    use RefreshDatabase;

    public function test_seeder_memberi_akun_admin_baru_role_spatie(): void
    {
        $this->seed(RoleSeeder::class);
        $this->seed(AdminUserSeeder::class);

        $admin = User::where('username', 'admin')->firstOrFail();

        $this->assertTrue($admin->hasRole('admin'));
    }

    /**
     * Kasus yang benar-benar terjadi di database dev: akun `admin` sudah ada lebih dulu
     * tanpa role Spatie. `firstOrCreate` tidak membuat apa pun dan `role_id` tidak
     * berubah, sehingga hook `saved()` di User tidak terpicu dan akun itu tetap lumpuh
     * berapa kali pun seeder dijalankan ulang.
     */
    public function test_seeder_menyembuhkan_akun_admin_warisan_yang_belum_punya_role_spatie(): void
    {
        $this->seed(RoleSeeder::class);

        $admin = User::create([
            'username' => 'admin',
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', 'admin')->value('id'),
        ]);
        // Simulasi data warisan: role Spatie-nya kosong.
        $admin->syncRoles([]);
        $this->assertCount(0, $admin->fresh()->getRoleNames());

        $this->seed(AdminUserSeeder::class);

        $this->assertTrue($admin->fresh()->hasRole('admin'));
    }
}
