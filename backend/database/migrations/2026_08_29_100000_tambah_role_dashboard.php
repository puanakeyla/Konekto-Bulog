<?php

use App\Models\Role;
use Illuminate\Database\Migrations\Migration;
use Spatie\Permission\Models\Role as PermissionRole;

/**
 * Role baca-saja "dashboard": melihat kartu ringkasan + Neraca Gabah, Monitoring, Rekap Sergab,
 * dan Rekap Pengolahan, tanpa satu pun jalur tulis. Lewat migrasi (bukan hanya RoleSeeder)
 * supaya database yang sudah jalan ikut kebagian tanpa harus menjalankan seeder ulang.
 */
return new class extends Migration
{
    public function up(): void
    {
        Role::firstOrCreate(['nama_role' => 'dashboard']);
        PermissionRole::firstOrCreate(['name' => 'dashboard', 'guard_name' => 'web']);
    }

    public function down(): void
    {
        Role::where('nama_role', 'dashboard')->delete();
        PermissionRole::where('name', 'dashboard')->where('guard_name', 'web')->delete();
    }
};
