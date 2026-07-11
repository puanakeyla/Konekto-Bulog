<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
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

class FotoStreamTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private FotoUploadService $fotoService;

    private User $jemputPangan;

    private User $makloon;

    private User $ubJastasma;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('foto-transaksi');

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->fotoService = app(FotoUploadService::class);

        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->makloon = $this->buatUser('makloon');
        $this->ubJastasma = $this->buatUser('ub_jastasma');
        $this->admin = $this->buatUser('admin');
    }

    public function test_link_foto_biasa_bisa_diminta_role_manapun_yang_login(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg'));

        Sanctum::actingAs($this->ubJastasma);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_petani");

        $response->assertOk();
        $this->assertStringContainsString('signature=', $response->json('url'));
    }

    public function test_link_foto_surat_jalan_jp_ditolak_untuk_ub_jastasma(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_surat_jalan', File::image('sj.jpg'));

        Sanctum::actingAs($this->ubJastasma);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_surat_jalan");

        $response->assertForbidden();
    }

    public function test_link_foto_surat_jalan_jp_diizinkan_untuk_makloon_dan_admin(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_surat_jalan', File::image('sj.jpg'));

        Sanctum::actingAs($this->makloon);
        $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_surat_jalan")->assertOk();

        Sanctum::actingAs($this->admin);
        $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_surat_jalan")->assertOk();
    }

    public function test_foto_surat_jalan_paraf_makloon_tjp_tidak_ikut_dibatasi(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->stageService->terima($transaksi->fresh(), $this->makloon);
        $this->stageService->submitStage($transaksi->fresh(), $this->makloon, 'makloon', \App\Models\DataMakloonTjp::class, [
            'tanggal_bongkar' => '2026-07-11',
            'kuantum_bongkar' => 90,
        ]);
        $this->fotoService->upload($transaksi->fresh(), $this->makloon, 'foto_surat_jalan_paraf', File::image('sjp.jpg'));

        Sanctum::actingAs($this->ubJastasma);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_surat_jalan_paraf");

        $response->assertOk();
    }

    public function test_link_mengembalikan_404_jika_foto_belum_diupload(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        Sanctum::actingAs($this->jemputPangan);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_petani");

        $response->assertNotFound();
    }

    public function test_signed_url_bisa_dipakai_untuk_stream_file_tanpa_login(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg'));

        Sanctum::actingAs($this->jemputPangan);
        $url = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_petani")->json('url');

        $path = parse_url($url, PHP_URL_PATH).'?'.parse_url($url, PHP_URL_QUERY);

        // request baru tanpa auth sama sekali -- signature saja yang jadi otorisasi
        $response = $this->get($path);

        $response->assertOk();
        $this->assertSame('image/jpeg', $response->headers->get('Content-Type'));
    }

    public function test_signed_url_yang_dimanipulasi_ditolak(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg'));

        Sanctum::actingAs($this->jemputPangan);
        $url = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_petani")->json('url');

        $tampered = str_replace('expires=', 'expires=9', $url);
        $path = parse_url($tampered, PHP_URL_PATH).'?'.parse_url($tampered, PHP_URL_QUERY);

        $response = $this->get($path);

        $response->assertForbidden();
    }

    public function test_link_bisa_minta_konversi_thumb(): void
    {
        config(['queue.default' => 'sync']);

        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg', 800, 600));

        Sanctum::actingAs($this->jemputPangan);
        $url = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_petani?conversion=thumb")->json('url');

        $path = parse_url($url, PHP_URL_PATH).'?'.parse_url($url, PHP_URL_QUERY);
        $response = $this->get($path);

        $response->assertOk();
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function buatTransaksiTjp(): Transaksi
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-STREAM',
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

        return $transaksi->fresh();
    }
}
