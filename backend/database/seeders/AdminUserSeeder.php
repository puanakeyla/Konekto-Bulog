<?php

namespace Database\Seeders;

use App\Models\Role;
use App\Models\User;
use Illuminate\Database\Seeder;

class AdminUserSeeder extends Seeder
{
    public function run(): void
    {
        $adminRole = Role::where('nama_role', 'admin')->firstOrFail();

        $admin = User::firstOrCreate(
            ['username' => 'admin'],
            [
                'password' => 'password',
                'role_id' => $adminRole->id,
            ]
        );

        // Middleware `role:` di routes/api.php memakai spatie/laravel-permission
        // (tabel `permission_roles`), BUKAN kolom `users.role_id`. Hook saved() di
        // User hanya menyinkronkan saat user baru dibuat atau `role_id` berubah —
        // keduanya tidak terjadi kalau akun admin sudah ada, sehingga akun warisan
        // tanpa role Spatie akan ditolak 403 di seluruh rute berpenjaga role dan
        // tidak sembuh berapa kali pun seeder ini dijalankan ulang. Sinkronkan
        // eksplisit di sini supaya idempoten untuk instalasi baru maupun lama.
        $admin->syncRoles($adminRole->nama_role);
    }
}
