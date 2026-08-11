<?php

namespace Tests\Feature\Transaksi;

use App\Models\JaminanMakloon;
use App\Models\Role;
use App\Models\Transaksi;
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

    public function test_submit_ditolak_kalau_jaminan_belum_diatur(): void
    {
        $transaksi = $this->buatTransaksi();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('submit'))
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Jaminan makloon belum diatur'));

        $this->assertSame('makloon_kirim', $transaksi->fresh()->current_stage);
    }

    public function test_submit_ditolak_kalau_kuantum_melebihi_kapasitas_harian(): void
    {
        $this->buatJaminan(kapasitasPerHari: 500);
        $transaksi = $this->buatTransaksi();

        // Guard jaminan sengaja dijalankan sebelum pemeriksaan dokumen, jadi penolakan yang
        // muncul adalah soal kapasitas -- bukan "Dokumen belum lengkap" yang menyesatkan.
        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('submit'))
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'kapasitas harian'));
    }

    public function test_submit_lolos_kalau_masih_di_dalam_kapasitas(): void
    {
        $this->buatJaminan(kapasitasPerHari: 5_000);
        $transaksi = $this->buatTransaksi();

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('draft'))->assertOk();

        foreach (self::FOTO_KIRIM as $jenis) {
            $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/foto", [
                'jenis_foto' => $jenis,
                'foto' => File::image("{$jenis}.jpg"),
            ])->assertCreated();
        }

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('submit'))
            ->assertOk();

        $this->assertSame('makloon_terima', $transaksi->fresh()->current_stage);
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

    private function buatJaminan(float $kapasitasPerHari): void
    {
        JaminanMakloon::create([
            'makloon_user_id' => $this->makloon->id,
            'jaminan_rp' => 100_000_000,
            'kapasitas_per_hari_kg' => $kapasitasPerHari,
            'batas_hari' => 30,
        ]);
    }

    private function buatTransaksi(): Transaksi
    {
        Sanctum::actingAs($this->makloon);

        return Transaksi::findOrFail(
            $this->postJson('/api/transaksi')->assertCreated()->json('data.id_transaksi')
        );
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
}
