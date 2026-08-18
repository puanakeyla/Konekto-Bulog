<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataMakloonMpp;
use App\Models\DataMakloonTerima;
use App\Models\DataPengadaan;
use App\Models\JaminanMakloon;
use App\Models\PengolahanLhpk;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\TransaksiPengolahan;
use App\Models\User;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Testing\File;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Jaminan makloon adalah gerbang masuk setiap transaksi: tanpa jaminan yang diatur Operasi,
 * makloon tidak boleh MENGIRIM. Yang diuji di sini adalah letak gerbangnya (kirim, bukan
 * draft) dan dua penolakan yang bisa dipicu tanpa data PO.
 *
 * TIDAK diuji: batas kapasitas total (stok belum ADM/belum olah), karena angkanya baru
 * bergerak setelah ada po_detail ber-No IN + LHPK diterima -- fixture-nya jauh lebih besar
 * daripada nilai ujinya. Lihat JaminanMakloonController::stokBelumAdmBelumOlah().
 */
class JaminanMakloonTest extends TestCase
{
    use RefreshDatabase;

    private const FOTO_KIRIM = [
        'foto_petani',
        'foto_gabah',
        'foto_serah_terima',
        'foto_pembayaran',
        'foto_surat_pernyataan',
    ];

    private User $makloon;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('foto-transaksi');
        $this->seed(RoleSeeder::class);

        $this->makloon = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT. UJI JAMINAN',
        ]);
    }

    /**
     * Inti perbaikan ini: sebelumnya guard jalan sebelum percabangan draft/submit, sehingga
     * makloon yang jaminannya belum diisi Operasi tidak bisa menyimpan draft sama sekali.
     */
    public function test_draft_tetap_bisa_disimpan_walau_jaminan_belum_diatur(): void
    {
        $transaksi = $this->buatTransaksi();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('draft'))
            ->assertOk();
    }

    public function test_mpp_makloon_kirim_lolos_walau_jaminan_belum_diatur(): void
    {
        $transaksi = $this->buatTransaksi();

        // Draft WAJIB lebih dulu: foto menempel pada record tahap, dan sebelum recordnya lahir
        // FotoUploadService menolak dengan "Tidak ada data makloon untuk transaksi ini."
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('draft'))
            ->assertOk();
        $this->lengkapiFotoKirim($transaksi);

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('submit'))
            ->assertOk();

        $this->assertSame('makloon_terima', $transaksi->fresh()->current_stage);
    }

    public function test_mpp_makloon_terima_ditolak_kalau_jaminan_belum_diatur(): void
    {
        $transaksi = $this->mppSampaiMakloonTerima();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('submit'))
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Jaminan makloon belum diatur'));
    }

    public function test_mpp_makloon_terima_ditolak_kalau_kuantum_bongkar_melebihi_kapasitas_harian(): void
    {
        $this->buatJaminan(kapasitasPerHari: 500);
        $transaksi = $this->mppSampaiMakloonTerima();

        // Guard jaminan sengaja dijalankan sebelum pemeriksaan dokumen terima, jadi penolakan yang
        // muncul adalah soal kapasitas -- bukan "Dokumen belum lengkap" yang menyesatkan.
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('submit'))
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Kuota harian'));
    }

    /**
     * Sisa kuota harian HANGUS saat ganti hari, tidak digulung. Kalau digulung, makloon yang
     * hari ini cuma pakai 2.000 dari 3.000 akan bisa memasukkan 4.000 besok -- dan itu bukan
     * aturannya.
     */
    public function test_sisa_kuota_harian_tidak_digulung_ke_hari_berikutnya(): void
    {
        $this->buatJaminan(kapasitasPerHari: 3_000);
        $this->stokBelumSelesai('2026-08-01', 2_000);

        $transaksi = $this->buatTransaksi();
        DataMakloonMpp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum' => 4_000,
            'tanggal_bongkar' => '2026-08-02',
            'status' => 'diterima',
        ]);
        $transaksi->update(['current_stage' => 'makloon_terima']);

        // 1.000 kg sisa tanggal 01 TIDAK menambah jatah tanggal 02.
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", [...$this->dataMakloonTerima('submit'), 'kuantum_bongkar' => 3_500])
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Kuota harian')
                && str_contains($pesan, 'sisa 3.000 kg'));
    }

    /**
     * Kuota baru terbuka setelah LHPK MASUK REKAP (status `diterima`) -- keputusan pemilik,
     * supaya angka gerbang identik dengan kolom neraca "Stok Pengurang LHPK".
     * LHPK yang baru dikirim (menunggu_review) BELUM membuka apa pun.
     */
    public function test_hanya_lhpk_yang_sudah_masuk_rekap_yang_membuka_kuota(): void
    {
        $this->buatJaminan(kapasitasPerHari: 100, batasHari: 1);

        // stokSudahIn(), BUKAN stokBelumSelesai(): tunggakan diukur dari `gabah_sudah_in`, yang
        // baru terisi setelah Pengadaan menerbitkan No IN. Gabah yang cuma dibongkar tanpa PO
        // tidak membebani plafon sama sekali -- konsekuensi yang disadari dari menyamakan angka
        // gerbang dengan kolom neraca.
        $this->stokSudahIn(980);

        $transaksi = $this->buatTransaksi();

        $tertahan = fn () => $this->patchJson(
            "/api/transaksi/{$transaksi->id_transaksi}/makloon-terima",
            [...$this->dataMakloonTerima('submit'), 'kuantum_bongkar' => 1],
        );

        $tertahan()->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'belum diolah UB'));

        $pengolahan = TransaksiPengolahan::create([
            'id_pengolahan' => '00001/08/2026/GDG',
            'skema' => 'GDG',
            'makloon_user_id' => $this->makloon->id,
            'current_stage' => 'operasi',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->makloon->id,
        ]);
        $lhpk = PengolahanLhpk::create([
            'transaksi_pengolahan_id' => $pengolahan->id_pengolahan,
            'kuantum_gabah_diolah' => 980,
            'status' => 'draft',
        ]);

        // Masih draft di meja UB -- belum membuka apa pun.
        $tertahan()->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'belum diolah UB'));

        // Sudah DIKIRIM tapi belum diperiksa: tetap belum membuka. Gabah baru dianggap terolah
        // setelah masuk rekap, supaya angka gerbang identik dengan kolom neraca.
        $lhpk->update(['status' => 'menunggu_review']);
        $tertahan()->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'belum diolah UB'));

        // Masuk rekap -- barulah kuota terbuka.
        $lhpk->update(['status' => 'diterima']);
        $tertahan()->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => ! str_contains($pesan, 'belum diolah UB'));
    }

    /**
     * MPP: masa berlaku diperiksa SEJAK tahap Makloon Kirim, tempat tanggal bongkar diketik.
     *
     * Gerbang kuantum (kuota harian & plafon) memang menunggu Makloon Terima karena hasil
     * timbang baru ada di sana -- tapi kalau tanggalnya saja sudah di luar masa berlaku, tidak
     * ada gunanya membiarkan makloon menyelesaikan seluruh tahap Kirim untuk kemudian ditolak
     * satu tahap kemudian. Itulah keluhan "cuma diperingatkan tapi datanya tetap terkirim".
     */
    public function test_mpp_makloon_kirim_ditolak_kalau_tanggal_di_luar_masa_berlaku(): void
    {
        $this->buatJaminan(kapasitasPerHari: 100_000, batasHari: 1, berlakuMulai: '2026-08-01');
        $transaksi = $this->buatTransaksi();

        $kirim = fn (string $tanggal) => $this->patchJson(
            "/api/transaksi/{$transaksi->id_transaksi}/makloon",
            [...$this->dataMpp('submit'), 'tanggal_bongkar' => $tanggal],
        );

        $diLuar = fn (string $pesan) => str_contains($pesan, 'di luar masa berlaku');

        $kirim('2026-08-13')->assertStatus(422)->assertJsonPath('message', $diLuar);

        // Tanggal yang sah lolos gerbang jaminan; yang menahan tinggal kelengkapan dokumen.
        $kirim('2026-08-01')->assertStatus(422)->assertJsonPath('message', fn (string $p) => ! $diLuar($p));
    }

    /**
     * Gerbang masa berlaku: tanggal bongkar di luar rentang jaminan ditolak walau kuota harian
     * dan plafon masih longgar. Inilah yang membuat angka "batas hari" benar-benar bekerja --
     * sebelumnya tanggal 13 masih bisa diinput padahal jaminan berakhir tanggal 11.
     */
    public function test_tanggal_bongkar_di_luar_masa_berlaku_ditolak(): void
    {
        // Disimpan 01 Agu, berlaku 3 hari -> 01, 02, dan 03 Agu.
        $this->buatJaminan(kapasitasPerHari: 3_000, batasHari: 3, berlakuMulai: '2026-08-01');

        $kirimPada = function (string $tanggalBongkar) {
            $transaksi = $this->buatTransaksi();
            DataMakloonMpp::create([
                'transaksi_id' => $transaksi->id_transaksi,
                'kuantum' => 10,
                'tanggal_bongkar' => $tanggalBongkar,
                'status' => 'diterima',
            ]);
            $transaksi->update(['current_stage' => 'makloon_terima']);

            return $this->patchJson(
                "/api/transaksi/{$transaksi->id_transaksi}/makloon-terima",
                [...$this->dataMakloonTerima('submit'), 'kuantum_bongkar' => 10],
            );
        };

        $diLuar = fn (string $pesan) => str_contains($pesan, 'di luar masa berlaku');

        // Sebelum masa berlaku: gabahnya belum dijamin apa pun.
        $kirimPada('2026-07-31')->assertStatus(422)->assertJsonPath('message', $diLuar);

        // Hari pertama & hari terakhir masih di dalam: lolos gerbang jaminan, tertahan
        // pemeriksaan dokumen -- bukan lagi soal tanggal.
        $kirimPada('2026-08-01')->assertStatus(422)->assertJsonPath('message', fn (string $p) => ! $diLuar($p));
        $kirimPada('2026-08-03')->assertStatus(422)->assertJsonPath('message', fn (string $p) => ! $diLuar($p));

        // Hari keempat: sudah lewat.
        $kirimPada('2026-08-04')->assertStatus(422)->assertJsonPath('message', $diLuar);
    }

    public function test_submit_lolos_kalau_masih_di_dalam_kapasitas(): void
    {
        $this->buatJaminan(kapasitasPerHari: 5_000);
        $transaksi = $this->mppSampaiMakloonTerima();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('draft'))->assertOk();
        $this->lengkapiFotoTerima($transaksi);

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", $this->dataMakloonTerima('submit'))->assertOk();

        $this->assertSame('ub_jastasma', $transaksi->fresh()->current_stage);
    }

    /**
     * Batas TOTAL (stok yang sudah masuk tapi belum diolah), bukan batas harian. Sengaja
     * dipisah karena hitungannya beda sifat: ia menjumlahkan seluruh gabah yang sudah ber-No IN
     * lalu mengurangi yang sudah diolah, jadi ia menyentuh po_detail dan data_pengadaan.
     */
    public function test_submit_ditolak_kalau_stok_belum_olah_melewati_batas_total(): void
    {
        // Kapasitas total = 100 kg/hari x 1 hari. Stok di bawah jauh melampauinya.
        $this->buatJaminan(kapasitasPerHari: 100, batasHari: 1);
        $this->stokSudahIn(980);

        $transaksi = $this->buatTransaksi();

        // kuantum 1 kg supaya batas HARIAN tidak ikut terpicu -- yang diuji batas totalnya.
        $response = $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", [...$this->dataMakloonTerima('submit'), 'kuantum_bongkar' => 1])
            ->assertStatus(422);

        $this->assertStringContainsString('melewati batas jaminan', (string) $response->json('message'));
    }

    public function test_stok_yang_sudah_diolah_tidak_lagi_membebani_batas_total(): void
    {
        $this->buatJaminan(kapasitasPerHari: 100, batasHari: 1);
        $transaksi = $this->stokSudahIn(980);

        // LHPK diterima untuk kuantum yang sama = gabahnya sudah keluar dari stok menggantung.
        $pengolahan = TransaksiPengolahan::create([
            'id_pengolahan' => '00001/08/2026/GDG',
            'skema' => 'GDG',
            'makloon_user_id' => $this->makloon->id,
            'current_stage' => 'operasi',
            'status_keseluruhan' => 'berjalan',
            'created_by' => $this->makloon->id,
        ]);
        PengolahanLhpk::create([
            'transaksi_pengolahan_id' => $pengolahan->id_pengolahan,
            'kuantum_gabah_diolah' => 980,
            'status' => 'diterima',
        ]);

        $baru = $this->buatTransaksi();

        $this->patchJson("/api/transaksi/{$baru->id_transaksi}/makloon-terima", [...$this->dataMakloonTerima('submit'), 'kuantum_bongkar' => 1])
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Dokumen belum lengkap'));

        $this->assertNotNull($transaksi);
    }


    /** Satu transaksi MPP milik makloon ini yang sudah diterima DAN sudah ber-No IN. */
    private function stokSudahIn(float $kuantum): Transaksi
    {
        Sanctum::actingAs($this->makloon);
        $transaksi = Transaksi::findOrFail($this->postJson('/api/transaksi')->assertCreated()->json('data.id_transaksi'));

        DataMakloonMpp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum' => $kuantum,
            'tanggal_bongkar' => '2026-08-01',
            'status' => 'diterima',
        ]);/*  */

        // Stok masuk dihitung dari HASIL TIMBANG milik tahap Makloon Terima, bukan kuantum
        // kirim -- jadi baris inilah yang menentukan, bukan data_makloon_mpp di atas.
        DataMakloonTerima::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum_bongkar' => $kuantum,
            'status' => 'diterima',
        ]);

        $po = DataPengadaan::create([
            'tanggal_bongkar' => '2026-08-01',
            'id_pemasok' => 'P1',
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => $kuantum,
            'harga' => 6500,
            'total_harga' => $kuantum * 6500,
            'no_po' => 'PO-STOK',
            'status' => 'proses',
        ]);
        PoDetail::create([
            'data_pengadaan_id' => $po->id,
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum_kontribusi' => $kuantum,
            'no_in' => 'IN-STOK',
        ]);

        return $transaksi;
    }

    private function stokBelumSelesai(string $tanggal, float $kuantum): Transaksi
    {
        Sanctum::actingAs($this->makloon);
        $transaksi = Transaksi::findOrFail($this->postJson('/api/transaksi')->assertCreated()->json('data.id_transaksi'));

        DataMakloonMpp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum' => $kuantum,
            'tanggal_bongkar' => $tanggal,
            'status' => 'diterima',
        ]);

        // kuantum_bongkar HARUS terisi, bukan 0. "Belum tuntas" diukur sebagai
        // kuantum_bongkar > jumlah LHPK yang sudah diterima (lihat
        // JaminanMakloonController::tanggalBongkarTertuaBelumTuntas); dengan 0 baris ini
        // terbaca sebagai sudah selesai diolah, sehingga tenggat batas hari tidak pernah
        // terpicu dan helper ini tidak menghasilkan stok menggantung sama sekali.
        DataMakloonTerima::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum_bongkar' => $kuantum,
            'status' => 'diterima',
        ]);

        return $transaksi;
    }

    public function test_operasi_menyimpan_jaminan_dan_menimpa_yang_lama(): void
    {
        $operasi = User::factory()->create(['role_id' => Role::where('nama_role', 'operasi')->value('id')]);
        Sanctum::actingAs($operasi);

        $payload = [
            'makloon_user_id' => $this->makloon->id,
            'jaminan_rp' => 100_000_000,
            'kapasitas_per_hari_kg' => 1_000,
            'batas_hari' => 10,
        ];

        $this->postJson('/api/operasi/jaminan-makloon', $payload)
            ->assertOk()
            ->assertJsonPath('data.jaminan.plafon_tunggakan_kg', 10_000);

        $this->postJson('/api/operasi/jaminan-makloon', [...$payload, 'batas_hari' => 20])
            ->assertOk()
            ->assertJsonPath('data.jaminan.batas_hari', 20);

        // Satu baris per makloon -- simpan kedua menimpa, bukan menambah.
        $this->assertSame(1, JaminanMakloon::where('makloon_user_id', $this->makloon->id)->count());
    }

    /**
     * Panel read-only di form Makloon. Endpoint ini TIDAK menerima makloon_user_id -- kalau
     * bisa ditembak per id, ia jadi jalan keluar baru dari isolasi makloon.
     */
    public function test_jaminan_saya_hanya_mengembalikan_milik_pemanggil(): void
    {
        $this->buatJaminan(kapasitasPerHari: 3_000, batasHari: 3);
        $this->stokBelumSelesai('2026-08-01', 2_000);

        Sanctum::actingAs($this->makloon);
        $data = $this->getJson('/api/jaminan-saya?tanggal=2026-08-01')->assertOk()->json('data');

        // assertEquals, bukan assertSame: JSON mengembalikan 3000 (int) untuk float bulat.
        $this->assertEquals(3000, $data['kapasitas_per_hari_kg']);
        $this->assertEquals(2000, $data['terpakai_kg']);
        $this->assertEquals(1000, $data['sisa_harian_kg']);
        $this->assertEquals(9000, $data['plafon_tunggakan_kg']);

        // Makloon lain: jaminannya sendiri belum diatur, jadi null -- bukan jaminan makloon ini.
        $lain = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT. MAKLOON LAIN',
        ]);
        Sanctum::actingAs($lain);
        $this->getJson('/api/jaminan-saya')->assertOk()->assertJsonPath('data', null);
    }

    public function test_makloon_tidak_boleh_mengatur_jaminannya_sendiri(): void
    {
        Sanctum::actingAs($this->makloon);

        $this->postJson('/api/operasi/jaminan-makloon', [
            'makloon_user_id' => $this->makloon->id,
            'jaminan_rp' => 1,
            'kapasitas_per_hari_kg' => 1,
            'batas_hari' => 1,
        ])->assertForbidden();
    }

    /**
     * Masa berlaku jaminan dihitung dari `updated_at` (kapan Operasi terakhir menyimpan), jadi
     * test harus menambatkannya ke tanggal tetap -- kalau dibiarkan "sekarang", seluruh test
     * yang memakai tanggal bongkar Agustus 2026 akan tertolak gerbang masa berlaku begitu
     * tanggal sistem bergeser.
     */
    private function buatJaminan(float $kapasitasPerHari, int $batasHari = 30, string $berlakuMulai = '2026-08-01'): void
    {
        $jaminan = JaminanMakloon::create([
            'makloon_user_id' => $this->makloon->id,
            'jaminan_rp' => 100_000_000,
            'kapasitas_per_hari_kg' => $kapasitasPerHari,
            'batas_hari' => $batasHari,
        ]);

        $jaminan->timestamps = false;
        $jaminan->updated_at = \Carbon\Carbon::parse($berlakuMulai);
        $jaminan->save();
    }

    private function buatTransaksi(): Transaksi
    {
        Sanctum::actingAs($this->makloon);

        return Transaksi::findOrFail(
            $this->postJson('/api/transaksi')->assertCreated()->json('data.id_transaksi')
        );
    }

    /**
     * Bawa satu transaksi MPP sampai tahap Makloon Terima BENAR-BENAR siap diisi.
     *
     * Mengirim Makloon Kirim saja tidak cukup: `current_stage` memang sudah pindah ke
     * `makloon_terima`, tapi data Kirim-nya masih menunggu diperiksa. Selama belum diterima,
     * submitStage() menolak dengan "Data tahap sebelumnya belum diterima." -- persis seperti
     * di aplikasi, form Makloon Terima baru muncul setelah data Kirim diterima. Di skema MPP
     * yang menerima adalah makloon itu sendiri.
     */
    private function mppSampaiMakloonTerima(): Transaksi
    {
        $transaksi = $this->buatTransaksi();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('draft'))->assertOk();
        $this->lengkapiFotoKirim($transaksi);
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('submit'))->assertOk();

        $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/terima")->assertOk();

        return $transaksi->fresh();
    }

    private function lengkapiFotoKirim(Transaksi $transaksi): void
    {
        foreach (self::FOTO_KIRIM as $jenis) {
            $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/foto", [
                'jenis_foto' => $jenis,
                'foto' => File::image("{$jenis}.jpg"),
            ])->assertCreated();
        }
    }

    private function lengkapiFotoTerima(Transaksi $transaksi): void
    {
        foreach (['foto_surat_jalan', 'foto_nota_timbang'] as $jenis) {
            $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/foto", [
                'jenis_foto' => $jenis,
                'foto' => File::image("{$jenis}.jpg"),
            ])->assertCreated();
        }
    }

    private function dataMpp(string $aksi): array
    {
        return [
            'aksi' => $aksi,
            'id_pemasok' => 'PEMASOK-JAMINAN',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 UJI',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => '2026-08-11',
            'kuantum' => 1000,
            'jarak_ke_makloon_km' => 5,
        ];
    }

    private function dataMakloonTerima(string $aksi): array
    {
        return [
            'aksi' => $aksi,
            'kuantum_bongkar' => 1000,
        ];
    }
}
