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

        User::firstOrCreate(
            ['username' => 'admin'],
            [
                'password' => 'password',
                'role_id' => $adminRole->id,
            ]
        );
    }
}
