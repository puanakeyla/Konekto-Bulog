<?php

namespace Tests\Feature\Pengadaan;

use App\Models\DataMakloonMpp;
use App\Models\DataPengadaan;
use App\Models\DataUbJastasma;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Fitur "Kembali ke PO" -> pilih ulang transaksi (ubah anggota PO tanpa ganti No. PO).
 * State disiapkan langsung lewat model agar tidak bergantung pada alur tahap MPP yang
 * test lamanya sudah usang.
 */
class PoUbahAnggotaTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $makloon;

    private User $pengadaan;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->makloon = $this->buatUser('makloon');
        $this->pengadaan = $this->buatUser('pengadaan');
    }

    public function test_menambah_anggota_menghitung_ulang_total(): void
    {
        $t1 = $this->buatTransaksiSiapPengadaan('PEMASOK-A', '2026-07-10', 100);
        $t2 = $this->buatTransaksiSiapPengadaan('PEMASOK-A', '2026-07-10', 50);
        $po = $this->buatPoDengan([$t1]);

        Sanctum::actingAs($this->pengadaan);
        $response = $this->patchJson("/api/po/{$po->id}/anggota", [
            'transaksi_ids' => [$t1->id_transaksi, $t2->id_transaksi],
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.total_kuantum', '150.00');
        $this->assertSame('PO-ANGGOTA', $po->fresh()->no_po); // No. PO tetap
        $this->assertDatabaseHas('po_detail', ['data_pengadaan_id' => $po->id, 'transaksi_id' => $t2->id_transaksi]);
    }

    public function test_melepas_anggota_menghitung_ulang_dan_melepas_transaksi(): void
    {
        $t1 = $this->buatTransaksiSiapPengadaan('PEMASOK-A', '2026-07-10', 100);
        $t2 = $this->buatTransaksiSiapPengadaan('PEMASOK-A', '2026-07-10', 50);
        $po = $this->buatPoDengan([$t1, $t2]);

        Sanctum::actingAs($this->pengadaan);
        $response = $this->patchJson("/api/po/{$po->id}/anggota", [
            'transaksi_ids' => [$t1->id_transaksi],
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.total_kuantum', '100.00');
        $this->assertDatabaseMissing('po_detail', ['data_pengadaan_id' => $po->id, 'transaksi_id' => $t2->id_transaksi]);
        // Transaksi yang dilepas tetap di tahap pengadaan (tersedia untuk digabung ulang).
        $this->assertSame('pengadaan', $t2->fresh()->current_stage);
    }

    public function test_bisa_sekaligus_ubah_no_po_dan_harga(): void
    {
        $t1 = $this->buatTransaksiSiapPengadaan('PEMASOK-A', '2026-07-10', 100);
        $po = $this->buatPoDengan([$t1]);

        Sanctum::actingAs($this->pengadaan);
        $response = $this->patchJson("/api/po/{$po->id}/anggota", [
            'transaksi_ids' => [$t1->id_transaksi],
            'no_po' => 'PO-GANTI',
            'harga' => 7000,
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.no_po', 'PO-GANTI');
        $response->assertJsonPath('data.total_harga', '700000.00');
    }

    public function test_menolak_transaksi_beda_kelompok(): void
    {
        $t1 = $this->buatTransaksiSiapPengadaan('PEMASOK-A', '2026-07-10', 100);
        $lain = $this->buatTransaksiSiapPengadaan('PEMASOK-B', '2026-07-11', 80);
        $po = $this->buatPoDengan([$t1]);

        Sanctum::actingAs($this->pengadaan);
        $this->patchJson("/api/po/{$po->id}/anggota", [
            'transaksi_ids' => [$t1->id_transaksi, $lain->id_transaksi],
        ])->assertStatus(422);
    }

    public function test_ditolak_untuk_role_selain_pengadaan(): void
    {
        $t1 = $this->buatTransaksiSiapPengadaan('PEMASOK-A', '2026-07-10', 100);
        $po = $this->buatPoDengan([$t1]);

        Sanctum::actingAs($this->makloon);
        $this->patchJson("/api/po/{$po->id}/anggota", [
            'transaksi_ids' => [$t1->id_transaksi],
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

    private function buatTransaksiSiapPengadaan(string $idPemasok, string $tanggal, float $kuantum): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->makloon);
        $transaksi->current_stage = 'pengadaan';
        $transaksi->save();

        DataMakloonMpp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'id_pemasok' => $idPemasok,
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 XYZ',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => $tanggal,
            'kuantum' => $kuantum,
            'jarak_ke_makloon_km' => 5,
            'status' => 'diterima',
        ]);

        DataUbJastasma::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'ka1' => 12.5,
            'ka2' => 12.6,
            'ka3' => 12.7,
            'hampa' => 1.2,
            'butir_hijau' => 0.5,
            'status' => 'diterima',
        ]);

        return $transaksi->fresh();
    }

    private function buatPoDengan(array $transaksiList): DataPengadaan
    {
        $total = array_sum(array_map(fn (Transaksi $t) => (float) $t->dataMakloonMpp->kuantum, $transaksiList));
        $first = $transaksiList[0];

        $po = DataPengadaan::create([
            'tanggal_bongkar' => $first->dataMakloonMpp->tanggal_bongkar,
            'id_pemasok' => $first->dataMakloonMpp->id_pemasok,
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => number_format($total, 2, '.', ''),
            'harga' => '6500.00',
            'total_harga' => number_format($total * 6500, 2, '.', ''),
            'no_po' => 'PO-ANGGOTA',
            'status' => 'proses',
        ]);

        foreach ($transaksiList as $t) {
            PoDetail::create([
                'data_pengadaan_id' => $po->id,
                'transaksi_id' => $t->id_transaksi,
                'kuantum_kontribusi' => number_format((float) $t->dataMakloonMpp->kuantum, 2, '.', ''),
            ]);
        }

        return $po->fresh();
    }
}
