<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTerima;
use App\Models\DataMakloonTjp;
use App\Models\DataJemputPangan;
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
 * Kartu angka di layar Rekap.
 *
 * Sebelumnya dijumlah di browser dari baris yang sedang dimuat, jadi ia benar selama datanya
 * muat dalam satu halaman dan diam-diam melaporkan sebagian begitu lewat. Yang dijaga berkas
 * ini persis dua hal yang dulu salah: angkanya harus melampaui batas halaman, dan kuantum MPP
 * harus datang dari tahap Makloon Terima.
 */
class RingkasanRekapTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    private User $makloon;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);

        $this->admin = User::factory()->create(['role_id' => Role::where('nama_role', 'admin')->value('id')]);
        $this->makloon = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT. UJI RINGKASAN',
        ]);
    }

    /**
     * Inti perbaikannya: tiga transaksi, halaman dibatasi satu baris. Angka ringkasan tidak
     * boleh ikut mengecil -- kalau ia mengikuti halaman, hasilnya 100 dan bukan 600.
     */
    public function test_ringkasan_menghitung_seluruh_data_bukan_satu_halaman(): void
    {
        $this->transaksiMpp(100);
        $this->transaksiMpp(200);
        $this->transaksiTjp(300);

        Sanctum::actingAs($this->admin);

        $halaman = $this->getJson('/api/transaksi/rekap?per_page=1')->assertOk();
        $this->assertCount(1, $halaman->json('data'));
        $this->assertSame(3, $halaman->json('meta.total'));

        $this->getJson('/api/transaksi/rekap/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.bongkar_mpp', 300)
            ->assertJsonPath('data.bongkar_tjp', 300)
            ->assertJsonPath('data.jumlah_mpp', 2)
            ->assertJsonPath('data.jumlah_tjp', 1);
    }

    /**
     * Kuantum MPP berasal dari `data_makloon_terima`, BUKAN `data_makloon_mpp.kuantum_bongkar`.
     * Kolom yang belakangan sudah tidak diisi siapa pun sejak tahap Makloon Terima punya tabel
     * sendiri; kartu yang membacanya akan selalu melaporkan nol untuk data baru.
     */
    public function test_kuantum_mpp_dibaca_dari_tahap_makloon_terima(): void
    {
        $transaksi = $this->transaksiMpp(750);

        // Kolom usang diisi angka lain: kalau ringkasan masih membacanya, hasilnya 999.
        DataMakloonMpp::where('transaksi_id', $transaksi->id_transaksi)->update(['kuantum_bongkar' => 999]);

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/transaksi/rekap/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.bongkar_mpp', 750);
    }

    /** Satu PO menggabungkan banyak transaksi, jadi yang dihitung no_po berbeda -- bukan baris. */
    public function test_total_po_menghitung_nomor_po_yang_berbeda(): void
    {
        $satu = $this->transaksiMpp(100);
        $dua = $this->transaksiMpp(200);

        $po = DataPengadaan::create([
            'tanggal_bongkar' => '2026-08-01',
            'id_pemasok' => 'P1',
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => 300,
            'harga' => 6500,
            'total_harga' => 1_950_000,
            'no_po' => 'PO-RINGKASAN-1',
            'status' => 'proses',
        ]);

        foreach ([$satu, $dua] as $transaksi) {
            PoDetail::create([
                'data_pengadaan_id' => $po->id,
                'transaksi_id' => $transaksi->id_transaksi,
                'kuantum_kontribusi' => 100,
                'no_in' => 'IN-1',
            ]);
        }

        Sanctum::actingAs($this->admin);

        $this->getJson('/api/transaksi/rekap/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.total_po', 1);
    }

    /**
     * Ringkasan memakai penyaring yang SAMA dengan daftarnya. Kalau tidak, seorang makloon
     * melihat kartu yang menjumlahkan gabah seluruh mitra -- kebocoran yang tak berbentuk
     * daftar sehingga tidak tertangkap uji isolasi biasa.
     */
    public function test_makloon_hanya_melihat_angka_miliknya_sendiri(): void
    {
        $this->transaksiMpp(100);

        $lain = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT. MAKLOON LAIN',
        ]);
        $this->transaksiMpp(500, $lain);

        Sanctum::actingAs($this->makloon);

        $this->getJson('/api/transaksi/rekap/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.bongkar_mpp', 100)
            ->assertJsonPath('data.jumlah_mpp', 1);
    }

    /** MPP dengan tahap Makloon Kirim yang sudah diterima -- syarat agar tampil di rekap. */
    private function transaksiMpp(float $kuantumBongkar, ?User $pemilik = null): Transaksi
    {
        $pemilik ??= $this->makloon;

        $transaksi = Transaksi::create([
            'id_transaksi' => sprintf('%05d/08/2026/MPP', Transaksi::count() + 1),
            'skema' => 'MPP',
            'current_stage' => 'ub_jastasma',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $pemilik->id,
        ]);

        DataMakloonMpp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'id_pemasok' => 'PEMASOK',
            'tanggal_bongkar' => '2026-08-01',
            'kuantum' => $kuantumBongkar,
            'status' => 'diterima',
        ]);
        DataMakloonTerima::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum_bongkar' => $kuantumBongkar,
            'status' => 'diterima',
        ]);

        return $transaksi;
    }

    private function transaksiTjp(float $kuantumBongkar): Transaksi
    {
        $transaksi = Transaksi::create([
            'id_transaksi' => sprintf('%05d/08/2026/TJP', Transaksi::count() + 1),
            'skema' => 'TJP',
            'current_stage' => 'ub_jastasma',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->admin->id,
        ]);

        DataJemputPangan::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'id_pemasok' => 'PEMASOK',
            'nama_poktan_gapoktan' => 'Poktan',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => '2026-08-01',
            'kuantum' => $kuantumBongkar,
            'status' => 'diterima',
        ]);
        DataMakloonTjp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'tanggal_bongkar' => '2026-08-02',
            'kuantum_bongkar' => $kuantumBongkar,
            'status' => 'diterima',
        ]);

        return $transaksi;
    }
}
