<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Gudang;
use App\Models\PengolahanGudang;
use App\Models\Role;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Gudang A/B/C/D adalah data master, bukan akun user. Menggantikan GudangOptionTest &
 * AdminGudangUserTest lama yang menguji pola "satu username per gudang".
 */
class GudangMasterTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);
    }

    private function user(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret12'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    public function test_admin_bisa_menambah_gudang(): void
    {
        $this->actingAs($this->user('admin'))
            ->postJson('/api/admin/gudang', ['kode' => 'ADA08001', 'nama' => 'Gudang A'])
            ->assertStatus(201)
            ->assertJsonPath('data.kode', 'ADA08001');

        $this->assertDatabaseHas('gudang', ['kode' => 'ADA08001', 'aktif' => true]);
    }

    public function test_kode_gudang_tidak_boleh_duplikat(): void
    {
        Gudang::create(['kode' => 'ADA08001', 'nama' => 'Gudang A']);

        $this->actingAs($this->user('admin'))
            ->postJson('/api/admin/gudang', ['kode' => 'ADA08001', 'nama' => 'Gudang A Lagi'])
            ->assertStatus(422)
            ->assertJsonValidationErrors('kode');
    }

    public function test_non_admin_tidak_bisa_mengelola_gudang(): void
    {
        $this->actingAs($this->user('gudang'))
            ->postJson('/api/admin/gudang', ['kode' => 'X1', 'nama' => 'Gudang X'])
            ->assertForbidden();
    }

    public function test_gudang_belum_dipakai_boleh_dihapus(): void
    {
        $gudang = Gudang::create(['kode' => 'B1', 'nama' => 'Gudang B']);

        $this->actingAs($this->user('admin'))
            ->deleteJson("/api/admin/gudang/{$gudang->id}")
            ->assertOk();

        $this->assertDatabaseMissing('gudang', ['id' => $gudang->id]);
    }

    /**
     * Inti aturannya: menghapus gudang yang sudah dipakai akan membuat baris pengolahan lama
     * kehilangan identitas gudangnya, jadi ditolak dan admin diarahkan menonaktifkan.
     */
    public function test_gudang_yang_sudah_dipakai_tidak_bisa_dihapus(): void
    {
        $gudang = Gudang::create(['kode' => 'C1', 'nama' => 'Gudang C']);
        $makloon = $this->user('makloon');

        $transaksi = TransaksiPengolahan::create([
            'id_pengolahan' => '00001/08/2026/GDG',
            'skema' => 'GDG',
            'makloon_user_id' => $makloon->id,
            'current_stage' => 'gudang',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $makloon->id,
        ]);

        PengolahanGudang::create([
            'transaksi_pengolahan_id' => $transaksi->id_pengolahan,
            'gudang_id' => $gudang->id,
            'status' => 'draft',
        ]);

        $this->actingAs($this->user('admin'))
            ->deleteJson("/api/admin/gudang/{$gudang->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('gudang', ['id' => $gudang->id]);
    }

    public function test_opsi_gudang_hanya_yang_aktif(): void
    {
        Gudang::create(['kode' => 'A1', 'nama' => 'Gudang Aktif']);
        Gudang::create(['kode' => 'A2', 'nama' => 'Gudang Nonaktif', 'aktif' => false]);

        $this->actingAs($this->user('operasi'))
            ->getJson('/api/gudang-options')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.nama', 'Gudang Aktif');
    }
}
