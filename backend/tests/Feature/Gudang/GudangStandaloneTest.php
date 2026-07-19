<?php

namespace Tests\Feature\Gudang;

use App\Models\DataGudang;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class GudangStandaloneTest extends TestCase
{
    use RefreshDatabase;

    private User $gudang;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        $this->gudang = $this->buatUser('gudang');
    }

    public function test_gudang_dapat_mencatat_penerimaan_mandiri(): void
    {
        Sanctum::actingAs($this->gudang);

        $response = $this->postJson('/api/gudang', [
            'tanggal_masuk' => '2026-07-19',
            'nama_gudang' => 'Gudang Bulog Lampung',
            'realisasi_hgl' => 1234.5,
            'no_tm' => 'TM-100',
        ]);

        $response->assertCreated();
        $response->assertJsonPath('data.nama_gudang', 'Gudang Bulog Lampung');
        $response->assertJsonPath('data.created_by', $this->gudang->id);
        $this->assertDatabaseHas('data_gudang', ['no_tm' => 'TM-100', 'nama_gudang' => 'Gudang Bulog Lampung']);
    }

    public function test_index_mengurutkan_dan_memuat_pencatat(): void
    {
        DataGudang::create(['tanggal_masuk' => '2026-07-10', 'nama_gudang' => 'Lama', 'realisasi_hgl' => 100, 'no_tm' => 'TM-1', 'created_by' => $this->gudang->id]);
        DataGudang::create(['tanggal_masuk' => '2026-07-18', 'nama_gudang' => 'Baru', 'realisasi_hgl' => 200, 'no_tm' => 'TM-2', 'created_by' => $this->gudang->id]);

        Sanctum::actingAs($this->gudang);

        $response = $this->getJson('/api/gudang');

        $response->assertOk();
        $this->assertCount(2, $response->json('data'));
        $response->assertJsonPath('data.0.nama_gudang', 'Baru'); // terbaru dulu
        $response->assertJsonPath('meta.total', 2);
    }

    public function test_gudang_dapat_mengubah_dan_menghapus_entri(): void
    {
        $entri = DataGudang::create(['tanggal_masuk' => '2026-07-19', 'nama_gudang' => 'Awal', 'realisasi_hgl' => 100, 'no_tm' => 'TM-9', 'created_by' => $this->gudang->id]);

        Sanctum::actingAs($this->gudang);

        $this->patchJson("/api/gudang/{$entri->id}", [
            'tanggal_masuk' => '2026-07-19',
            'nama_gudang' => 'Diubah',
            'realisasi_hgl' => 150,
            'no_tm' => 'TM-9',
        ])->assertOk()->assertJsonPath('data.nama_gudang', 'Diubah');

        $this->deleteJson("/api/gudang/{$entri->id}")->assertNoContent();
        $this->assertDatabaseMissing('data_gudang', ['id' => $entri->id]);
    }

    public function test_menolak_realisasi_hgl_kelewat_besar_dengan_422(): void
    {
        Sanctum::actingAs($this->gudang);

        $response = $this->postJson('/api/gudang', [
            'tanggal_masuk' => '2026-07-19',
            'nama_gudang' => 'Gudang A',
            'realisasi_hgl' => 99999999999999, // melebihi kapasitas decimal(12,2)
            'no_tm' => 'TM-BIG',
        ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors('realisasi_hgl');
    }

    public function test_role_selain_gudang_dan_admin_ditolak(): void
    {
        Sanctum::actingAs($this->buatUser('operasi'));

        $this->getJson('/api/gudang')->assertForbidden();
        $this->postJson('/api/gudang', [
            'tanggal_masuk' => '2026-07-19', 'nama_gudang' => 'X', 'realisasi_hgl' => 1, 'no_tm' => 'TM',
        ])->assertForbidden();
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }
}
