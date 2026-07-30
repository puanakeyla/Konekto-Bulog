<?php

namespace Tests\Feature\Dashboard;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTjp;
use App\Models\DataUbJastasma;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class DashboardRingkasanTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $role): User
    {
        $this->seed(RoleSeeder::class);

        return User::factory()->create(['role_id' => Role::where('nama_role', $role)->value('id')]);
    }

    private function transaksi(string $skema, string $stage, string $status = 'berjalan', int $creator = null): Transaksi
    {
        static $n = 0;
        $n++;

        return Transaksi::create([
            'id_transaksi' => sprintf('%05d/07/2026/%s', $n, $skema),
            'skema' => $skema,
            'current_stage' => $stage,
            'status_keseluruhan' => $status,
            'created_by' => $creator ?? User::first()->id,
        ]);
    }

    public function test_hitungan_antrean_mengelompokkan_tiap_kategori_kerjaan(): void
    {
        $makloon = $this->user('makloon');
        Sanctum::actingAs($makloon);

        // periksa: TJP di tahap makloon, data JP menunggu direview
        $t1 = $this->transaksi('TJP', 'makloon');
        DataJemputPangan::create(['transaksi_id' => $t1->id_transaksi, 'id_pemasok' => 'P1', 'makloon_user_id' => $makloon->id, 'status' => 'menunggu_review']);

        // isi: JP sudah diterima, makloon belum mengisi datanya sendiri
        $t2 = $this->transaksi('TJP', 'makloon');
        DataJemputPangan::create(['transaksi_id' => $t2->id_transaksi, 'id_pemasok' => 'P2', 'makloon_user_id' => $makloon->id, 'status' => 'diterima']);

        // draft: data makloon tersimpan tapi belum dikirim
        $t3 = $this->transaksi('TJP', 'makloon');
        DataJemputPangan::create(['transaksi_id' => $t3->id_transaksi, 'id_pemasok' => 'P3', 'makloon_user_id' => $makloon->id, 'status' => 'diterima']);
        DataMakloonTjp::create(['transaksi_id' => $t3->id_transaksi, 'status' => 'draft']);

        // ditolak
        $t4 = $this->transaksi('TJP', 'makloon');
        DataJemputPangan::create(['transaksi_id' => $t4->id_transaksi, 'id_pemasok' => 'P4', 'makloon_user_id' => $makloon->id, 'status' => 'ditolak']);

        // MPP menunggu bongkar -> tetap kategori periksa
        $t5 = $this->transaksi('MPP', 'makloon_terima');
        DataMakloonMpp::create(['transaksi_id' => $t5->id_transaksi, 'id_pemasok' => 'P5', 'tanggal_bongkar' => '2026-07-02', 'kuantum' => 100, 'status' => 'menunggu_review']);

        $this->getJson('/api/dashboard/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.antrean.periksa', 2)
            ->assertJsonPath('data.antrean.isi', 1)
            ->assertJsonPath('data.antrean.draft', 1)
            ->assertJsonPath('data.antrean.ditolak', 1)
            ->assertJsonPath('data.antrean.po', 0)
            ->assertJsonPath('data.antrean.total', 5);
    }

    public function test_penolakan_menang_atas_menunggu_review(): void
    {
        $makloon = $this->user('makloon');
        Sanctum::actingAs($makloon);

        // Ditolak DAN data tahap sebelumnya menunggu review -- harus dihitung sebagai ditolak saja.
        $t = $this->transaksi('TJP', 'makloon');
        DataJemputPangan::create(['transaksi_id' => $t->id_transaksi, 'id_pemasok' => 'P1', 'makloon_user_id' => $makloon->id, 'status' => 'ditolak']);

        $this->getJson('/api/dashboard/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.antrean.ditolak', 1)
            ->assertJsonPath('data.antrean.periksa', 0);
    }

    public function test_keuangan_seluruh_antreannya_kategori_po(): void
    {
        $keuangan = $this->user('keuangan');
        Sanctum::actingAs($keuangan);

        $this->transaksi('TJP', 'keuangan');
        $this->transaksi('MPP', 'keuangan');

        $this->getJson('/api/dashboard/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.antrean.po', 2)
            ->assertJsonPath('data.antrean.isi', 0);
    }

    public function test_filter_skema_ikut_diterapkan_pada_hitungan(): void
    {
        $makloon = $this->user('makloon');
        Sanctum::actingAs($makloon);

        $this->transaksi('MPP', 'makloon_kirim');
        $this->transaksi('MPP', 'makloon_kirim');
        $t = $this->transaksi('TJP', 'makloon');
        DataJemputPangan::create(['transaksi_id' => $t->id_transaksi, 'id_pemasok' => 'P9', 'makloon_user_id' => $makloon->id, 'status' => 'diterima']);

        $this->getJson('/api/dashboard/ringkasan?skema=MPP')
            ->assertOk()
            ->assertJsonPath('data.antrean.total', 2);
    }

    /**
     * Inti dari perubahan ini: angka ringkasan harus mencerminkan SELURUH data, bukan halaman
     * pertama. Sebelumnya frontend menjumlahkan 200 baris yang ter-fetch, sehingga di atas 200
     * transaksi angkanya diam-diam salah.
     */
    public function test_ringkasan_admin_menghitung_seluruh_transaksi_bukan_satu_halaman(): void
    {
        $admin = $this->user('admin');
        Sanctum::actingAs($admin);

        for ($i = 0; $i < 250; $i++) {
            $this->transaksi('TJP', 'keuangan', $i < 150 ? 'selesai' : 'berjalan');
        }

        $this->getJson('/api/dashboard/ringkasan')
            ->assertOk()
            ->assertJsonPath('data.rekap.total', 250)
            ->assertJsonPath('data.rekap.selesai', 150)
            ->assertJsonPath('data.rekap.perlu_diproses', 100);
    }

    public function test_filter_kerjaan_pada_daftar_transaksi_konsisten_dengan_hitungannya(): void
    {
        $makloon = $this->user('makloon');
        Sanctum::actingAs($makloon);

        $t1 = $this->transaksi('TJP', 'makloon');
        DataJemputPangan::create(['transaksi_id' => $t1->id_transaksi, 'id_pemasok' => 'P1', 'makloon_user_id' => $makloon->id, 'status' => 'menunggu_review']);
        $t2 = $this->transaksi('TJP', 'makloon');
        DataJemputPangan::create(['transaksi_id' => $t2->id_transaksi, 'id_pemasok' => 'P2', 'makloon_user_id' => $makloon->id, 'status' => 'diterima']);

        $hitung = $this->getJson('/api/dashboard/ringkasan')->json('data.antrean');

        foreach (['periksa', 'isi'] as $kerjaan) {
            $daftar = $this->getJson("/api/transaksi?kerjaan={$kerjaan}&per_page=100")->assertOk()->json('data');
            $this->assertCount($hitung[$kerjaan], $daftar, "Jumlah baris kerjaan={$kerjaan} tidak sama dengan angka chip");
        }
    }

    public function test_pantauan_hanya_untuk_admin(): void
    {
        Sanctum::actingAs($this->user('makloon'));

        $this->getJson('/api/dashboard/pantauan')->assertForbidden();
    }

    public function test_pantauan_menjumlahkan_per_makloon(): void
    {
        $this->seed(RoleSeeder::class);
        $makloonRoleId = Role::where('nama_role', 'makloon')->value('id');
        $mk = User::factory()->create(['role_id' => $makloonRoleId, 'nama_maklon' => 'Makloon Alpha']);
        $admin = $this->user('admin');
        Sanctum::actingAs($admin);

        $t1 = $this->transaksi('MPP', 'ub_jastasma', 'berjalan', $mk->id);
        DataMakloonMpp::create(['transaksi_id' => $t1->id_transaksi, 'id_pemasok' => 'P1', 'tanggal_bongkar' => '2026-07-02', 'kuantum' => 1000, 'status' => 'diterima']);
        $t2 = $this->transaksi('MPP', 'ub_jastasma', 'berjalan', $mk->id);
        DataMakloonMpp::create(['transaksi_id' => $t2->id_transaksi, 'id_pemasok' => 'P2', 'tanggal_bongkar' => '2026-07-03', 'kuantum' => 500, 'status' => 'diterima']);

        $this->getJson('/api/dashboard/pantauan')
            ->assertOk()
            ->assertJsonPath('data.0.nama', 'Makloon Alpha')
            ->assertJsonPath('data.0.gabah_diterima', 1500);
    }
}
