<?php

namespace Tests\Feature\Pengadaan;

use App\Models\DataKeuangan;
use App\Models\DataPengadaan;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Empat kartu di layar Keuangan.
 *
 * Dulu keempatnya dijumlah di browser dari 20 PO satu halaman, sehingga angkanya berubah-ubah
 * tiap kali pengguna menekan "Berikutnya". Yang dijaga di sini: angkanya melampaui batas
 * halaman, dan definisinya sama dengan penyaring layar (PO yang benar-benar di tahap Keuangan).
 */
class RingkasanKeuanganTest extends TestCase
{
    use RefreshDatabase;

    private User $keuangan;

    private User $makloon;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);

        $this->keuangan = User::factory()->create(['role_id' => Role::where('nama_role', 'keuangan')->value('id')]);
        $this->makloon = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT. UJI KEUANGAN',
        ]);
    }

    public function test_ringkasan_menghitung_seluruh_po_bukan_satu_halaman(): void
    {
        // 25 PO siap bayar -- lebih banyak daripada satu halaman /api/po (20 per halaman).
        for ($i = 0; $i < 25; $i++) {
            $this->po(reviewStatus: 'diterima', totalHarga: 1_000_000);
        }
        $this->po(reviewStatus: 'menunggu_review', totalHarga: 500_000);

        Sanctum::actingAs($this->keuangan);

        $this->assertCount(20, $this->getJson('/api/po')->assertOk()->json('data'));

        $this->getJson('/api/keuangan/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.siap_bayar', 25)
            ->assertJsonPath('data.perlu_review', 1)
            ->assertJsonPath('data.nilai_antrean', 25_000_000);
    }

    /** PO yang sudah lunas keluar dari antrean, tapi tetap terhitung sebagai "sudah dibayar". */
    public function test_po_yang_sudah_dibayar_keluar_dari_antrean(): void
    {
        $po = $this->po(reviewStatus: 'diterima', totalHarga: 700_000);
        DataKeuangan::create([
            'data_pengadaan_id' => $po->id,
            'status_bayar' => 'dibayarkan',
            'review_status' => 'diterima',
        ]);

        Sanctum::actingAs($this->keuangan);

        $this->getJson('/api/keuangan/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.siap_bayar', 0)
            ->assertJsonPath('data.nilai_antrean', 0)
            ->assertJsonPath('data.sudah_dibayar', 1);
    }

    /**
     * Penyaringnya sama dengan layar: PO yang transaksi anggotanya sudah maju melewati tahap
     * Keuangan tidak boleh muncul sebagai antrean, walau review_status-nya tertinggal.
     */
    public function test_po_yang_transaksinya_sudah_lewat_tahap_keuangan_tidak_dihitung(): void
    {
        $this->po(reviewStatus: 'menunggu_review', totalHarga: 900_000, stageTransaksi: 'pengadaan');

        Sanctum::actingAs($this->keuangan);

        $this->getJson('/api/keuangan/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.perlu_review', 0)
            ->assertJsonPath('data.siap_bayar', 0);
    }

    private function po(string $reviewStatus, float $totalHarga, string $stageTransaksi = 'keuangan'): DataPengadaan
    {
        $urut = DataPengadaan::count() + 1;

        $transaksi = Transaksi::create([
            'id_transaksi' => sprintf('%05d/08/2026/MPP', $urut),
            'skema' => 'MPP',
            'current_stage' => $stageTransaksi,
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->makloon->id,
        ]);

        $po = DataPengadaan::create([
            'tanggal_bongkar' => '2026-08-01',
            'id_pemasok' => 'PEMASOK',
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => 100,
            'harga' => 6500,
            'total_harga' => $totalHarga,
            'no_po' => 'PO-KEU-'.$urut,
            'status' => 'proses',
            'review_status' => $reviewStatus,
        ]);

        PoDetail::create([
            'data_pengadaan_id' => $po->id,
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum_kontribusi' => 100,
            'no_in' => 'IN-'.$urut,
        ]);

        return $po;
    }
}
