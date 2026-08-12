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

    public function test_login_gagal_berulang_dikunci_setelah_lima_percobaan(): void
    {
        $user = $this->buatUser();

        for ($i = 0; $i < 5; $i++) {
            $this->postJson('/api/login', ['username' => $user->username, 'password' => 'salah'])
                ->assertStatus(422);
        }

        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'salah'])
            ->assertStatus(429)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Terlalu banyak percobaan'));

        // Password yang benar pun ikut ditolak selama terkunci -- itulah gunanya.
        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'password'])
            ->assertStatus(429);
    }

    /**
     * Jaminan bahwa pembatas ini tidak mengganggu pemakaian normal: berapa pun banyaknya
     * orang masuk bersamaan (kantor berbagi satu IP publik), tidak ada yang terkunci karena
     * yang dihitung cuma kegagalan.
     */
    public function test_login_berhasil_tidak_memakai_jatah_percobaan(): void
    {
        $user = $this->buatUser();

        for ($i = 0; $i < 10; $i++) {
            $this->postJson('/api/login', ['username' => $user->username, 'password' => 'password'])
                ->assertOk();
        }
    }

    public function test_login_berhasil_mengembalikan_jatah_yang_sudah_terpakai(): void
    {
        $user = $this->buatUser();

        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/login', ['username' => $user->username, 'password' => 'salah'])->assertStatus(422);
        }

        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'password'])->assertOk();

        // Jatah sudah bersih lagi: empat kegagalan berikutnya belum boleh mengunci.
        for ($i = 0; $i < 4; $i++) {
            $this->postJson('/api/login', ['username' => $user->username, 'password' => 'salah'])->assertStatus(422);
        }
    }

    public function test_akun_yang_terkunci_tidak_menyeret_akun_lain(): void
    {
        $korban = $this->buatUser('makloon', ['username' => 'akun-dihajar']);
        $lain = $this->buatUser('makloon', ['username' => 'akun-lain']);

        for ($i = 0; $i < 6; $i++) {
            $this->postJson('/api/login', ['username' => $korban->username, 'password' => 'salah']);
        }

        $this->postJson('/api/login', ['username' => $korban->username, 'password' => 'password'])->assertStatus(429);
        $this->postJson('/api/login', ['username' => $lain->username, 'password' => 'password'])->assertOk();
    }

    /**
     * Kolom username bercollation case-insensitive di MySQL, jadi tanpa penyaringan ulang
     * "ADMIN" akan cocok dengan baris "admin". Untuk kredensial, "hampir sama" tidak cukup.
     */
    public function test_login_menolak_username_yang_beda_besar_kecil_hurufnya(): void
    {
        $user = $this->buatUser('makloon', ['username' => 'operator1']);

        $this->postJson('/api/login', ['username' => 'Operator1', 'password' => 'password'])->assertStatus(422);
        $this->postJson('/api/login', ['username' => 'OPERATOR1', 'password' => 'password'])->assertStatus(422);

        // Ejaan yang persis tetap boleh masuk.
        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'password'])->assertOk();
    }

    public function test_login_menolak_password_yang_beda_besar_kecil_hurufnya(): void
    {
        $user = $this->buatUser('makloon', ['password' => bcrypt('RahasiaKu')]);

        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'rahasiaku'])->assertStatus(422);
        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'RAHASIAKU'])->assertStatus(422);
        $this->postJson('/api/login', ['username' => $user->username, 'password' => 'RahasiaKu'])->assertOk();
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
