<?php

namespace Database\Seeders;

use App\Models\Role;
use Illuminate\Database\Seeder;
use Spatie\Permission\Models\Role as PermissionRole;

class RoleSeeder extends Seeder
{
    public function run(): void
    {
        collect([
            'jemput_pangan',
            'makloon',
            'ub_jastasma',
            'pengadaan',
            'keuangan',
            'operasi',
            'gudang',
            'admin',
        ])->each(function (string $nama) {
            Role::firstOrCreate(['nama_role' => $nama]);
            PermissionRole::firstOrCreate(['name' => $nama, 'guard_name' => 'web']);
        });
    }
}
