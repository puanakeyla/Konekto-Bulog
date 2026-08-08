<?php

namespace Tests\Feature\Pengolahan;

use App\Models\Gudang;
use App\Models\PengolahanLhpk;
use App\Models\PengolahanMo;
use App\Models\Role;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use App\Services\Pengolahan\KerjaanPengolahan;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AlurPengolahanTest extends TestCase
{
    use RefreshDatabase;

    private array $user = [];
    private Gudang $gudang;
    private User $makloon;
    /** Makloon yang akan ditulis pengisi tahap pertama -- diset oleh buat(). */
    private User $makloonTahapPertama;

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

    /**
     * Yang dipilih saat membuat adalah GUDANG-nya; makloon menyusul dari pengisi tahap pertama,
     * jadi $makloon di sini hanya menentukan nilai yang dikirim tahap itu nanti.
     */
    private function buat(string $skema, ?User $makloon = null): string
    {
        $pembuat = $skema === 'GDG' ? $this->user['gudang'] : $this->user['ub_jastasma'];
        $this->makloonTahapPertama = $makloon ?? $this->makloon;

        return $this->actingAs($pembuat)
            ->postJson('/api/pengolahan', [
                'skema' => $skema,
                'gudang_id' => $this->gudang->id,
            ])
            ->assertStatus(201)
            ->json('data.id_pengolahan');
    }

    private function isiGudang(string $id, bool $kirim = true)
    {
        return $this->actingAs($this->user['gudang'])
            ->patchJson('/api/pengolahan/'.$id.'/gudang', [
                'makloon_user_id' => $this->makloonTahapPertama->id,
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
                'makloon_user_id' => $this->makloonTahapPertama->id,
                'no_lhpk' => $noLhpk,
                'tanggal_lhpk' => '2026-08-03',
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

    /**
     * Chip antrean di daftar pengolahan bersumber dari satu ekspresi SQL (KerjaanPengolahan).
     * Kalau klasifikasinya melenceng, angka chip dan badge baris ikut melenceng bersama-sama --
     * karena itu keempat kategori diuji sekaligus, bukan satu per satu.
     */
    public function test_klasifikasi_kerjaan_daftar_pengolahan(): void
    {
        // Baru dibuat, belum diisi apa pun -- tidak dihitung sebagai transaksi sama sekali.
        $belumJadiTransaksi = $this->buat('GDG');

        // 'isi' yang sebenarnya: tahap pertama sudah diterima, tahap kedua menunggu giliran.
        $perluDiisi = $this->buat('GDG');
        $this->isiGudang($perluDiisi)->assertOk();
        $this->terima($perluDiisi, 'ub_jastasma')->assertOk();

        $draft = $this->buat('GDG');
        $this->isiGudang($draft, kirim: false)->assertOk();

        $perluDicek = $this->buat('GDG');
        $this->isiGudang($perluDicek)->assertOk();

        $ditolak = $this->buat('GDG');
        $this->isiGudang($ditolak)->assertOk();
        $this->actingAs($this->user['ub_jastasma'])
            ->postJson('/api/pengolahan/'.$ditolak.'/tolak', ['catatan' => 'Kuantum tidak cocok'])
            ->assertOk();

        $response = $this->actingAs($this->user['admin'])->getJson('/api/pengolahan')->assertOk();

        $kerjaan = collect($response->json('data'))->pluck('kerjaan', 'id_pengolahan');
        $this->assertArrayNotHasKey($belumJadiTransaksi, $kerjaan->all());
        $this->assertSame('isi', $kerjaan[$perluDiisi]);
        $this->assertSame('draft', $kerjaan[$draft]);
        $this->assertSame('periksa', $kerjaan[$perluDicek]);
        $this->assertSame('ditolak', $kerjaan[$ditolak]);

        $response->assertJsonPath('kerjaan_hitung.isi', 1)
            ->assertJsonPath('kerjaan_hitung.draft', 1)
            ->assertJsonPath('kerjaan_hitung.periksa', 1)
            ->assertJsonPath('kerjaan_hitung.ditolak', 1)
            ->assertJsonPath('kerjaan_hitung.total', 4);

        // Filter menyaring di server; hitungannya tetap memuat seluruh kategori.
        $this->actingAs($this->user['admin'])
            ->getJson('/api/pengolahan?kerjaan=periksa')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id_pengolahan', $perluDicek)
            ->assertJsonPath('kerjaan_hitung.total', 4);
    }

    /**
     * Rekap Pengolahan mengikuti aturan Rekap SerGab: baris baru muncul setelah data tahap milik
     * role itu DITERIMA, bukan begitu dikirim.
     */
    public function test_rekap_hanya_memuat_data_yang_sudah_diterima(): void
    {
        // A: Gudang baru mengirim, belum diterima UB Jastasma.
        $dikirim = $this->buat('GDG');
        $this->isiGudang($dikirim)->assertOk();

        // B: Gudang sudah diterima UB Jastasma.
        $diterima = $this->buat('GDG');
        $this->isiGudang($diterima)->assertOk();
        $this->terima($diterima, 'ub_jastasma')->assertOk();

        $rekap = fn (string $role) => collect(
            $this->actingAs($this->user[$role])->getJson('/api/pengolahan/rekap')->assertOk()->json('data')
        )->pluck('id_pengolahan')->all();

        $this->assertSame([$diterima], $rekap('gudang'));
        // Admin memakai tahap pertama skema, jadi hasilnya sama untuk GDG.
        $this->assertSame([$diterima], $rekap('admin'));
        // LHPK belum diisi sama sekali; rekap UB Jastasma masih kosong.
        $this->assertSame([], $rekap('ub_jastasma'));
        // Belum ada MO dan belum ada OUT.
        $this->assertSame([], $rekap('operasi'));
        $this->assertSame([], $rekap('pengadaan'));
    }

    /**
     * Stok gudang adalah angka SISTEM per gudang: HGL diterima di gudang itu dikurangi gabah
     * yang sudah diolah. Sebelumnya ia cuma menyalin kuantum HGL transaksinya sendiri.
     */
    public function test_stok_gudang_dihitung_per_gudang_bukan_per_transaksi(): void
    {
        // Satu pengolahan GDG tuntas sampai LHPK diterima: 12.480 masuk, 20.000 diolah.
        $selesai = $this->buat('GDG');
        $this->isiGudang($selesai)->assertOk();
        $this->terima($selesai, 'ub_jastasma')->assertOk();
        $this->isiLhpk($selesai, 'LHPK/900')->assertOk();
        $this->terima($selesai, 'operasi')->assertOk();

        $this->assertEqualsWithDelta(12480 - 20000, Gudang::stokBerjalan($this->gudang->id), 0.01);

        // Pengolahan berikutnya di gudang yang sama: HGL-nya baru terhitung setelah DITERIMA.
        $berjalan = $this->buat('GDG');
        $this->isiGudang($berjalan)->assertOk();
        $this->assertEqualsWithDelta(12480 - 20000, Gudang::stokBerjalan($this->gudang->id), 0.01);

        $this->terima($berjalan, 'ub_jastasma')->assertOk();
        $stokSetelahDiterima = 12480 * 2 - 20000;
        $this->assertEqualsWithDelta($stokSetelahDiterima, Gudang::stokBerjalan($this->gudang->id), 0.01);

        // Angka yang sama itulah yang disnapshot ke LHPK -- bukan angka kiriman klien.
        $this->isiLhpk($berjalan, 'LHPK/901')->assertOk();
        $this->assertEqualsWithDelta(
            $stokSetelahDiterima,
            (float) PengolahanLhpk::where('transaksi_pengolahan_id', $berjalan)->value('kuantum_stok_gudang'),
            0.01,
        );

        // Gudang lain berdiri sendiri.
        $gudangLain = Gudang::create(['kode' => 'ADA08002', 'nama' => 'Gudang B']);
        $this->assertEqualsWithDelta(0, Gudang::stokBerjalan($gudangLain->id), 0.01);
    }

    /** Makloon ditetapkan pengisi tahap pertama; tahap kedua mencocokkan, tidak menimpa. */
    public function test_makloon_hanya_bisa_ditetapkan_tahap_pertama(): void
    {
        $makloonLain = User::create([
            'username' => 'makloon_3',
            'password' => bcrypt('secret12'),
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'Makloon Gamma',
        ]);

        // GDG: Gudang tahap pertama -> dia yang menetapkan.
        $id = $this->buat('GDG');
        $this->assertNull(TransaksiPengolahan::find($id)->makloon_user_id);

        $this->isiGudang($id)->assertOk();
        $this->assertSame($this->makloon->id, TransaksiPengolahan::find($id)->makloon_user_id);

        // UB Jastasma tahap kedua: kiriman makloon-nya diabaikan.
        $this->terima($id, 'ub_jastasma')->assertOk();
        $this->makloonTahapPertama = $makloonLain;
        $this->isiLhpk($id)->assertOk();
        $this->assertSame($this->makloon->id, TransaksiPengolahan::find($id)->makloon_user_id);
    }

    /**
     * Membuat pengolahan cuma memesan nomor + gudang. Selama belum ada data tahap yang disimpan
     * ia belum jadi transaksi: tidak muncul di daftar siapa pun, dan boleh dibatalkan.
     */
    public function test_pengolahan_kosong_belum_jadi_transaksi_dan_bisa_dibatalkan(): void
    {
        $kosong = $this->buat('GDG');

        $this->actingAs($this->user['admin'])
            ->getJson('/api/pengolahan')
            ->assertOk()
            ->assertJsonCount(0, 'data')
            ->assertJsonPath('kerjaan_hitung.total', 0);

        // Detailnya tetap bisa dibuka -- pembuatnya sedang mengisi formnya.
        $this->actingAs($this->user['gudang'])->getJson('/api/pengolahan/'.$kosong)->assertOk();

        $this->actingAs($this->user['gudang'])->deleteJson('/api/pengolahan/'.$kosong)->assertNoContent();
        $this->assertDatabaseMissing('transaksi_pengolahan', ['id_pengolahan' => $kosong]);
    }

    /**
     * Membatalkan pengolahan kosong TIDAK boleh menyisakan lubang penomoran: nomor itu tidak
     * pernah menempel pada data apa pun, jadi ia dipakai ulang. (Beda dengan alur SerGab, yang
     * sengaja tidak memakai ulang nomor karena transaksinya bisa dihapus setelah berisi.)
     */
    public function test_nomor_dipakai_ulang_setelah_pengolahan_kosong_dibatalkan(): void
    {
        $pertama = $this->buat('GDG');
        $this->isiGudang($pertama, kirim: false)->assertOk();

        $dibatalkan = $this->buat('GDG');
        $this->assertSame('00002/08/2026/GDG', $dibatalkan);

        $this->actingAs($this->user['gudang'])->deleteJson('/api/pengolahan/'.$dibatalkan)->assertNoContent();

        // Tanpa lubang: pembuatan berikutnya kembali memakai 00002.
        $this->assertSame('00002/08/2026/GDG', $this->buat('GDG'));
    }

    public function test_pengolahan_yang_sudah_berisi_tidak_bisa_dibatalkan(): void
    {
        $id = $this->buat('GDG');
        $this->isiGudang($id, kirim: false)->assertOk();

        $this->actingAs($this->user['gudang'])->deleteJson('/api/pengolahan/'.$id)->assertStatus(422);
        $this->assertDatabaseHas('transaksi_pengolahan', ['id_pengolahan' => $id]);
    }

    /**
     * Kolom `kerjaan` adalah CACHE dari KerjaanPengolahan::ekspresi(). Bahaya satu-satunya adalah
     * ada titik mutasi yang lupa memanggil segarkan(), dan gejalanya diam: angka chip melenceng
     * tanpa error. Karena itu tiap langkah alur dicek ulang terhadap ekspresi hidupnya.
     */
    public function test_kolom_kerjaan_selalu_sama_dengan_ekspresinya(): void
    {
        $cocok = function (string $konteks) {
            $melenceng = KerjaanPengolahan::joinTahap(DB::table('transaksi_pengolahan'))
                ->selectRaw('transaksi_pengolahan.id_pengolahan, transaksi_pengolahan.kerjaan as tersimpan, '
                    .KerjaanPengolahan::ekspresi().' as hidup')
                ->get()
                ->filter(fn ($b) => $b->tersimpan !== $b->hidup);

            $this->assertCount(0, $melenceng, "kerjaan melenceng setelah {$konteks}: ".$melenceng->toJson());
        };

        $id = $this->buat('GDG');
        $cocok('buat');

        $this->isiGudang($id, kirim: false)->assertOk();
        $cocok('simpan draft');

        $this->isiGudang($id)->assertOk();
        $cocok('kirim tahap');

        $this->actingAs($this->user['ub_jastasma'])
            ->postJson('/api/pengolahan/'.$id.'/tolak', ['catatan' => 'salah'])->assertOk();
        $cocok('tolak tahap');

        $this->isiGudang($id)->assertOk();
        $this->terima($id, 'ub_jastasma')->assertOk();
        $cocok('terima tahap');

        $this->isiLhpk($id, 'LHPK/K1')->assertOk();
        $this->terima($id, 'operasi')->assertOk();
        $cocok('tahap kedua diterima');

        $moId = $this->actingAs($this->user['operasi'])
            ->postJson('/api/mo/gabungkan', ['pengolahan_ids' => [$id], 'no_mo' => 'MO/K1', 'no_tm_ada' => 'TMA/K1', 'no_tm_gudang' => 'TMG/K1'])
            ->assertStatus(201)->json('data.id');
        $cocok('gabung MO');

        $this->actingAs($this->user['operasi'])->postJson("/api/mo/{$moId}/kirim")->assertOk();
        $cocok('kirim MO');

        $this->actingAs($this->user['pengadaan'])->postJson("/api/mo/{$moId}/tolak", ['catatan' => 'ulang'])->assertOk();
        $cocok('tolak MO');

        $this->actingAs($this->user['operasi'])->postJson("/api/mo/{$moId}/kirim")->assertOk();
        $this->actingAs($this->user['pengadaan'])->postJson("/api/mo/{$moId}/terima")->assertOk();
        $cocok('terima MO');

        $this->actingAs($this->user['pengadaan'])
            ->patchJson("/api/mo/{$moId}/out", ['no_out' => 'OUT/K1', 'tanggal_out' => '2026-08-12'])->assertOk();
        $cocok('terbitkan OUT');
    }

    public function test_id_pengolahan_berformat_dan_berurut_per_skema(): void
    {
        $this->assertSame('00001/08/2026/GDG', $this->buat('GDG'));
        $this->assertSame('00002/08/2026/GDG', $this->buat('GDG'));
        $this->assertSame('00001/08/2026/UBJ', $this->buat('UBJ'));
    }
}
