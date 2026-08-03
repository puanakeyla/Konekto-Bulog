<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Gudang;
use App\Models\PengolahanLhpk;
use App\Models\PengolahanMo;
use App\Models\Role;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AlurPengolahanTest extends TestCase
{
    use RefreshDatabase;

    private array $user = [];
    private Gudang $gudang;
    private User $makloon;

    protected function setUp(): void
    {
        parent::setUp();
        $this->seed(RoleSeeder::class);

        foreach (['gudang', 'ub_jastasma', 'operasi', 'pengadaan', 'admin', 'makloon'] as $role) {
            $this->user[$role] = User::create([
                'username' => $role.'_1',
                'password' => bcrypt('secret12'),
                'role_id' => Role::where('nama_role', $role)->value('id'),
                'nama_maklon' => $role === 'makloon' ? 'Makloon Alpha' : null,
            ]);
        }

        $this->makloon = $this->user['makloon'];
        $this->gudang = Gudang::create(['kode' => 'ADA08001', 'nama' => 'Gudang A']);
    }

    private function buat(string $skema, ?User $makloon = null): string
    {
        $pembuat = $skema === 'GDG' ? $this->user['gudang'] : $this->user['ub_jastasma'];

        return $this->actingAs($pembuat)
            ->postJson('/api/pengolahan', [
                'skema' => $skema,
                'makloon_user_id' => ($makloon ?? $this->makloon)->id,
            ])
            ->assertStatus(201)
            ->json('data.id_pengolahan');
    }

    private function isiGudang(string $id, bool $kirim = true)
    {
        return $this->actingAs($this->user['gudang'])
            ->patchJson('/api/pengolahan/'.$id.'/gudang', [
                'gudang_id' => $this->gudang->id,
                'tanggal_masuk_gudang' => '2026-08-03',
                'kuantum_hgl' => 12480,
                'plat_mobil' => 'BE 1234 AB',
                'supir' => 'Budi',
                'kirim' => $kirim,
            ]);
    }

    private function isiLhpk(string $id, string $noLhpk = 'LHPK/001', float $gabah = 20000, float $hgl = 12500, bool $kirim = true)
    {
        return $this->actingAs($this->user['ub_jastasma'])
            ->patchJson('/api/pengolahan/'.$id.'/lhpk', [
                'gudang_tujuan_id' => $this->gudang->id,
                'no_lhpk' => $noLhpk,
                'tanggal_lhpk' => '2026-08-03',
                'kuantum_stok_gudang' => 50000,
                'kuantum_gabah_diolah' => $gabah,
                'kuantum_beras_hgl' => $hgl,
                'kualitas' => 'Medium',
                'broken' => 15,
                'kirim' => $kirim,
            ]);
    }

    private function terima(string $id, string $role)
    {
        return $this->actingAs($this->user[$role])->postJson('/api/pengolahan/'.$id.'/terima');
    }

    /** Bawa satu transaksi sampai berdiri di tahap Operasi dengan data sudah diterima. */
    private function sampaiOperasi(string $skema, string $noLhpk = 'LHPK/001', ?User $makloon = null): string
    {
        $id = $this->buat($skema, $makloon);

        if ($skema === 'GDG') {
            $this->isiGudang($id)->assertOk();
            $this->terima($id, 'ub_jastasma')->assertOk();
            $this->isiLhpk($id, $noLhpk)->assertOk();
        } else {
            $this->isiLhpk($id, $noLhpk)->assertOk();
            $this->terima($id, 'gudang')->assertOk();
            $this->isiGudang($id)->assertOk();
        }

        $this->terima($id, 'operasi')->assertOk();

        return $id;
    }

    public function test_alur_penuh_skema_gdg_sampai_selesai(): void
    {
        $id = $this->sampaiOperasi('GDG');

        $this->assertSame('operasi', TransaksiPengolahan::find($id)->current_stage);

        $moId = $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', [
                'pengolahan_ids' => [$id],
                'no_mo' => 'MO/00832/02/2026/ADA08001',
                'no_tm_ada' => 'TMA/001',
                'no_tm_gudang' => 'TMG/001',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.total_kuantum_hgl', '12500.00')
            ->assertJsonPath('data.total_kuantum_gabah_diolah', '20000.00')
            ->json('data.id');

        $this->actingAs($this->user['operasi'])->postJson("/api/mo/{$moId}/kirim")->assertOk();
        $this->assertSame('pengadaan', TransaksiPengolahan::find($id)->current_stage);

        $this->actingAs($this->user['pengadaan'])->postJson("/api/mo/{$moId}/terima")->assertOk();
        $this->actingAs($this->user['pengadaan'])
            ->patchJson("/api/mo/{$moId}/out", [
                'no_out' => 'OUT/00832/02/2026/ADA08001',
                'tanggal_out' => '2026-08-12',
            ])
            ->assertOk();

        $this->assertSame('selesai', TransaksiPengolahan::find($id)->status_keseluruhan);
        $this->assertSame('lengkap', PengolahanMo::find($moId)->status);
    }

    public function test_alur_penuh_skema_ubj_urutannya_terbalik(): void
    {
        $id = $this->buat('UBJ');

        // Gudang belum boleh mengisi -- di skema UBJ dia tahap kedua.
        $this->isiGudang($id)->assertStatus(422);

        $this->isiLhpk($id)->assertOk();
        $this->assertSame('gudang', TransaksiPengolahan::find($id)->current_stage);

        $this->terima($id, 'gudang')->assertOk();
        $this->isiGudang($id)->assertOk();
        $this->assertSame('operasi', TransaksiPengolahan::find($id)->current_stage);
    }

    public function test_tahap_kedua_tidak_bisa_diisi_sebelum_tahap_pertama_diterima(): void
    {
        $id = $this->buat('GDG');
        $this->isiGudang($id)->assertOk();

        // Data Gudang masih menunggu review; UB Jastasma belum boleh mengisi LHPK.
        $this->isiLhpk($id)->assertStatus(422);
    }

    public function test_tolak_memundurkan_tahap_lalu_bisa_dikirim_ulang(): void
    {
        $id = $this->buat('GDG');
        $this->isiGudang($id)->assertOk();

        $this->actingAs($this->user['ub_jastasma'])
            ->postJson('/api/pengolahan/'.$id.'/tolak', ['catatan' => 'Kuantum tidak cocok notim'])
            ->assertOk();

        $transaksi = TransaksiPengolahan::find($id);
        $this->assertSame('gudang', $transaksi->current_stage);
        $this->assertSame('ditolak', $transaksi->dataGudang->status);
        $this->assertSame('Kuantum tidak cocok notim', $transaksi->dataGudang->catatan_penolakan);
        $this->assertDatabaseHas('riwayat_penolakan', ['pengolahan_id' => $id, 'tahap' => 'gudang']);

        $this->isiGudang($id)->assertOk();
        $this->assertSame('ub_jastasma', TransaksiPengolahan::find($id)->current_stage);
    }

    public function test_mo_menolak_anggota_beda_makloon(): void
    {
        $makloonLain = User::create([
            'username' => 'makloon_2',
            'password' => bcrypt('secret12'),
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'Makloon Beta',
        ]);

        $a = $this->sampaiOperasi('GDG', 'LHPK/001');
        $b = $this->sampaiOperasi('GDG', 'LHPK/002', $makloonLain);

        $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', [
                'pengolahan_ids' => [$a, $b],
                'no_mo' => 'MO/001',
            ])
            ->assertStatus(422);
    }

    public function test_satu_pengolahan_tidak_bisa_masuk_dua_mo(): void
    {
        $id = $this->sampaiOperasi('GDG');

        $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', ['pengolahan_ids' => [$id], 'no_mo' => 'MO/001'])
            ->assertStatus(201);

        $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', ['pengolahan_ids' => [$id], 'no_mo' => 'MO/002'])
            ->assertStatus(422);
    }

    /**
     * Inti tes ini bukan pembatalannya, tapi PENGGABUNGAN ULANG sesudahnya: kalau batalkan()
     * lupa menghapus mo_detail, transaksi ini akan menabrak indeks unik dan bugnya lolos diam-diam.
     */
    public function test_mo_dibatalkan_lalu_anggotanya_bisa_digabung_ulang(): void
    {
        $id = $this->sampaiOperasi('GDG');

        $moId = $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', ['pengolahan_ids' => [$id], 'no_mo' => 'MO/001'])
            ->json('data.id');

        $this->actingAs($this->user['operasi'])->postJson("/api/mo/{$moId}/batalkan")->assertOk();

        $this->assertSame('dibatalkan', PengolahanMo::find($moId)->status);
        $this->assertDatabaseMissing('pengolahan_mo_detail', ['transaksi_pengolahan_id' => $id]);
        $this->assertSame('operasi', TransaksiPengolahan::find($id)->current_stage);

        $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', ['pengolahan_ids' => [$id], 'no_mo' => 'MO/002'])
            ->assertStatus(201);
    }

    public function test_mo_ditolak_memundurkan_anggota_ke_operasi(): void
    {
        $id = $this->sampaiOperasi('GDG');

        $moId = $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', [
                'pengolahan_ids' => [$id],
                'no_mo' => 'MO/001',
                'no_tm_ada' => 'TMA/001',
                'no_tm_gudang' => 'TMG/001',
            ])
            ->json('data.id');

        $this->actingAs($this->user['operasi'])->postJson("/api/mo/{$moId}/kirim")->assertOk();
        $this->actingAs($this->user['pengadaan'])
            ->postJson("/api/mo/{$moId}/tolak", ['catatan' => 'Nomor TM salah'])
            ->assertOk();

        $this->assertSame('operasi', TransaksiPengolahan::find($id)->current_stage);
        $this->assertSame('ditolak', PengolahanMo::find($moId)->review_status);
    }

    public function test_mo_tanpa_nomor_tm_tidak_bisa_dikirim(): void
    {
        $id = $this->sampaiOperasi('GDG');

        $moId = $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', ['pengolahan_ids' => [$id], 'no_mo' => 'MO/001'])
            ->json('data.id');

        $this->actingAs($this->user['operasi'])->postJson("/api/mo/{$moId}/kirim")->assertStatus(422);
    }

    public function test_out_hanya_boleh_setelah_mo_diterima(): void
    {
        $id = $this->sampaiOperasi('GDG');

        $moId = $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', [
                'pengolahan_ids' => [$id],
                'no_mo' => 'MO/001',
                'no_tm_ada' => 'TMA/001',
                'no_tm_gudang' => 'TMG/001',
            ])
            ->json('data.id');

        $this->actingAs($this->user['operasi'])->postJson("/api/mo/{$moId}/kirim")->assertOk();

        $this->actingAs($this->user['pengadaan'])
            ->patchJson("/api/mo/{$moId}/out", ['no_out' => 'OUT/001', 'tanggal_out' => '2026-08-12'])
            ->assertStatus(422);
    }

    public function test_rendemen_dihitung_dan_aman_dari_pembagi_nol(): void
    {
        $id = $this->sampaiOperasi('GDG');

        $lhpk = PengolahanLhpk::where('transaksi_pengolahan_id', $id)->first();
        $this->assertSame(62.5, $lhpk->rendemen);

        $lhpk->kuantum_gabah_diolah = 0;
        $this->assertSame(0.0, $lhpk->rendemen);
    }

    public function test_nomor_lhpk_tidak_boleh_duplikat(): void
    {
        $this->sampaiOperasi('GDG', 'LHPK/001');

        $kedua = $this->buat('GDG');
        $this->isiGudang($kedua)->assertOk();
        $this->terima($kedua, 'ub_jastasma')->assertOk();

        $this->isiLhpk($kedua, 'LHPK/001')
            ->assertStatus(422)
            ->assertJsonValidationErrors('no_lhpk');
    }

    public function test_role_lain_tidak_bisa_mengisi_tahap_bukan_miliknya(): void
    {
        $id = $this->buat('GDG');

        $this->actingAs($this->user['pengadaan'])
            ->patchJson('/api/pengolahan/'.$id.'/gudang', ['kuantum_hgl' => 100])
            ->assertForbidden();
    }

    public function test_makloon_tidak_bisa_mengakses_modul_pengolahan(): void
    {
        $this->actingAs($this->makloon)->getJson('/api/pengolahan')->assertForbidden();
        $this->actingAs($this->makloon)->getJson('/api/mo')->assertForbidden();
    }

    public function test_kandidat_mo_hanya_yang_sudah_diterima_dan_belum_masuk_mo(): void
    {
        $siap = $this->sampaiOperasi('GDG', 'LHPK/001');

        // Masih di tahap gudang, belum layak jadi kandidat.
        $this->buat('GDG');

        $this->actingAs($this->user['operasi'])
            ->getJson('/api/pengolahan/kandidat-mo')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id_pengolahan', $siap);

        $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', ['pengolahan_ids' => [$siap], 'no_mo' => 'MO/001']);

        $this->actingAs($this->user['operasi'])
            ->getJson('/api/pengolahan/kandidat-mo')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_id_pengolahan_berformat_dan_berurut_per_skema(): void
    {
        $this->assertSame('00001/08/2026/GDG', $this->buat('GDG'));
        $this->assertSame('00002/08/2026/GDG', $this->buat('GDG'));
        $this->assertSame('00001/08/2026/UBJ', $this->buat('UBJ'));
    }
}
