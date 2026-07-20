<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Pengolahan;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PengolahanModelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_pengolahan_menyimpan_dan_membaca_relasi_makloon(): void
    {
        $makloon = User::create(['username' => 'm1', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'makloon')->value('id'), 'nama_maklon' => 'PT Makloon']);
        $ub = User::create(['username' => 'ub1', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'ub_jastasma')->value('id')]);

        $p = Pengolahan::create([
            'makloon_user_id' => $makloon->id,
            'jumlah_kuantum' => 1000,
            'kuantum_olah' => 800,
            'no_lhpk' => 'LHPK-001',
            'tanggal' => '2026-07-20',
            'created_by' => $ub->id,
        ]);

        // Refresh supaya nilai default DB (status) & format decimal ikut terbaca dari baris tersimpan.
        $p->refresh();

        $this->assertSame('menunggu_operasi', $p->status);
        $this->assertSame('PT Makloon', $p->makloon->nama_maklon);
        $this->assertSame('1000.00', $p->jumlah_kuantum);
        $this->assertSame($ub->id, $p->creator->id);
    }
}
