<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataMakloonMpp;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Daftar "Transaksi menunggu tindakan" diurutkan tanggal (bongkar) lalu ID pemasok, menaik.
 * Diuji lewat endpoint karena pengurutannya hidup di query, bukan di frontend (daftar paginated).
 */
class TransaksiUrutanListTest extends TestCase
{
    use RefreshDatabase;

    private User $makloon;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        $this->makloon = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT. URUT',
        ]);
    }

    public function test_daftar_diurutkan_tanggal_lalu_id_pemasok_menaik(): void
    {
        // Sengaja dibuat terbalik: yang paling akhir seharusnya muncul paling awal.
        $c = $this->buatMpp('00003', '2026-07-20', 'C-PEMASOK');
        $b = $this->buatMpp('00002', '2026-07-10', 'B-PEMASOK');
        $a = $this->buatMpp('00001', '2026-07-10', 'A-PEMASOK');

        Sanctum::actingAs($this->makloon);

        $urutan = $this->getJson('/api/transaksi')->assertOk()->json('data.*.id_transaksi');

        $this->assertSame([$a->id_transaksi, $b->id_transaksi, $c->id_transaksi], $urutan);
    }

    public function test_transaksi_tanpa_tanggal_bongkar_memakai_tanggal_dibuat(): void
    {
        $lama = $this->buatMpp('00001', null, null, '2026-07-01 08:00:00');
        $baru = $this->buatMpp('00002', null, null, '2026-07-25 08:00:00');

        Sanctum::actingAs($this->makloon);

        $urutan = $this->getJson('/api/transaksi')->assertOk()->json('data.*.id_transaksi');

        $this->assertSame([$lama->id_transaksi, $baru->id_transaksi], $urutan);
    }

    private function buatMpp(string $urut, ?string $tanggalBongkar, ?string $idPemasok, ?string $createdAt = null): Transaksi
    {
        $transaksi = Transaksi::create([
            'id_transaksi' => "{$urut}/07/2026/MPP",
            'skema' => 'MPP',
            'current_stage' => 'makloon_kirim',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->makloon->id,
            'created_at' => $createdAt ?? now(),
        ]);

        DataMakloonMpp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'id_pemasok' => $idPemasok,
            'tanggal_bongkar' => $tanggalBongkar,
            'status' => 'draft',
        ]);

        return $transaksi;
    }
}
