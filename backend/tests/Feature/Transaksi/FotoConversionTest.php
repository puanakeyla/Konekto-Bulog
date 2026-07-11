<?php

namespace Tests\Feature\Transaksi;

use App\Models\DataJemputPangan;
use App\Models\Role;
use App\Models\User;
use App\Services\Transaksi\FotoUploadService;
use App\Services\Transaksi\TransaksiStageService;
use Database\Seeders\RoleSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Testing\File;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Spatie\MediaLibrary\Conversions\Jobs\PerformConversionsJob;
use Tests\TestCase;

class FotoConversionTest extends TestCase
{
    use RefreshDatabase;

    private TransaksiStageService $stageService;

    private FotoUploadService $fotoService;

    private User $jemputPangan;

    private User $makloon;

    protected function setUp(): void
    {
        parent::setUp();

        Storage::fake('foto-transaksi');

        $this->seed(RoleSeeder::class);

        $this->stageService = app(TransaksiStageService::class);
        $this->fotoService = app(FotoUploadService::class);

        $this->jemputPangan = $this->buatUser('jemput_pangan');
        $this->makloon = $this->buatUser('makloon');
    }

    public function test_upload_menjadwalkan_konversi_ke_queue_bukan_langsung(): void
    {
        Queue::fake();

        $transaksi = $this->buatTransaksiTjp();

        $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg', 800, 600));

        Queue::assertPushed(PerformConversionsJob::class);
    }

    public function test_setelah_queue_diproses_thumbnail_300px_tersedia(): void
    {
        config(['queue.default' => 'sync']);

        $transaksi = $this->buatTransaksiTjp();

        $media = $this->fotoService->upload($transaksi, $this->jemputPangan, 'foto_petani', File::image('petani.jpg', 800, 600));
        $media = $media->fresh();

        $this->assertTrue($media->hasGeneratedConversion('thumb'));

        $thumbPath = $media->getPath('thumb');
        $this->assertFileExists($thumbPath);

        [$thumbWidth] = getimagesize($thumbPath);
        $this->assertLessThanOrEqual(300, $thumbWidth);
    }

    private function buatUser(string $role): User
    {
        return User::create([
            'username' => $role.'_'.uniqid(),
            'password' => bcrypt('secret'),
            'role_id' => Role::where('nama_role', $role)->value('id'),
        ]);
    }

    private function buatTransaksiTjp()
    {
        $transaksi = $this->stageService->createTransaksi($this->jemputPangan);

        $this->stageService->submitStage($transaksi, $this->jemputPangan, 'jemput_pangan', DataJemputPangan::class, [
            'id_pemasok' => 'PEMASOK-CONV',
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
