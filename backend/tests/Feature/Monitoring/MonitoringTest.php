<?php

namespace Tests\Feature\Monitoring;

use App\Models\Gudang;
use App\Models\PengolahanLhpk;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class MonitoringTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
    }

    public function test_sebaran_tahap_tetap_ok_meski_ada_tahap_tanpa_transaksi(): void
    {
        // Hanya ada satu transaksi di tahap jemput_pangan -- semua tahap lain berjumlah 0.
        // Regression guard: tahap kosong (lookup null) harus tetap menghasilkan total 0,
        // bukan error saat membaca properti pada null.
        Transaksi::create([
            'id_transaksi' => '00001/07/2026/TJP',
            'skema' => 'TJP',
            'current_stage' => 'jemput_pangan',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->buatUser('jemput_pangan')->id,
        ]);

        Sanctum::actingAs($this->buatUser('pengadaan'));
        $response = $this->getJson('/api/monitoring/sebaran-tahap');

        $response->assertOk();
        $response->assertJsonPath('data.0.skema', 'TJP');
        // Tahap pertama TJP punya 1 transaksi, tahap-tahap kosong harus bernilai 0 (bukan error).
        $response->assertJsonPath('data.0.stages.0.total', 1);
        $response->assertJsonPath('data.0.stages.1.total', 0);
    }

    /**
     * Angka pengolahan dihitung di database dari LHPK yang sudah DITERIMA saja; yang masih
     * menunggu review tidak boleh ikut menggeser tren maupun rendemen.
     */
    public function test_monitoring_pengolahan_hanya_menghitung_lhpk_yang_diterima(): void
    {
        $gudang = Gudang::create(['kode' => 'ADA08001', 'nama' => 'Gudang A']);
        $makloon = $this->buatUser('makloon');
        $makloon->update(['nama_maklon' => 'Makloon Alpha']);

        $diterima = $this->buatPengolahan($gudang, $makloon, 'GDG', 'selesai');
        $this->buatLhpk($diterima, 'LHPK/OK', 20000, 12500, 'diterima');

        $menunggu = $this->buatPengolahan($gudang, $makloon, 'UBJ', 'berjalan');
        $this->buatLhpk($menunggu, 'LHPK/DRAFT', 90000, 90000, 'menunggu_review');

        Sanctum::actingAs($this->buatUser('admin'));
        $response = $this->getJson('/api/monitoring/pengolahan')->assertOk();

        $response->assertJsonPath('data.ringkasan.gabah_diolah', 20000)
            ->assertJsonPath('data.ringkasan.beras_hgl', 12500)
            ->assertJsonPath('data.ringkasan.rendemen', 62.5)
            ->assertJsonPath('data.ringkasan.selesai', 1)
            ->assertJsonPath('data.ringkasan.berjalan', 1)
            ->assertJsonPath('data.makloon_teratas.0.nama_maklon', 'Makloon Alpha')
            ->assertJsonPath('data.makloon_teratas.0.beras_hgl', 12500)
            // Sumbu tren selalu 12 bulan penuh, termasuk bulan tanpa data.
            ->assertJsonCount(12, 'data.tren_bulanan')
            ->assertJsonCount(2, 'data.sebaran_tahap');

        $bulanIni = collect($response->json('data.tren_bulanan'))->firstWhere('bulan', now()->format('Y-m'));
        $this->assertEquals(12500, $bulanIni['beras_hgl']);
    }

    public function test_monitoring_pengolahan_tertutup_untuk_non_admin(): void
    {
        Sanctum::actingAs($this->buatUser('operasi'));

        $this->getJson('/api/monitoring/pengolahan')->assertForbidden();
    }

    private function buatPengolahan(Gudang $gudang, User $makloon, string $skema, string $status): TransaksiPengolahan
    {
        return TransaksiPengolahan::create([
            'id_pengolahan' => sprintf('%05d/%s/%s', TransaksiPengolahan::count() + 1, now()->format('m/Y'), $skema),
            'skema' => $skema,
            'gudang_id' => $gudang->id,
            'makloon_user_id' => $makloon->id,
            'current_stage' => 'operasi',
            'status_keseluruhan' => $status,
            'created_by' => $makloon->id,
        ]);
    }

    private function buatLhpk(TransaksiPengolahan $pengolahan, string $noLhpk, float $gabah, float $hgl, string $status): void
    {
        PengolahanLhpk::create([
            'transaksi_pengolahan_id' => $pengolahan->id_pengolahan,
            'gudang_tujuan_id' => $pengolahan->gudang_id,
            'no_lhpk' => $noLhpk,
            'tanggal_lhpk' => now()->toDateString(),
            'kuantum_gabah_diolah' => $gabah,
            'kuantum_beras_hgl' => $hgl,
            'status' => $status,
        ]);
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
