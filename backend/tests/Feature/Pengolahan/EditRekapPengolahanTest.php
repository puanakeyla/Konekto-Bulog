<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Gudang;
use App\Models\PengolahanMo;
use App\Models\Role;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Koreksi rekap pengolahan: admin bebas seluruh blok, role lain hanya selama jatah editnya
 * masih ada DAN hanya blok milik role-nya. Padanan AksesEditRekapTest untuk rantai kedua.
 */
class EditRekapPengolahanTest extends TestCase
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

    public function test_tanpa_jatah_role_ditolak(): void
    {
        $id = $this->sampaiMo();

        $this->actingAs($this->user['gudang'])
            ->patchJson($this->url($id), ['data_gudang' => ['supir' => 'Ganti']])
            ->assertForbidden();

        $this->assertSame('Budi', TransaksiPengolahan::find($id)->dataGudang->supir);
    }

    public function test_gudang_berjatah_bisa_memperbaiki_bloknya_dan_jatah_berkurang(): void
    {
        $id = $this->sampaiMo();
        $this->user['gudang']->update(['akses_edit_sisa' => 2]);

        $this->actingAs($this->user['gudang'])
            ->patchJson($this->url($id), ['data_gudang' => ['supir' => 'Supir Benar', 'kuantum_hgl' => 12400]])
            ->assertOk();

        $gudangRow = TransaksiPengolahan::find($id)->dataGudang;
        $this->assertSame('Supir Benar', $gudangRow->supir);
        $this->assertEquals(12400, $gudangRow->kuantum_hgl);
        $this->assertSame(1, $this->user['gudang']->fresh()->akses_edit_sisa);
    }

    public function test_blok_role_lain_disaring_dan_jatah_utuh_saat_ditolak(): void
    {
        $id = $this->sampaiMo();
        $this->user['gudang']->update(['akses_edit_sisa' => 1]);

        // Payload dirakit manual menyertakan blok LHPK -- harus disaring, bukan diterapkan.
        $this->actingAs($this->user['gudang'])
            ->patchJson($this->url($id), [
                'data_gudang' => ['supir' => 'Supir Benar'],
                'data_lhpk' => ['kuantum_beras_hgl' => 999],
            ])
            ->assertOk();

        $this->assertEquals(12500, TransaksiPengolahan::find($id)->dataLhpk->kuantum_beras_hgl);

        // Kirim HANYA blok milik role lain: ditolak, dan jatah tidak boleh ikut terpakai.
        $this->user['gudang']->update(['akses_edit_sisa' => 1]);
        $this->actingAs($this->user['gudang'])
            ->patchJson($this->url($id), ['data_lhpk' => ['kuantum_beras_hgl' => 999]])
            ->assertForbidden();

        $this->assertSame(1, $this->user['gudang']->fresh()->akses_edit_sisa);
    }

    /** Ini yang dulu tidak terjadi apa-apa saat aksesnya dibuka: Operasi & Pengadaan main di level MO. */
    public function test_operasi_dan_pengadaan_memperbaiki_nomor_di_level_mo(): void
    {
        $id = $this->sampaiMo();
        $this->user['operasi']->update(['akses_edit_sisa' => 1]);
        $this->user['pengadaan']->update(['akses_edit_sisa' => 1]);

        $this->actingAs($this->user['operasi'])
            ->patchJson($this->url($id), ['mo' => ['no_mo' => 'MO/BENAR', 'no_tm_ada' => 'TM/ADA/9']])
            ->assertOk();

        $this->actingAs($this->user['pengadaan'])
            ->patchJson($this->url($id), ['mo' => ['no_out' => 'OUT/BENAR', 'tanggal_out' => '2026-08-05']])
            ->assertOk();

        $mo = PengolahanMo::first();
        $this->assertSame('MO/BENAR', $mo->no_mo);
        $this->assertSame('TM/ADA/9', $mo->no_tm_ada);
        $this->assertSame('OUT/BENAR', $mo->no_out);
    }

    /** Operasi tidak boleh menyentuh No. OUT, dan Pengadaan tidak boleh menyentuh No. MO. */
    public function test_kolom_mo_disaring_per_role(): void
    {
        $id = $this->sampaiMo();
        $this->user['operasi']->update(['akses_edit_sisa' => 1]);
        $noMoAwal = PengolahanMo::first()->no_mo;

        $this->actingAs($this->user['operasi'])
            ->patchJson($this->url($id), ['mo' => ['no_out' => 'OUT/CURI']])
            ->assertForbidden();

        $this->user['pengadaan']->update(['akses_edit_sisa' => 1]);
        $this->actingAs($this->user['pengadaan'])
            ->patchJson($this->url($id), ['mo' => ['no_mo' => 'MO/CURI', 'no_out' => 'OUT/SAH']])
            ->assertOk();

        $mo = PengolahanMo::first();
        $this->assertSame($noMoAwal, $mo->no_mo);
        $this->assertSame('OUT/SAH', $mo->no_out);
    }

    public function test_admin_bisa_mengubah_semua_blok_tanpa_jatah(): void
    {
        $id = $this->sampaiMo();

        $this->actingAs($this->user['admin'])
            ->patchJson($this->url($id), [
                'data_gudang' => ['supir' => 'Dibetulkan Admin'],
                'data_lhpk' => ['kuantum_beras_hgl' => 12000],
                'mo' => ['no_mo' => 'MO/ADMIN'],
            ])
            ->assertOk();

        $pengolahan = TransaksiPengolahan::find($id);
        $this->assertSame('Dibetulkan Admin', $pengolahan->dataGudang->supir);
        $this->assertEquals(12000, $pengolahan->dataLhpk->kuantum_beras_hgl);
        $this->assertSame('MO/ADMIN', PengolahanMo::first()->no_mo);

        // Berkali-kali, karena admin tidak berjatah.
        $this->actingAs($this->user['admin'])
            ->patchJson($this->url($id), ['data_gudang' => ['supir' => 'Sekali Lagi']])
            ->assertOk();
    }

    public function test_makloon_tetap_tidak_boleh_menyentuh_rantai_pengolahan(): void
    {
        $id = $this->sampaiMo();
        $this->makloon->update(['akses_edit_sisa' => 5]);

        $this->actingAs($this->makloon)
            ->patchJson($this->url($id), ['data_gudang' => ['supir' => 'Bukan Urusan Saya']])
            ->assertForbidden();
    }

    public function test_no_lhpk_ganda_ditolak(): void
    {
        $pertama = $this->sampaiMo();
        $kedua = $this->sampaiMo('LHPK/002', 'MO/002');

        $this->actingAs($this->user['admin'])
            ->patchJson($this->url($kedua), ['data_lhpk' => ['no_lhpk' => 'LHPK/001']])
            ->assertStatus(422);

        $this->assertSame('LHPK/002', TransaksiPengolahan::find($kedua)->dataLhpk->no_lhpk);
        $this->assertSame('LHPK/001', TransaksiPengolahan::find($pertama)->dataLhpk->no_lhpk);
    }

    public function test_admin_menghapus_pengolahan_dan_total_mo_disamakan(): void
    {
        [$a, $b] = $this->duaDalamSatuMo();
        $mo = PengolahanMo::first();
        $this->assertEquals(25000, $mo->total_kuantum_hgl);

        $this->actingAs($this->user['admin'])->deleteJson('/api/pengolahan/'.$a)->assertNoContent();

        $this->assertNull(TransaksiPengolahan::find($a));
        $this->assertDatabaseMissing('pengolahan_gudang', ['transaksi_pengolahan_id' => $a]);
        $this->assertDatabaseMissing('pengolahan_mo_detail', ['transaksi_pengolahan_id' => $a]);
        // Total MO ikut menyusut; kalau tidak, MO tetap menghitung baris yang sudah tidak ada.
        $this->assertEquals(12500, $mo->fresh()->total_kuantum_hgl);

        // Anggota terakhir dihapus -> MO ikut dibuang, bukan ditinggal tanpa isi.
        $this->actingAs($this->user['admin'])->deleteJson('/api/pengolahan/'.$b)->assertNoContent();
        $this->assertNull(PengolahanMo::find($mo->id));
    }

    /** Jalur non-admin di route yang sama tetap "batalkan yang masih kosong", bukan hapus. */
    public function test_role_tahap_tidak_bisa_menghapus_pengolahan_yang_sudah_berisi(): void
    {
        $id = $this->sampaiMo();

        $this->actingAs($this->user['gudang'])->deleteJson('/api/pengolahan/'.$id)->assertStatus(422);

        $this->assertNotNull(TransaksiPengolahan::find($id));
    }

    /**
     * Kolom No. MO/TM/OUT digabung vertikal di frontend, dan sel gabungan hanya benar kalau
     * anggota satu MO berdampingan. Baris tanpa MO yang lahir DI ANTARA dua anggota itu adalah
     * kasus yang dulu memecah selnya.
     */
    public function test_anggota_satu_mo_berdampingan_di_rekap(): void
    {
        [$a, $b] = $this->duaDalamSatuMo();
        $tengah = $this->sampaiOperasi('LHPK/C');

        TransaksiPengolahan::whereKey($a)->update(['created_at' => '2026-08-01 10:00:00']);
        TransaksiPengolahan::whereKey($tengah)->update(['created_at' => '2026-08-01 10:01:00']);
        TransaksiPengolahan::whereKey($b)->update(['created_at' => '2026-08-01 10:02:00']);
        PengolahanMo::query()->update(['created_at' => '2026-08-01 10:03:00']);

        $respons = $this->actingAs($this->user['admin'])->getJson('/api/pengolahan/rekap?skema=GDG')->assertOk();

        // Kartu ringkasan dihitung lewat query terpisah yang TIDAK boleh ikut kena join pengurut
        // di atas -- join yang menggandakan baris akan menggelembungkan COUNT(*)-nya.
        $respons->assertJsonPath('ringkasan.baris', 3);
        $respons->assertJsonPath('ringkasan.beras_hgl', 37500);

        $ids = $respons->json('data.*.id_pengolahan');
        $jarak = abs(array_search($a, $ids, true) - array_search($b, $ids, true));
        $this->assertSame(1, $jarak, 'Urutan rekap: '.implode(' | ', $ids));
    }

    private function url(string $id): string
    {
        return '/api/pengolahan/'.$id.'/admin-rekap';
    }

    /** Dua pengolahan GDG dalam SATU MO -- bentuk yang membuat satu nomor TM dipakai bersama. */
    private function duaDalamSatuMo(): array
    {
        $a = $this->sampaiOperasi('LHPK/A');
        $b = $this->sampaiOperasi('LHPK/B');

        $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', ['pengolahan_ids' => [$a, $b], 'no_mo' => 'MO/GABUNG'])
            ->assertStatus(201);

        return [$a, $b];
    }

    /** Satu pengolahan GDG yang sudah lengkap dan tergabung dalam MO. */
    private function sampaiMo(string $noLhpk = 'LHPK/001', string $noMo = 'MO/001'): string
    {
        $id = $this->sampaiOperasi($noLhpk);

        $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', ['pengolahan_ids' => [$id], 'no_mo' => $noMo])
            ->assertStatus(201);

        return $id;
    }

    /** Satu pengolahan GDG yang datanya sudah diterima Operasi, tapi BELUM digabung ke MO. */
    private function sampaiOperasi(string $noLhpk): string
    {
        $id = $this->actingAs($this->user['gudang'])
            ->postJson('/api/pengolahan', ['skema' => 'GDG', 'gudang_id' => $this->gudang->id])
            ->assertStatus(201)
            ->json('data.id_pengolahan');

        $this->actingAs($this->user['gudang'])
            ->patchJson('/api/pengolahan/'.$id.'/gudang', [
                'makloon_user_id' => $this->makloon->id,
                'tanggal_masuk_gudang' => '2026-08-03',
                'kuantum_hgl' => 12480,
                'plat_mobil' => 'BE 1234 AB',
                'supir' => 'Budi',
                'kirim' => true,
            ])->assertOk();

        $this->actingAs($this->user['ub_jastasma'])->postJson('/api/pengolahan/'.$id.'/terima')->assertOk();

        $this->actingAs($this->user['ub_jastasma'])
            ->patchJson('/api/pengolahan/'.$id.'/lhpk', [
                'no_lhpk' => $noLhpk,
                'tanggal_lhpk' => '2026-08-03',
                'kuantum_gabah_diolah' => 20000,
                'kuantum_beras_hgl' => 12500,
                'broken' => 15,
                'menir' => 6.5,
                'katul' => 6.5,
                'ka1' => 6.5,
                'ka2' => 6.5,
                'ka3' => 6.5,
                'reject' => 1000,
                'kirim' => true,
            ])->assertOk();

        $this->actingAs($this->user['operasi'])->postJson('/api/pengolahan/'.$id.'/terima')->assertOk();

        return $id;
    }
}
