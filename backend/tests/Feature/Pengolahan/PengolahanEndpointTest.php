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

    public function test_list_pengolahan_bisa_difilter_status_server_side(): void
    {
        $makloon = $this->user('makloon');
        $ub = $this->user('ub_jastasma');

        Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 100, 'no_lhpk' => 'LHPK-A', 'tanggal' => '2026-07-20', 'created_by' => $ub->id, 'status' => 'menunggu_operasi']);
        Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 100, 'no_lhpk' => 'LHPK-B', 'tanggal' => '2026-07-20', 'created_by' => $ub->id, 'status' => 'ditolak']);

        $this->actingAs($ub)
            ->getJson('/api/pengolahan?status=menunggu_operasi')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.no_lhpk', 'LHPK-A');
    }

    public function test_list_mo_bisa_difilter_stage_server_side(): void
    {
        $makloon = $this->user('makloon');
        $ub = $this->user('ub_jastasma');
        $operasi = $this->user('operasi');
        $pengadaan = $this->user('pengadaan');

        $p1 = Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 100, 'no_lhpk' => 'LHPK-S1', 'tanggal' => '2026-07-20', 'created_by' => $ub->id]);
        $p2 = Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 100, 'no_lhpk' => 'LHPK-S2', 'tanggal' => '2026-07-20', 'created_by' => $ub->id]);
        $moPengadaan = app(MoService::class)->gabungkan([$p1->id], 'MO-S1', 'TM-S1', $operasi); // stage pengadaan
        $moOperasi = app(MoService::class)->gabungkan([$p2->id], 'MO-S2', 'TM-S2', $operasi);
        app(MoService::class)->putuskanOut($moOperasi, 'diterima', 'OUT-S2', null, $pengadaan); // stage operasi

        $this->actingAs($pengadaan)
            ->getJson('/api/mo?stage=pengadaan')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.no_mo', 'MO-S1');
    }

    public function test_kirim_gudang_menolak_tujuan_bukan_akun_gudang(): void
    {
        $makloon = $this->user('makloon');
        $ub = $this->user('ub_jastasma');
        $operasi = $this->user('operasi');
        $pengadaan = $this->user('pengadaan');

        $p = Pengolahan::create(['makloon_user_id' => $makloon->id, 'jumlah_kuantum' => 1000, 'kuantum_olah' => 400, 'no_lhpk' => 'LHPK-NG', 'tanggal' => '2026-07-20', 'created_by' => $ub->id]);
        $mo = app(MoService::class)->gabungkan([$p->id], 'MO-NG', 'TM-NG', $operasi);
        app(MoService::class)->putuskanOut($mo, 'diterima', 'OUT-NG', null, $pengadaan);

        // Tujuan = user makloon (bukan role gudang) → harus 422 (validasi), MO tetap di operasi.
        $this->actingAs($operasi)
            ->patchJson("/api/mo/{$mo->id}/kirim-gudang", [
                'tujuan_gudang_user_id' => $makloon->id,
                'no_tm_gudang' => 'TMG-NG',
                'kuantum_total' => 400,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('tujuan_gudang_user_id');

        $this->assertSame('operasi', $mo->fresh()->current_stage);
    }
}
