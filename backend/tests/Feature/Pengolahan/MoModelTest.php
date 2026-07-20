<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Mo;
use App\Models\MoDetail;
use App\Models\Pengolahan;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class MoModelTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    public function test_mo_punya_detail_pengolahan(): void
    {
        $makloon = User::create(['username' => 'm1', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'makloon')->value('id')]);
        $op = User::create(['username' => 'op', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'operasi')->value('id')]);
        $ub = User::create(['username' => 'ub', 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', 'ub_jastasma')->value('id')]);

        $p = Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-1', 'tanggal' => '2026-07-20', 'created_by' => $ub->id]);
        $mo = Mo::create(['no_mo' => 'MO-1', 'no_tm' => 'TM-1', 'makloon_user_id' => $makloon->id, 'total_kuantum_olah' => 800, 'created_by' => $op->id]);
        MoDetail::create(['mo_id' => $mo->id, 'pengolahan_id' => $p->id]);

        $mo->refresh();

        $this->assertCount(1, $mo->moDetail);
        $this->assertSame('LHPK-1', $mo->moDetail->first()->pengolahan->no_lhpk);
        $this->assertSame('pengadaan', $mo->current_stage);
        $this->assertSame($makloon->id, $mo->makloon->id);
    }
}
