<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\DataMakloonMpp;
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
use Symfony\Component\HttpKernel\Exception\HttpException;
use Tests\TestCase;

class FotoUploadTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private FotoUploadService $fotoService;

    private User $jemputPangan;

    private User $makloon;

    private User $ubJastasma;

    private User $keuangan;

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
        $this->keuangan = $this->buatUser('keuangan');
        $this->admin = $this->buatUser('admin');
    }

    public function test_jemput_pangan_berhasil_upload_foto_petani(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        $media = $this->fotoService->upload(
            $transaksi,
            $this->jemputPangan,
            'foto_petani',
            File::image('petani.jpg')
        );

        $this->assertSame('foto_petani', $media->collection_name);
        $this->assertSame('foto-transaksi', $media->disk);
    }

    public function test_upload_menolak_file_bukan_jpeg_atau_png(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        $this->expectException(HttpException::class);

        $this->fotoService->upload(
            $transaksi,
            $this->jemputPangan,
            'foto_petani',
            File::create('dokumen.pdf', 100, 'application/pdf')
        );
    }

    public function test_upload_menolak_file_lebih_dari_5mb(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        $this->expectException(HttpException::class);

        $this->fotoService->upload(
            $transaksi,
            $this->jemputPangan,
            'foto_petani',
            File::image('besar.jpg')->size(6000)
        );
    }

    public function test_upload_menolak_jenis_foto_yang_tidak_dikenal_untuk_model(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        $this->expectException(HttpException::class);

        $this->fotoService->upload(
            $transaksi,
            $this->jemputPangan,
            'foto_yang_tidak_ada',
            File::image('x.jpg')
        );
    }

    public function test_upload_menolak_role_yang_tidak_punya_data_di_transaksi_ini(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        $this->expectException(HttpException::class);

        $this->fotoService->upload(
            $transaksi,
            $this->keuangan,
            'foto_petani',
            File::image('x.jpg')
        );
    }

    public function test_upload_menolak_setelah_record_terkunci(): void
    {
        $transaksi = $this->buatTransaksiTjp();
        $this->stageService->terima($transaksi->fresh(), $this->makloon);

        $this->expectException(HttpException::class);

        $this->fotoService->upload(
            $transaksi->fresh(),
            $this->jemputPangan,
            'foto_petani',
            File::image('x.jpg')
        );
    }

    public function test_upload_ulang_ke_collection_yang_sama_mengganti_bukan_menumpuk(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('a.jpg'));
        $this->fotoService->upload($transaksi->fresh(), $this->jemputPangan, 'foto_petani', File::image('b.jpg'));

        $record = DataJemputPangan::where('transaksi_id', $transaksi->id_transaksi)->first();

        $this->assertCount(1, $record->getMedia('foto_petani'));
    }

    public function test_admin_bisa_upload_dengan_role_override(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        $media = $this->fotoService->upload(
            $transaksi,
            $this->admin,
            'foto_petani',
            File::image('x.jpg'),
            'jemput_pangan'
        );

        $this->assertSame('foto_petani', $media->collection_name);
    }

    public function test_makloon_mpp_upload_ke_model_yang_benar(): void
    {
        $transaksi = $this->stageService->createTransaksi($this->makloon);

        $this->stageService->submitStage($transaksi, $this->makloon, 'makloon', DataMakloonMpp::class, [
            'id_pemasok' => 'PEMASOK-MPP-FOTO',
            'supir' => 'Supir',
            'plat_mobil' => 'B 2 XYZ',
            'desa' => 'Desa',
            'kecamatan' => 'Kecamatan',
            'kabupaten' => 'Kabupaten',
            'tanggal_bongkar' => '2026-07-11',
            'kuantum' => 80,
            'jarak_ke_makloon_km' => 4,
        ]);

        $media = $this->fotoService->upload(
            $transaksi->fresh(),
            $this->makloon,
            'foto_nota_timbang',
            File::image('nota.jpg')
        );

        $this->assertInstanceOf(DataMakloonMpp::class, $media->model);
    }

    public function test_post_foto_via_http_sukses(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        Sanctum::actingAs($this->jemputPangan);

        $response = $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/foto", [
            'jenis_foto' => 'foto_petani',
            'foto' => File::image('petani.jpg'),
        ]);

        $response->assertCreated();
        $response->assertJsonPath('data.collection_name', 'foto_petani');
    }

    public function test_post_foto_via_http_ditolak_untuk_file_bukan_gambar(): void
    {
        $transaksi = $this->buatTransaksiTjp();

        Sanctum::actingAs($this->jemputPangan);

        $response = $this->postJson("/api/transaksi/{$transaksi->id_transaksi}/foto", [
            'jenis_foto' => 'foto_petani',
            'foto' => File::create('dokumen.pdf', 100, 'application/pdf'),
        ]);

        $response->assertStatus(422);
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
            'id_pemasok' => 'PEMASOK-FOTO',
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
