<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTerima;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Mode ?per_makloon=1 memotong halaman di pergantian MAKLOON, bukan di baris ke-sekian.
 * Itu satu-satunya cara akordion dashboard tidak menampilkan makloon yang sama dua kali:
 * kalau batas halaman jatuh di tengah rombongan, sisanya muncul lagi sebagai akordion baru
 * di halaman berikutnya.
 */
class AntreanPerMakloonTest extends TestCase
{
    use RefreshDatabase;

    public function test_halaman_dipotong_per_makloon_bukan_per_baris(): void
    {
        $this->seed(RoleSeeder::class);
        $ub = User::factory()->create(['role_id' => Role::where('nama_role', 'ub_jastasma')->value('id')]);

        // Tiga makloon, jumlah transaksi berbeda-beda -- justru ketimpangan itu yang dulu
        // membuat batas halaman jatuh di tengah rombongan.
        $a = $this->buatMakloon('A JAYA', 3);
        $b = $this->buatMakloon('B SEJAHTERA', 1);
        $c = $this->buatMakloon('C MAKMUR', 2);

        Sanctum::actingAs($ub);

        $satu = $this->getJson('/api/transaksi?per_makloon=1&per_page=2')->assertOk()->json();
        // total = jumlah MAKLOON, bukan jumlah transaksi.
        $this->assertSame(3, $satu['meta']['total']);
        $this->assertSame(2, $satu['meta']['last_page']);
        // Halaman 1 memuat SELURUH transaksi dua makloon pertama (urut nama), utuh.
        $this->assertSame(['A JAYA', 'A JAYA', 'A JAYA', 'B SEJAHTERA'], collect($satu['data'])->pluck('nama_maklon')->sort()->values()->all());

        $dua = $this->getJson('/api/transaksi?per_makloon=1&per_page=2&page=2')->assertOk()->json();
        $this->assertSame(['C MAKMUR', 'C MAKMUR'], collect($dua['data'])->pluck('nama_maklon')->all());

        // Tidak ada makloon yang muncul di dua halaman sekaligus -- inti dari mode ini.
        $this->assertEmpty(array_intersect(
            collect($satu['data'])->pluck('nama_maklon')->unique()->all(),
            collect($dua['data'])->pluck('nama_maklon')->unique()->all(),
        ));

        unset($a, $b, $c);
    }

    private function buatMakloon(string $nama, int $jumlah): User
    {
        $makloon = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => $nama,
        ]);

        for ($i = 1; $i <= $jumlah; $i++) {
            $transaksi = Transaksi::create([
                'id_transaksi' => sprintf('%05d/07/2026/MPP', crc32($nama) % 9000 + $i),
                'skema' => 'MPP',
                'current_stage' => 'ub_jastasma',
                'status_keseluruhan' => 'berjalan',
                'created_by' => $makloon->id,
            ]);
            DataMakloonMpp::create([
                'transaksi_id' => $transaksi->id_transaksi,
                'id_pemasok' => 'P-'.$i,
                'tanggal_bongkar' => '2026-07-10',
                'status' => 'diterima',
            ]);
            DataMakloonTerima::create([
                'transaksi_id' => $transaksi->id_transaksi,
                'kuantum_bongkar' => 1000,
                'status' => 'menunggu_review',
            ]);
        }

        return $makloon;
    }
}
