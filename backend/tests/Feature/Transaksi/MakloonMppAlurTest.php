<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataMakloonMpp;
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
 * Alur MPP dua tahap milik Makloon: Makloon Kirim (isi data + dokumen) lalu Makloon Terima
 * (cek, isi kuantum bongkar, Terima). Dokumen surat jalan & nota timbang adalah milik tahap
 * Makloon TERIMA -- jadi kelengkapan dokumen saat submit Makloon Kirim tidak boleh menuntut
 * keduanya, dan aksi Terima-lah yang menuntutnya.
 */
class MakloonMppAlurTest extends TestCase
{
    use RefreshDatabase;

    private User $makloon;

    /** Dokumen milik tahap Makloon Kirim. */
    private const FOTO_KIRIM = [
        'foto_petani',
        'foto_gabah',
        'foto_serah_terima',
        'foto_pembayaran',
        'foto_surat_pernyataan',
    ];

    /** Dokumen milik tahap Makloon Terima. */
    private const FOTO_TERIMA = ['foto_surat_jalan', 'foto_nota_timbang'];

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('foto-transaksi');
        $this->seed(RoleSeeder::class);

        $this->makloon = User::factory()->create([
            'role_id' => Role::where('nama_role', 'makloon')->value('id'),
            'nama_maklon' => 'PT. UJI MPP',
        ]);
    }

    public function test_makloon_kirim_bisa_submit_tanpa_surat_jalan_dan_nota_timbang(): void
    {
        $transaksi = $this->buatDraft();

        $this->uploadFoto($transaksi, self::FOTO_KIRIM);

        $this->submit($transaksi)->assertOk();

        $transaksi->refresh();
        $this->assertSame('makloon_terima', $transaksi->current_stage);
        $this->assertSame('menunggu_review', DataMakloonMpp::where('transaksi_id', $transaksi->id_transaksi)->value('status'));
    }

    public function test_makloon_kirim_tetap_menuntut_dokumen_miliknya_sendiri(): void
    {
        $transaksi = $this->buatDraft();

        // Hanya foto petani -- empat dokumen Makloon Kirim lainnya belum ada.
        $this->uploadFoto($transaksi, ['foto_petani']);

        $this->submit($transaksi)
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Dokumen belum lengkap'));

        $this->assertSame('makloon_kirim', $transaksi->fresh()->current_stage);
    }

    public function test_makloon_terima_menolak_terima_sebelum_surat_jalan_dan_nota_timbang_diunggah(): void
    {
        $transaksi = $this->sampaiMakloonTerima();

        $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/terima", ['kuantum_bongkar' => 900])
            ->assertStatus(422)
            ->assertJsonPath('message', fn (string $pesan) => str_contains($pesan, 'Dokumen belum lengkap'));

        $this->assertSame('makloon_terima', $transaksi->fresh()->current_stage);
    }

    public function test_makloon_terima_menerima_setelah_dokumennya_lengkap(): void
    {
        $transaksi = $this->sampaiMakloonTerima();

        $this->uploadFoto($transaksi, self::FOTO_TERIMA);

        $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/terima", ['kuantum_bongkar' => 900])
            ->assertOk();

        $transaksi->refresh();
        $this->assertSame('ub_jastasma', $transaksi->current_stage);

        $mpp = DataMakloonMpp::where('transaksi_id', $transaksi->id_transaksi)->first();
        $this->assertSame('diterima', $mpp->status);
        $this->assertNotNull($mpp->locked_at);
        $this->assertEquals(900, $mpp->kuantum_bongkar);
    }

    private function buatDraft(): Transaksi
    {
        Sanctum::actingAs($this->makloon);

        $transaksi = Transaksi::findOrFail(
            $this->postJson('/api/transaksi')->assertCreated()->json('data.id_transaksi')
        );

        $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('draft'))->assertOk();

        return $transaksi;
    }

    private function sampaiMakloonTerima(): Transaksi
    {
        $transaksi = $this->buatDraft();
        $this->uploadFoto($transaksi, self::FOTO_KIRIM);
        $this->submit($transaksi)->assertOk();

        return $transaksi;
    }

    private function submit(Transaksi $transaksi)
    {
        return $this->patchJson("/api/transaksi/{$transaksi->id_transaksi}/makloon", $this->dataMpp('submit'));
    }

    private function uploadFoto(Transaksi $transaksi, array $jenis): void
    {
        foreach ($jenis as $item) {
            $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/foto", [
                'jenis_foto' => $item,
                'foto' => File::image("{$item}.jpg"),
            ])->assertCreated();
        }
    }

    private function dataMpp(string $aksi): array
    {
        return [
            'aksi' => $aksi,
            'id_pemasok' => 'PEMASOK-MPP',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 UJI',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => '2026-07-30',
            'kuantum' => 1000,
            'jarak_ke_makloon_km' => 5,
        ];
    }
}
