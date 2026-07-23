<?php

namespace Tests\Feature\Pengadaan;

use App\Models\DataPengadaan;
use App\Models\Role;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Verifikasi khusus: PengadaanController::update boleh mengoreksi No. PO (fitur tombol
 * "Kembali ke PO"). Dibuat terisolasi -- membuat DataPengadaan langsung -- agar tidak
 * bergantung pada alur tahap MPP yang test lamanya sudah usang (makloon_kirim/terima).
 */
class PoUpdateNoPoTest extends TestCase
{
    use RefreshDatabase;

    private User $pengadaan;

    private User $makloon;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->pengadaan = $this->buatUser('pengadaan');
        $this->makloon = $this->buatUser('makloon');
    }

    public function test_pengadaan_bisa_mengoreksi_no_po(): void
    {
        $po = $this->buatPo('PO-LAMA-001');

        Sanctum::actingAs($this->pengadaan);
        $response = $this->patchJson("/api/po/{$po->id}", ['no_po' => 'PO-BARU-001', 'harga' => 7000]);

        $response->assertOk();
        $response->assertJsonPath('data.no_po', 'PO-BARU-001');
        $response->assertJsonPath('data.harga', '7000.00');
        $response->assertJsonPath('data.total_harga', '700000.00');
        $this->assertDatabaseHas('data_pengadaan', ['id' => $po->id, 'no_po' => 'PO-BARU-001']);
    }

    public function test_no_po_tetap_boleh_sama_dengan_dirinya_sendiri(): void
    {
        $po = $this->buatPo('PO-SAMA-001');

        Sanctum::actingAs($this->pengadaan);
        $this->patchJson("/api/po/{$po->id}", ['no_po' => 'PO-SAMA-001'])->assertOk();
    }

    public function test_no_po_ditolak_jika_bentrok_dengan_po_lain(): void
    {
        $this->buatPo('PO-TERPAKAI');
        $po = $this->buatPo('PO-KEDUA');

        Sanctum::actingAs($this->pengadaan);
        $this->patchJson("/api/po/{$po->id}", ['no_po' => 'PO-TERPAKAI'])->assertStatus(422);
    }

    public function test_update_po_ditolak_untuk_role_selain_pengadaan(): void
    {
        $po = $this->buatPo('PO-ROLE-001');

        Sanctum::actingAs($this->makloon);
        $this->patchJson("/api/po/{$po->id}", ['no_po' => 'PO-ROLE-002'])->assertForbidden();
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function buatPo(string $noPo): DataPengadaan
    {
        return DataPengadaan::create([
            'tanggal_bongkar' => '2026-07-10',
            'id_pemasok' => 'PEMASOK-X',
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => '100.00',
            'harga' => '6500.00',
            'total_harga' => '650000.00',
            'no_po' => $noPo,
            'status' => 'proses',
        ]);
    }
}
