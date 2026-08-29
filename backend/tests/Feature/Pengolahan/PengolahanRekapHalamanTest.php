<?php

namespace Tests\Feature\Pengolahan;

use App\Models\PengolahanGudang;
use App\Models\PengolahanLhpk;
use App\Models\PengolahanMo;
use App\Models\PengolahanMoDetail;
use App\Models\Role;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Rekap Pengolahan merakit paginatornya sendiri dan memakai $ringkasan->baris sebagai total,
 * bukan COUNT(*) kedua dari paginate(). Berkas ini menjaga dua hal yang bisa diam-diam rusak
 * karenanya: totalnya harus tetap sama dengan jumlah baris sebenarnya (kalau salah satu LEFT
 * JOIN mulai menggandakan baris, angkanya menggelembung tanpa error), dan penomoran halaman
 * harus tetap membelah himpunan yang sama tanpa baris hilang maupun dobel.
 */
class PengolahanRekapHalamanTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        $this->admin = User::factory()->create(['role_id' => Role::where('nama_role', 'admin')->value('id')]);
    }

    private function buatPengolahan(int $jumlah, ?PengolahanMo $mo = null): array
    {
        $makloon = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT Uji',
        ]);

        $dibuat = [];
        for ($i = 0; $i < $jumlah; $i++) {
            static $urut = 0;
            $urut++;
            $id = sprintf('%05d/08/2026/GDG', $urut);

            $p = TransaksiPengolahan::create([
                'id_pengolahan' => $id,
                'skema' => 'GDG',
                'makloon_user_id' => $makloon->id,
                'current_stage' => 'operasi',
                'status_keseluruhan' => 'berjalan',
                'created_by' => $this->admin->id,
            ]);

            // Skema GDG masuk rekap admin begitu data gudangnya diterima.
            PengolahanGudang::create(['transaksi_pengolahan_id' => $id, 'kuantum_hgl' => 5000, 'status' => 'diterima']);
            PengolahanLhpk::create(['transaksi_pengolahan_id' => $id, 'kuantum_gabah_diolah' => 8000, 'kuantum_beras_hgl' => 5000, 'status' => 'diterima']);

            if ($mo) {
                PengolahanMoDetail::create(['pengolahan_mo_id' => $mo->id, 'transaksi_pengolahan_id' => $id]);
            }

            $dibuat[] = $p;
        }

        return $dibuat;
    }

    public function test_total_halaman_sama_dengan_jumlah_baris_sebenarnya(): void
    {
        $mo = PengolahanMo::create([
            'no_mo' => 'MO-1',
            'makloon_user_id' => User::factory()->create(['role_id' => Role::where('nama_role', 'makloon')->value('id')])->id,
            'status' => 'proses',
            'review_status' => 'diterima',
        ]);

        // Sebagian bergabung dalam satu MO, sisanya lepas: kalau LEFT JOIN ke mo_detail/mo
        // menggandakan baris, yang bergabung inilah yang pertama membuat totalnya salah.
        $this->buatPengolahan(4, $mo);
        $this->buatPengolahan(3);

        Sanctum::actingAs($this->admin);
        $response = $this->getJson('/api/pengolahan/rekap?per_page=100')->assertOk();

        $this->assertSame(7, $response->json('total'));
        $this->assertSame(7, $response->json('ringkasan.baris'));
        $this->assertCount(7, $response->json('data'));
    }

    public function test_penomoran_halaman_membelah_tanpa_baris_hilang_atau_dobel(): void
    {
        $this->buatPengolahan(7);

        Sanctum::actingAs($this->admin);

        $satu = $this->getJson('/api/pengolahan/rekap?per_page=4&page=1')->assertOk();
        $dua = $this->getJson('/api/pengolahan/rekap?per_page=4&page=2')->assertOk();

        $this->assertSame(7, $satu->json('total'));
        $this->assertCount(4, $satu->json('data'));
        $this->assertCount(3, $dua->json('data'));

        $idSatu = array_column($satu->json('data'), 'id_pengolahan');
        $idDua = array_column($dua->json('data'), 'id_pengolahan');

        $this->assertEmpty(array_intersect($idSatu, $idDua), 'Halaman 1 dan 2 memuat baris yang sama.');
        $this->assertCount(7, array_unique([...$idSatu, ...$idDua]));
    }
}
