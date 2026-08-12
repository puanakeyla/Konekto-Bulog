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
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'kapasitas harian'));
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

    public function test_submit_ditolak_pada_hari_keempat_meski_kapasitas_masih_tersisa(): void
    {
        $this->buatJaminan(kapasitasPerHari: 1_000, batasHari: 3);
        $this->stokBelumSelesai('2026-08-01', 100);

        $transaksi = $this->buatTransaksi();

        DataMakloonMpp::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum' => 50,
            'tanggal_bongkar' => '2026-08-04',
            'status' => 'diterima',
        ]);
        $transaksi->update(['current_stage' => 'makloon_terima']);

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon-terima", [...$this->dataMakloonTerima('submit'), 'kuantum_bongkar' => 50])
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Batas hari jaminan sudah lewat'));
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

        DataMakloonTerima::create([
            'transaksi_id' => $transaksi->id_transaksi,
            'kuantum_bongkar' => 0,
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
            ->assertJsonPath('data.jaminan.kapasitas_total_kg', 10_000);

        $this->postJson('/api/operasi/jaminan-makloon', [...$payload, 'batas_hari' => 20])
            ->assertOk()
            ->assertJsonPath('data.jaminan.batas_hari', 20);

        // Satu baris per makloon -- simpan kedua menimpa, bukan menambah.
        $this->assertSame(1, JaminanMakloon::where('makloon_user_id', $this->makloon->id)->count());
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

    private function buatJaminan(float $kapasitasPerHari, int $batasHari = 30): void
    {
        JaminanMakloon::create([
            'makloon_user_id' => $this->makloon->id,
            'jaminan_rp' => 100_000_000,
            'kapasitas_per_hari_kg' => $kapasitasPerHari,
            'batas_hari' => $batasHari,
        ]);
    }

    private function buatTransaksi(): Transaksi
    {
        Sanctum::actingAs($this->makloon);

        return Transaksi::findOrFail(
            $this->postJson('/api/transaksi')->assertCreated()->json('data.id_transaksi')
        );
    }

    private function mppSampaiMakloonTerima(): Transaksi
    {
        $transaksi = $this->buatTransaksi();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('draft'))->assertOk();
        $this->lengkapiFotoKirim($transaksi);
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('submit'))->assertOk();

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
