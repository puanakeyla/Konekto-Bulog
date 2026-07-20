<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Mo;
use App\Models\Pengolahan;
use App\Models\Role;
use App\Models\User;
use App\Services\Pengolahan\MoService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class PengolahanEndpointTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function user(string $role, array $extra = []): User
    {
        return User::create(['username' => $role.'_'.uniqid(), 'password' => bcrypt('x'), 'role_id' => Role::where('nama_role', $role)->value('id'), ...$extra]);
    }

    public function test_ub_jastasma_buat_pengolahan_via_api(): void
    {
        $makloon = $this->user('makloon');
        $ub = $this->user('ub_jastasma');

        $this->actingAs($ub)->postJson('/api/pengolahan', [
            'makloon_user_id' => $makloon->id,
            'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-API-1', 'tanggal' => '2026-07-20',
            'ka1' => 12.5, 'hgl' => 600,
        ])->assertStatus(201)->assertJsonPath('data.no_lhpk', 'LHPK-API-1');
    }

    public function test_operasi_tidak_boleh_buat_pengolahan(): void
    {
        $makloon = $this->user('makloon');
        $operasi = $this->user('operasi');

        $this->actingAs($operasi)->postJson('/api/pengolahan', [
            'makloon_user_id' => $makloon->id, 'kuantum_olah' => 800, 'no_lhpk' => 'LHPK-X', 'tanggal' => '2026-07-20',
        ])->assertStatus(403);
    }

    public function test_operasi_gabung_mo_lalu_pengadaan_keluarkan_out(): void
    {
        $makloon = $this->user('makloon');
        $ub = $this->user('ub_jastasma');
        $operasi = $this->user('operasi');
        $pengadaan = $this->user('pengadaan');

        $p = Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 400, 'no_lhpk' => 'LHPK-M', 'tanggal' => '2026-07-20', 'created_by' => $ub->id]);

        $this->actingAs($operasi)->postJson('/api/mo/gabungkan', [
            'pengolahan_ids' => [$p->id], 'no_mo' => 'MO-API-1', 'no_tm' => 'TM-API-1',
        ])->assertStatus(201);

        $mo = Mo::where('no_mo', 'MO-API-1')->firstOrFail();

        $this->actingAs($pengadaan)->patchJson("/api/mo/{$mo->id}/out", [
            'keputusan' => 'diterima', 'no_out' => 'OUT-API-1',
        ])->assertOk()->assertJsonPath('data.current_stage', 'operasi');
    }

    public function test_gudang_bukan_tujuan_tidak_boleh_terima(): void
    {
        $makloon = $this->user('makloon');
        $ub = $this->user('ub_jastasma');
        $operasi = $this->user('operasi');
        $pengadaan = $this->user('pengadaan');
        $gudangA = $this->user('gudang', ['nama_gudang' => 'Gudang Jaya 1']);
        $gudangB = $this->user('gudang', ['nama_gudang' => 'Gudang Jaya 2']);

        $p = Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 400, 'no_lhpk' => 'LHPK-G', 'tanggal' => '2026-07-20', 'created_by' => $ub->id]);
        $mo = app(MoService::class)->gabungkan([$p->id], 'MO-G', 'TM-G', $operasi);
        app(MoService::class)->putuskanOut($mo, 'diterima', 'OUT-G', null, $pengadaan);
        app(MoService::class)->kirimGudang($mo->fresh(), ['tujuan_gudang_user_id' => $gudangA->id, 'no_tm_gudang' => 'TMG', 'kuantum_total' => 400], $operasi);

        $this->actingAs($gudangB)->postJson("/api/mo/{$mo->id}/terima", ['tanggal' => '2026-07-21'])->assertStatus(403);
        $this->actingAs($gudangA)->postJson("/api/mo/{$mo->id}/terima", ['tanggal' => '2026-07-21'])->assertOk()->assertJsonPath('data.status', 'selesai');
    }

    public function test_kuantum_in_endpoint_hanya_ub_jastasma(): void
    {
        $makloon = $this->user('makloon');
        $operasi = $this->user('operasi');

        $this->actingAs($operasi)
            ->getJson('/api/pengolahan/kuantum-in?makloon_user_id='.$makloon->id)
            ->assertStatus(403);
    }
}
