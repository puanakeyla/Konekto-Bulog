<?php

namespace Tests\Feature\Operasi;

use App\Models\PermintaanOperasi;
use App\Models\Role;
use App\Models\User;
use App\Services\Operasi\OperasiService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Laravel\Sanctum\Sanctum;
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class OperasiStandaloneTest extends TestCase
{
    use RefreshDatabase;

    private OperasiService $service;

    private User $operasi;

    private User $pengadaan;

    private User $gudang;

    protected function setUp(): void
    {
        parent::setUp();

        $this->seed(RoleSeeder::class);
        $this->service = app(OperasiService::class);

        $this->operasi = $this->buatUser('operasi');
        $this->pengadaan = $this->buatUser('pengadaan');
        $this->gudang = $this->buatUser('gudang');
    }

    public function test_operasi_mengajukan_permintaan_dengan_jumlah_bebas(): void
    {
        $permintaan = $this->service->ajukan($this->operasi, 1500);

        $this->assertSame('1500.00', $permintaan->gabah_diolah_kg);
        $this->assertSame('menunggu_pengadaan', $permintaan->status_out);
        $this->assertSame($this->operasi->id, $permintaan->created_by);
        $this->assertNull($permintaan->no_out);
    }

    public function test_pengadaan_mengeluarkan_out(): void
    {
        $permintaan = $this->service->ajukan($this->operasi, 2000);

        $decided = $this->service->putuskan($permintaan, 'dikeluarkan', 'OUT-001', null, null, $this->pengadaan);

        $this->assertSame('dikeluarkan', $decided->status_out);
        $this->assertSame('OUT-001', $decided->no_out);
        $this->assertSame('2000.00', $decided->kuantum_out); // default = gabah diolah
        $this->assertSame($this->pengadaan->id, $decided->reviewed_by);
    }

    public function test_out_menolak_nomor_duplikat(): void
    {
        $this->service->putuskan($this->service->ajukan($this->operasi, 100), 'dikeluarkan', 'OUT-DUP', null, null, $this->pengadaan);
        $lain = $this->service->ajukan($this->operasi, 200);

        $this->expectException(HttpException::class);
        $this->service->putuskan($lain, 'dikeluarkan', 'OUT-DUP', null, null, $this->pengadaan);
    }

    public function test_pengadaan_mengembalikan_lalu_operasi_ajukan_ulang(): void
    {
        $permintaan = $this->service->ajukan($this->operasi, 500);

        $dikembalikan = $this->service->putuskan($permintaan, 'dikembalikan', null, null, 'Stok belum tersedia.', $this->pengadaan);
        $this->assertSame('dikembalikan', $dikembalikan->status_out);
        $this->assertSame('Stok belum tersedia.', $dikembalikan->catatan_pengembalian);

        $ulang = $this->service->ajukanUlang($dikembalikan, 400);
        $this->assertSame('menunggu_pengadaan', $ulang->status_out);
        $this->assertSame('400.00', $ulang->gabah_diolah_kg);
        $this->assertNull($ulang->catatan_pengembalian);
    }

    public function test_isi_hasil_menghitung_rendemen_otomatis(): void
    {
        $permintaan = $this->service->ajukan($this->operasi, 1000);
        $this->service->putuskan($permintaan, 'dikeluarkan', 'OUT-R', null, null, $this->pengadaan);

        $hasil = $this->service->isiHasil($permintaan->fresh(), [
            'no_mo' => 'MO-1', 'no_tm' => 'TM-1', 'hgl_kg' => 600,
        ]);

        $this->assertSame('MO-1', $hasil->no_mo);
        // 600 / 1000 * 100 = 60.
        $this->assertSame('60.00', $hasil->rendemen_persen);
    }

    public function test_isi_hasil_ditolak_sebelum_out_keluar(): void
    {
        $permintaan = $this->service->ajukan($this->operasi, 1000);

        $this->expectException(HttpException::class);
        $this->service->isiHasil($permintaan, ['no_mo' => 'MO-1', 'no_tm' => 'TM-1']);
    }

    public function test_gudang_menerima_batch_setelah_hasil_terisi(): void
    {
        $permintaan = $this->service->ajukan($this->operasi, 1000);
        $this->service->putuskan($permintaan, 'dikeluarkan', 'OUT-G', null, null, $this->pengadaan);
        $this->service->isiHasil($permintaan->fresh(), ['no_mo' => 'MO-1', 'no_tm' => 'TM-1', 'hgl_kg' => 600]);

        $gudang = $this->service->terimaGudang($permintaan->fresh(), [
            'tanggal_masuk' => '2026-07-18', 'nama_gudang' => 'Gudang A', 'no_tm' => 'TM-1',
        ]);

        $this->assertSame('Gudang A', $gudang->nama_gudang);
        $this->assertSame($permintaan->id, $gudang->permintaan_operasi_id);
    }

    public function test_gudang_ditolak_jika_hasil_belum_terisi(): void
    {
        $permintaan = $this->service->ajukan($this->operasi, 1000);
        $this->service->putuskan($permintaan, 'dikeluarkan', 'OUT-G2', null, null, $this->pengadaan);

        $this->expectException(HttpException::class);
        $this->service->terimaGudang($permintaan->fresh(), [
            'tanggal_masuk' => '2026-07-18', 'nama_gudang' => 'Gudang A', 'no_tm' => 'TM-1',
        ]);
    }

    // ---------- HTTP ----------

    public function test_post_permintaan_via_http_sukses(): void
    {
        Sanctum::actingAs($this->operasi);

        $response = $this->postJson('/api/operasi', ['gabah_diolah_kg' => 1234]);

        $response->assertCreated();
        $response->assertJsonPath('data.status_out', 'menunggu_pengadaan');
    }

    public function test_post_permintaan_ditolak_untuk_role_selain_operasi(): void
    {
        Sanctum::actingAs($this->pengadaan);

        $response = $this->postJson('/api/operasi', ['gabah_diolah_kg' => 100]);

        $response->assertForbidden();
    }

    public function test_patch_out_via_http_oleh_pengadaan(): void
    {
        $permintaan = $this->service->ajukan($this->operasi, 500);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->patchJson("/api/operasi/{$permintaan->id}/out", [
            'keputusan' => 'dikeluarkan',
            'no_out' => 'OUT-HTTP-1',
        ]);

        $response->assertOk();
        $response->assertJsonPath('data.no_out', 'OUT-HTTP-1');
    }

    public function test_patch_out_via_http_ditolak_untuk_operasi(): void
    {
        $permintaan = $this->service->ajukan($this->operasi, 500);

        Sanctum::actingAs($this->operasi);

        $response = $this->patchJson("/api/operasi/{$permintaan->id}/out", [
            'keputusan' => 'dikeluarkan',
            'no_out' => 'OUT-X',
        ]);

        $response->assertForbidden();
    }

    public function test_index_menampilkan_permintaan(): void
    {
        $this->service->ajukan($this->operasi, 111);
        $this->service->ajukan($this->operasi, 222);

        Sanctum::actingAs($this->pengadaan);

        $response = $this->getJson('/api/operasi');

        $response->assertOk();
        $this->assertCount(2, $response->json('data'));
        $response->assertJsonPath('meta.total', 2);
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
