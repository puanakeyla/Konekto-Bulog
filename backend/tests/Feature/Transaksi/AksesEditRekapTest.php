<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonTjp;
use App\Models\DataPengadaan;
use App\Models\PoDetail;
use App\Models\Role;
use App\Models\Transaksi;
use App\Models\User;
use App\Services\Transaksi\FotoUploadService;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Testing\File;
use Illuminate\Support\Facades\Storage;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

/**
 * Akses edit rekap sementara: admin membukanya per user di Kelola User, user memperbaiki
 * HANYA blok data milik role-nya di transaksi yang dia tangani, lalu akses tertutup sendiri.
 */
class AksesEditRekapTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private User $jemputPangan;

    private User $makloon;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('foto-transaksi');
        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->makloon = $this->buatUser('makloon');
        $this->admin = $this->buatUser('admin');
    }

    public function test_tanpa_akses_dibuka_user_ditolak(): void
    {
        $transaksi = $this->buatTjpTerkunci();

        Sanctum::actingAs($this->jemputPangan);

        $this->patchJson($this->urlRekap($transaksi), [
            'data_jemput_pangan' => ['supir' => 'Supir Baru'],
        ])->assertForbidden();

        $this->assertSame('Supir', $transaksi->dataJemputPangan->fresh()->supir);
    }

    public function test_user_berakses_bisa_memperbaiki_blok_miliknya(): void
    {
        $transaksi = $this->buatTjpTerkunci();
        $this->bukaAkses($this->jemputPangan);

        Sanctum::actingAs($this->jemputPangan);

        $this->patchJson($this->urlRekap($transaksi), [
            'data_jemput_pangan' => ['supir' => 'Supir Baru'],
        ])->assertOk();

        $this->assertSame('Supir Baru', $transaksi->dataJemputPangan->fresh()->supir);
    }

    public function test_akses_tertutup_sendiri_setelah_satu_kali_simpan(): void
    {
        $transaksi = $this->buatTjpTerkunci();
        $this->bukaAkses($this->jemputPangan);

        Sanctum::actingAs($this->jemputPangan);

        $this->patchJson($this->urlRekap($transaksi), [
            'data_jemput_pangan' => ['supir' => 'Sekali'],
        ])->assertOk();

        $this->assertNull($this->jemputPangan->fresh()->akses_edit_dibuka_at);

        // Percobaan kedua harus ditolak, buktinya nilai lama bertahan.
        $this->patchJson($this->urlRekap($transaksi), [
            'data_jemput_pangan' => ['supir' => 'Dua Kali'],
        ])->assertForbidden();

        $this->assertSame('Sekali', $transaksi->dataJemputPangan->fresh()->supir);
    }

    public function test_field_milik_role_lain_diabaikan(): void
    {
        $transaksi = $this->buatTjpTerkunci();
        $this->bukaAkses($this->jemputPangan);

        Sanctum::actingAs($this->jemputPangan);

        // Payload dirakit manual menyertakan blok Makloon -- harus disaring backend.
        $this->patchJson($this->urlRekap($transaksi), [
            'data_jemput_pangan' => ['supir' => 'Supir Baru'],
            'data_makloon_tjp' => ['kuantum_bongkar' => 999],
        ])->assertOk();

        $this->assertSame('Supir Baru', $transaksi->dataJemputPangan->fresh()->supir);
        $this->assertEquals(90, $transaksi->dataMakloonTjp->fresh()->kuantum_bongkar);
    }

    public function test_hanya_blok_role_lain_yang_dikirim_ditolak(): void
    {
        $transaksi = $this->buatTjpTerkunci();
        $this->bukaAkses($this->jemputPangan);

        Sanctum::actingAs($this->jemputPangan);

        $this->patchJson($this->urlRekap($transaksi), [
            'data_makloon_tjp' => ['kuantum_bongkar' => 999],
        ])->assertForbidden();

        $this->assertEquals(90, $transaksi->dataMakloonTjp->fresh()->kuantum_bongkar);
        // Akses tidak boleh ikut hangus karena percobaan yang ditolak.
        $this->assertNotNull($this->jemputPangan->fresh()->akses_edit_dibuka_at);
    }

    public function test_user_berakses_tidak_bisa_menyentuh_transaksi_petugas_lain(): void
    {
        $transaksi = $this->buatTjpTerkunci();
        $jpLain = $this->buatUser('jemput_pangan');
        $this->bukaAkses($jpLain);

        Sanctum::actingAs($jpLain);

        $this->patchJson($this->urlRekap($transaksi), [
            'data_jemput_pangan' => ['supir' => 'Bukan Punya Saya'],
        ])->assertForbidden();

        $this->assertSame('Supir', $transaksi->dataJemputPangan->fresh()->supir);
    }

    public function test_admin_tetap_bisa_mengubah_semua_blok(): void
    {
        $transaksi = $this->buatTjpTerkunci();

        Sanctum::actingAs($this->admin);

        $this->patchJson($this->urlRekap($transaksi), [
            'data_jemput_pangan' => ['supir' => 'Diperbaiki Admin'],
            'data_makloon_tjp' => ['kuantum_bongkar' => 95],
        ])->assertOk();

        $this->assertSame('Diperbaiki Admin', $transaksi->dataJemputPangan->fresh()->supir);
        $this->assertEquals(95, $transaksi->dataMakloonTjp->fresh()->kuantum_bongkar);
    }

    /** Kuantum & harga selalu bilangan bulat -- penjaganya di server, bukan cuma di form. */
    public function test_kuantum_berkoma_ditolak(): void
    {
        $transaksi = $this->buatTjpTerkunci();

        Sanctum::actingAs($this->admin);

        $this->patchJson($this->urlRekap($transaksi), [
            'data_makloon_tjp' => ['kuantum_bongkar' => 90.5],
        ])->assertStatus(422);

        $this->assertEquals(90, $transaksi->dataMakloonTjp->fresh()->kuantum_bongkar);
    }

    public function test_koreksi_kuantum_ikut_menyesuaikan_total_po(): void
    {
        $transaksi = $this->buatTjpTerkunci();
        // PO berisi transaksi ini (90 kg) + satu baris lain (10 kg) supaya terlihat bahwa
        // total dihitung ulang dari seluruh anggota, bukan ditimpa nilai satu transaksi.
        $po = DataPengadaan::create([
            'tanggal_bongkar' => '2026-07-12',
            'id_pemasok' => 'PEMASOK-AKSES',
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => '100.00',
            'harga' => '6500.00',
            'total_harga' => '650000.00',
            'no_po' => 'PO-KUANTUM',
            'status' => 'proses',
        ]);
        PoDetail::create(['data_pengadaan_id' => $po->id, 'transaksi_id' => $transaksi->id_transaksi, 'kuantum_kontribusi' => '90.00']);
        PoDetail::create(['data_pengadaan_id' => $po->id, 'transaksi_id' => $this->buatTjpTerkunci()->id_transaksi, 'kuantum_kontribusi' => '10.00']);

        Sanctum::actingAs($this->admin);

        // 90 kg dikoreksi jadi 70 kg -> total PO 100 -> 80 kg, total harga ikut turun.
        $this->patchJson($this->urlRekap($transaksi), [
            'data_makloon_tjp' => ['kuantum_bongkar' => 70],
        ])->assertOk();

        $this->assertEquals(80, $po->fresh()->total_kuantum);
        $this->assertEquals(520000, $po->fresh()->total_harga);
    }

    public function test_koreksi_kuantum_dan_harga_sekaligus_konsisten(): void
    {
        $transaksi = $this->buatTjpTerkunci();
        $po = DataPengadaan::create([
            'tanggal_bongkar' => '2026-07-12',
            'id_pemasok' => 'PEMASOK-AKSES',
            'makloon_user_id' => $this->makloon->id,
            'total_kuantum' => '90.00',
            'harga' => '6500.00',
            'total_harga' => '585000.00',
            'no_po' => 'PO-KUANTUM-HARGA',
            'status' => 'proses',
        ]);
        PoDetail::create(['data_pengadaan_id' => $po->id, 'transaksi_id' => $transaksi->id_transaksi, 'kuantum_kontribusi' => '90.00']);

        Sanctum::actingAs($this->admin);

        $this->patchJson($this->urlRekap($transaksi), [
            'data_makloon_tjp' => ['kuantum_bongkar' => 50],
            'data_pengadaan' => ['harga' => 7000],
        ])->assertOk();

        $this->assertEquals(50, $po->fresh()->total_kuantum);
        $this->assertEquals(350000, $po->fresh()->total_harga);
    }

    public function test_user_berakses_bisa_mengganti_fotonya_walau_tahap_terkunci(): void
    {
        $transaksi = $this->buatTjpTerkunci();
        $this->bukaAkses($this->jemputPangan);

        $media = app(FotoUploadService::class)->upload(
            $transaksi->fresh(),
            $this->jemputPangan->fresh(),
            'foto_petani',
            File::image('perbaikan.jpg')
        );

        $this->assertSame('foto_petani', $media->collection_name);
    }

    public function test_admin_membuka_lalu_mengunci_akses_lewat_kelola_user(): void
    {
        Sanctum::actingAs($this->admin);

        $this->patchJson("/api/admin/users/{$this->jemputPangan->id}/akses-edit", ['buka' => true])
            ->assertOk();
        $this->assertNotNull($this->jemputPangan->fresh()->akses_edit_dibuka_at);

        $this->patchJson("/api/admin/users/{$this->jemputPangan->id}/akses-edit", ['buka' => false])
            ->assertOk();
        $this->assertNull($this->jemputPangan->fresh()->akses_edit_dibuka_at);
    }

    public function test_non_admin_tidak_bisa_membuka_akses_untuk_siapa_pun(): void
    {
        Sanctum::actingAs($this->makloon);

        $this->patchJson("/api/admin/users/{$this->jemputPangan->id}/akses-edit", ['buka' => true])
            ->assertForbidden();

        $this->assertNull($this->jemputPangan->fresh()->akses_edit_dibuka_at);
    }

    private function bukaAkses(User $user): void
    {
        $user->update(['akses_edit_dibuka_at' => now()]);
    }

    private function urlRekap(Transaksi $transaksi): string
    {
        return "/api/transaksi/{$transaksi->id_transaksi}/admin-rekap";
    }

    /** TJP yang tahap JP dan Makloon-nya sudah terkunci, dibuat oleh $this->jemputPangan. */
    private function buatTjpTerkunci(): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-AKSES',
            'supir' => 'Supir',
            'plat_mobil' => 'B 1 XYZ',
            'nama_poktan_gapoktan' => 'Poktan',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'makloon_user_id' => $this->makloon->id,
            'tanggal_kirim' => '2026-07-11',
            'kuantum' => 100,
            'jarak_ke_makloon_km' => 5,
        ]);

        $this->stageService->terima($transaksi->fresh(), $this->makloon);

        $this->stageService->submitStage($transaksi->fresh(), $this->makloon, 'makloon', DataMakloonTjp::class, [
            'tanggal_bongkar' => '2026-07-12',
            'kuantum_bongkar' => 90,
        ]);

        return $transaksi->fresh();
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
