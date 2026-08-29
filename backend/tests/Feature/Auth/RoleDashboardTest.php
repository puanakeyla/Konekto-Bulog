<?php

namespace Tests\Feature\Auth;

use App\Models\Role;
use App\Models\User;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Role "dashboard" adalah cermin BACA-SAJA halaman awal admin. Dua sifat itu yang diuji di
 * sini: seluruh endpoint pantau terbuka, dan tidak satu pun jalur tulis ikut terbuka.
 */
class RoleDashboardTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);

        Sanctum::actingAs(User::create([
            'username' => 'pantau',
            'password' => bcrypt('rahasia123'),
            'role_id' => Role::where('nama_role', 'dashboard')->value('id'),
        ]));
    }

    public function test_boleh_membaca_seluruh_layar_pantau(): void
    {
        foreach ([
            '/api/dashboard/ringkasan',
            '/api/monitoring/sebaran-tahap',
            '/api/monitoring/makloon',
            '/api/monitoring/pengolahan',
            '/api/monitoring/rekap-makloon',
            '/api/transaksi/rekap',
            '/api/transaksi/rekap/ringkasan',
            '/api/pengolahan/rekap',
        ] as $url) {
            $this->getJson($url)->assertOk();
        }
    }

    /** Kartu ringkasan menyeluruh (total/selesai/ditolak) adalah isi utama halaman awalnya. */
    public function test_ringkasan_memuat_kartu_rekap_seperti_admin(): void
    {
        $this->getJson('/api/dashboard/ringkasan')
            ->assertOk()
            ->assertJsonStructure(['data' => ['rekap' => ['total', 'selesai', 'perlu_diproses', 'ditolak']]]);
    }

    public function test_tidak_punya_satu_pun_jalur_tulis(): void
    {
        $this->postJson('/api/transaksi')->assertForbidden();
        $this->postJson('/api/pengolahan')->assertForbidden();
        $this->getJson('/api/admin/users')->assertForbidden();
        $this->postJson('/api/admin/gudang/import')->assertForbidden();

        // Endpoint koreksi ini SENGAJA tanpa middleware role (lihat routes/api.php): penjaganya
        // bolehEditRekap() di controller. Karena itu dicoba pada transaksi yang benar-benar ada
        // -- kalau tidak, 404 route-model-binding akan menutupi lubangnya.
        $transaksi = app(TransaksiStageService::class)->createTransaksi(User::create([
            'username' => 'jp',
            'password' => bcrypt('rahasia123'),
            'role_id' => Role::where('nama_role', 'jemput_pangan')->value('id'),
        ]));

        $this->patchJson('/api/transaksi/'.$transaksi->id_transaksi.'/admin-rekap', [
            'data_jemput_pangan' => ['supir' => 'Diubah diam-diam'],
        ])->assertForbidden();
    }
}
