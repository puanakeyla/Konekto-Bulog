<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonTjp;
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

class FotoIndexTest extends TestCase
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

    public function test_index_mengembalikan_foto_yang_sudah_diupload(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg'));
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_gabah', File::image('gabah.jpg'));

        Sanctum::actingAs($this->jemputPangan);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto");

        $response->assertOk();
        $jenis = collect($response->json('data'))->pluck('jenis_foto')->all();
        $this->assertContains('foto_petani', $jenis);
        $this->assertContains('foto_gabah', $jenis);
        $this->assertCount(2, $jenis);
    }

    public function test_index_tidak_menampilkan_slot_yang_belum_diupload(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        Sanctum::actingAs($this->jemputPangan);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto");

        $response->assertOk()->assertJson(['data' => []]);
    }

    public function test_index_menyembunyikan_foto_surat_jalan_jp_dari_ub_jastasma(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg'));
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_surat_jalan', File::image('sj.jpg'));

        Sanctum::actingAs($this->ubJastasma);
        $response = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto");

        $response->assertOk();
        $jenis = collect($response->json('data'))->pluck('jenis_foto')->all();
        $this->assertContains('foto_petani', $jenis);
        $this->assertNotContains('foto_surat_jalan', $jenis);
    }

    public function test_index_menampilkan_foto_surat_jalan_jp_untuk_makloon_dan_admin(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_surat_jalan', File::image('sj.jpg'));

        foreach ([$this->makloon, $this->admin] as $viewer) {
            Sanctum::actingAs($viewer);
            $jenis = collect($this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto")->json('data'))
                ->pluck('jenis_foto')->all();
            $this->assertContains('foto_surat_jalan', $jenis);
        }
    }

    public function test_foto_surat_jalan_paraf_makloon_ikut_di_index_dengan_role_makloon(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->stageService->terima($transaksi->fresh(), $this->makloon);
        $this->stageService->submitStage($transaksi->fresh(), $this->makloon, 'makloon', DataMakloonTjp::class, [
            'tanggal_bongkar' => '2026-07-11',
            'kuantum_bongkar' => 90,
        ]);
        $this->fotoService->upload($transaksi->fresh(), $this->makloon, 'foto_surat_jalan_paraf', File::image('sjp.jpg'));

        Sanctum::actingAs($this->ubJastasma);
        $item = collect($this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto")->json('data'))
            ->firstWhere('jenis_foto', 'foto_surat_jalan_paraf');

        $this->assertNotNull($item);
        $this->assertSame('makloon', $item['role']);
    }

    public function test_link_download_menghasilkan_stream_sebagai_attachment(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg'));

        Sanctum::actingAs($this->jemputPangan);
        $url = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_petani?download=1")->json('url');

        $path = parse_url($url, PHP_URL_PATH).'?'.parse_url($url, PHP_URL_QUERY);
        $response = $this->get($path);

        $response->assertOk();
        $disposition = (string) $response->headers->get('Content-Disposition');
        $this->assertStringContainsString('attachment', $disposition);
        // id_transaksi mengandung "/" -> disanitasi jadi "-" pada nama file unduhan.
        $namaAman = str_replace('/', '-', $transaksi->id_transaksi);
        $this->assertStringContainsString("{$namaAman}-foto_petani", $disposition);
    }

    public function test_link_tanpa_download_tetap_inline(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg'));

        Sanctum::actingAs($this->jemputPangan);
        $url = $this->getJson("/api/transaksi/{$transaksi->id_transaksi}/foto/foto_petani")->json('url');

        $path = parse_url($url, PHP_URL_PATH).'?'.parse_url($url, PHP_URL_QUERY);
        $response = $this->get($path);

        $response->assertOk();
        $this->assertStringNotContainsString('attachment', (string) $response->headers->get('Content-Disposition'));
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
            'id_pemasok' => 'PEMASOK-INDEX',
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
